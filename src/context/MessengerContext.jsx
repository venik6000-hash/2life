import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { MsgSocket } from "../utils/websocket";
import {
  setupIdentityKeys, recoverIdentityKeys,
  generateChatKey, exportPublicKeyJwk, exportPrivateKeyJwk, importPublicKeyJwk,
  wrapChatKeyForParticipant, unwrapChatKey,
  rewrapPrivateKey,
  encryptMessage, decryptMessage,
  encryptFile, decryptFile,
} from "../utils/crypto";
import { consumePendingPassword } from "../utils/cryptoSession";

const MessengerContext = createContext(null);

export function MessengerProvider({ children }) {
  const { token, user, authFetch } = useAuth();

  // ── Crypto state ───────────────────────────────────────────────────────────
  const [cryptoReady, setCryptoReady]     = useState(false);
  const [cryptoError, setCryptoError]     = useState(null);
  const identityKeyRef = useRef(null);       // { privateKey, publicKey }
  const chatKeysRef    = useRef(new Map());  // chatId -> CryptoKey

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [chats, setChats]               = useState([]);  // enriched chat objects
  const [chatsLoaded, setChatsLoaded]   = useState(false);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages]         = useState({});  // { [chatId]: Message[] }
  const [wsConnected, setWsConnected]   = useState(false);

  const wsRef = useRef(null);
  const chatKeyRepairInFlightRef = useRef(new Map()); // chatId -> Promise<CryptoKey|null>
  const chatKeyRepairFailedRef = useRef(new Set());   // chatId that already failed repair attempt
  const normalizeChatList = useCallback((items = []) => {
    // Product requirement: 1 chat per client.
    // If duplicates exist in DB, keep the newest one (items come ordered DESC by id).
    const byClient = new Map();
    for (const chat of items) {
      const key = chat.client_id || `chat-${chat.id}`;
      if (!byClient.has(key)) byClient.set(key, chat);
    }
    return Array.from(byClient.values());
  }, []);

  const generateImageThumbnail = useCallback(async (blobLike, maxSide = 320, quality = 0.72) => {
    try {
      if (!blobLike) return null;
      const blob = blobLike instanceof Blob ? blobLike : new Blob([blobLike], { type: "application/octet-stream" });
      const mimeType = String(blob.type || "");
      if (!mimeType.startsWith("image/")) return null;

      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.decoding = "async";

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = objectUrl;
      });

      const srcW = Number(img.naturalWidth || img.width || 0);
      const srcH = Number(img.naturalHeight || img.height || 0);
      if (!srcW || !srcH) {
        URL.revokeObjectURL(objectUrl);
        return null;
      }

      const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
      const w = Math.max(1, Math.round(srcW * scale));
      const h = Math.max(1, Math.round(srcH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        return null;
      }
      ctx.drawImage(img, 0, 0, w, h);

      let dataUrl = "";
      try {
        dataUrl = canvas.toDataURL("image/webp", quality);
      } catch {
        dataUrl = "";
      }
      if (!dataUrl || dataUrl === "data:,") {
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }

      URL.revokeObjectURL(objectUrl);
      return dataUrl && dataUrl !== "data:," ? dataUrl : null;
    } catch {
      return null;
    }
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getTicket = useCallback(async () => {
    const res  = await authFetch("/api/auth/ws-ticket", { method: "POST" });
    const data = await res.json();
    if (!data.ticket) throw new Error("Не удалось получить WS-тикет");
    return data.ticket;
  }, [authFetch]);

  // Fetch another user's public key (cached in a module-level map to avoid repeat requests)
  const publicKeyCache = useRef(new Map());
  const getPublicKey = useCallback(async (userId) => {
    if (publicKeyCache.current.has(userId)) return publicKeyCache.current.get(userId);
    const res  = await authFetch(`/api/crypto/keys/${userId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const key  = await importPublicKeyJwk(data.publicKeyJwk);
    publicKeyCache.current.set(userId, key);
    return key;
  }, [authFetch]);

  const parseWrappedChatKey = useCallback((rawWrappedKey, fallbackWrappedBy) => {
    let wrappedKey = rawWrappedKey;
    let wrappedBy = fallbackWrappedBy;
    try {
      const parsed = JSON.parse(rawWrappedKey);
      if (parsed?.key) {
        wrappedKey = parsed.key;
        wrappedBy = parsed.wrappedBy ?? wrappedBy;
      }
    } catch {
      // keep plain base64 value
    }
    return { wrappedKey, wrappedBy };
  }, []);

  const backfillOwnChatKey = useCallback(async (chatId, chatKey) => {
    if (!chatId || !chatKey || !identityKeyRef.current || !user?.id) return;
    const wrappedForSelf = await wrapChatKeyForParticipant(
      identityKeyRef.current.privateKey,
      identityKeyRef.current.publicKey,
      chatKey
    );
    const encryptedChatKey = JSON.stringify({ wrappedBy: user.id, key: wrappedForSelf });

    const res = await authFetch(`/api/chats/${chatId}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, encryptedChatKey }),
    });
    if (!res.ok) return false;

    setChats((prev) => prev.map((c) => {
      if (c.id !== chatId) return c;
      const participants = Array.isArray(c.participants) ? c.participants : [];
      return {
        ...c,
        participants: participants.map((p) => (
          p.user_id === user.id ? { ...p, encrypted_chat_key: encryptedChatKey } : p
        )),
      };
    }));
    return true;
  }, [authFetch, user?.id]);

  const repairChatKeyAsOwner = useCallback(async (chat) => {
    const chatId = chat?.id;
    if (!chatId || !identityKeyRef.current || !user?.id) return null;
    if (chatKeyRepairFailedRef.current.has(chatId)) return null;

    const roleInChat = String(chat?.role_in_chat || "");
    const canRepair = roleInChat === "owner" || user?.role === "admin";
    if (!canRepair) return null;

    if (chatKeyRepairInFlightRef.current.has(chatId)) {
      return chatKeyRepairInFlightRef.current.get(chatId);
    }

    const repairPromise = (async () => {
      const participants = Array.isArray(chat?.participants) ? chat.participants : [];
      if (participants.length === 0) return null;

      const nextChatKey = await generateChatKey();
      const patchedKeysByUser = new Map();
      let selfPatched = false;

      for (const participant of participants) {
        const participantId = Number(participant?.user_id);
        if (!Number.isInteger(participantId) || participantId <= 0) continue;

        const participantPublicKey = await getPublicKey(participantId);
        if (!participantPublicKey) continue;

        const wrappedKey = await wrapChatKeyForParticipant(
          identityKeyRef.current.privateKey,
          participantPublicKey,
          nextChatKey
        );
        const encryptedChatKey = JSON.stringify({ wrappedBy: user.id, key: wrappedKey });

        const res = await authFetch(`/api/chats/${chatId}/participants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: participantId, encryptedChatKey }),
        });
        if (!res.ok) continue;

        patchedKeysByUser.set(participantId, encryptedChatKey);
        if (participantId === user.id) selfPatched = true;
      }

      if (!selfPatched) {
        chatKeyRepairFailedRef.current.add(chatId);
        return null;
      }

      setChats((prev) => prev.map((c) => {
        if (c.id !== chatId) return c;
        const currentParticipants = Array.isArray(c.participants) ? c.participants : [];
        return {
          ...c,
          participants: currentParticipants.map((p) => (
            patchedKeysByUser.has(p.user_id)
              ? { ...p, encrypted_chat_key: patchedKeysByUser.get(p.user_id) }
              : p
          )),
        };
      }));

      chatKeyRepairFailedRef.current.delete(chatId);
      return nextChatKey;
    })()
      .catch(() => {
        chatKeyRepairFailedRef.current.add(chatId);
        return null;
      })
      .finally(() => {
        chatKeyRepairInFlightRef.current.delete(chatId);
      });

    chatKeyRepairInFlightRef.current.set(chatId, repairPromise);
    return repairPromise;
  }, [authFetch, getPublicKey, user?.id, user?.role]);

  // ── Crypto setup ───────────────────────────────────────────────────────────

  const unlockCrypto = useCallback(async (password) => {
    setCryptoError(null);
    try {
      const res  = await authFetch("/api/crypto/keys");
      const data = await res.json();

      let keyPair;
      if (data.keys) {
        // Recover existing key pair using password
        const { keyPair: kp } = await recoverIdentityKeys(password, data.keys);
        keyPair = kp;

        // Backfill recovery bundle once, so admin password resets can keep chat history.
        if (!data.recoveryReady || !data.keys.public_key_jwk) {
          try {
            const restoredPublicKeyJwk = await exportPublicKeyJwk(kp.publicKey);
            await authFetch("/api/crypto/keys", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                publicKeyJwk: restoredPublicKeyJwk,
                encryptedPrivateKeyJwk: data.keys.encrypted_private_key_jwk,
                keyDerivationSalt: data.keys.key_derivation_salt,
                keyDerivationIv: data.keys.key_derivation_iv,
                privateKeyJwk: await exportPrivateKeyJwk(kp.privateKey),
              }),
            });
          } catch (_) { /* non-blocking */ }
        }
      } else {
        // First time — generate new identity key pair and store on server
        const bundle = await setupIdentityKeys(password);
        await authFetch("/api/crypto/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKeyJwk:          bundle.publicKeyJwk,
            encryptedPrivateKeyJwk: bundle.encryptedPrivateKeyJwk,
            keyDerivationSalt:     bundle.keyDerivationSalt,
            keyDerivationIv:       bundle.keyDerivationIv,
            privateKeyJwk:         bundle.privateKeyJwk,
          }),
        });
        keyPair = bundle.keyPair;
      }

      identityKeyRef.current = keyPair;
      // Cache own public key
      publicKeyCache.current.set(user.id, keyPair.publicKey);
      setCryptoReady(true);
    } catch (e) {
      setCryptoError(e.message || "Ошибка разблокировки ключей");
    }
  }, [authFetch, user?.id]);

  // Try auto-unlock with password passed from LoginScreen
  useEffect(() => {
    if (!token || !user) return;
    const pw = consumePendingPassword();
    if (pw) unlockCrypto(pw);
  }, [token, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (token && user) return;
    setChats([]);
    setChatsLoaded(false);
    setActiveChatId(null);
    setMessages({});
  }, [token, user?.id]);

  // ── Chat key resolution ────────────────────────────────────────────────────

  const getChatKey = useCallback(async (chat) => {
    const { id: chatId } = chat;
    if (chatKeysRef.current.has(chatId)) return chatKeysRef.current.get(chatId);
    if (!identityKeyRef.current) return null;

    // Find own participant record
    const myParticipant = (chat.participants || []).find((p) => p.user_id === user.id);
    if (!myParticipant?.encrypted_chat_key) {
      // Self-heal legacy chats where own wrapped key is empty:
      // try to derive the same shared secret from participant entries wrapped by current user.
      for (const participant of (chat.participants || [])) {
        if (!participant || participant.user_id === user.id || !participant.encrypted_chat_key) continue;
        try {
          const { wrappedKey, wrappedBy } = parseWrappedChatKey(participant.encrypted_chat_key, chat.created_by);
          if (!wrappedKey || Number(wrappedBy) !== Number(user.id)) continue;
          const participantPublicKey = await getPublicKey(participant.user_id);
          if (!participantPublicKey) continue;
          const recoveredChatKey = await unwrapChatKey(
            identityKeyRef.current.privateKey,
            participantPublicKey,
            wrappedKey
          );
          chatKeysRef.current.set(chatId, recoveredChatKey);
          try { await backfillOwnChatKey(chatId, recoveredChatKey); } catch { /* non-blocking */ }
          return recoveredChatKey;
        } catch {
          // try next participant
        }
      }
      const repairedChatKey = await repairChatKeyAsOwner(chat);
      if (repairedChatKey) {
        chatKeysRef.current.set(chatId, repairedChatKey);
        return repairedChatKey;
      }
      return null;
    }

    try {
      const { wrappedKey, wrappedBy } = parseWrappedChatKey(myParticipant.encrypted_chat_key, chat.created_by);

      const senderPublicKey = await getPublicKey(wrappedBy);
      if (!senderPublicKey) return null;

      const chatKey = await unwrapChatKey(identityKeyRef.current.privateKey, senderPublicKey, wrappedKey);
      chatKeysRef.current.set(chatId, chatKey);
      return chatKey;
    } catch {
      const repairedChatKey = await repairChatKeyAsOwner(chat);
      if (repairedChatKey) {
        chatKeysRef.current.set(chatId, repairedChatKey);
        return repairedChatKey;
      }
      return null;
    }
  }, [user?.id, getPublicKey, parseWrappedChatKey, backfillOwnChatKey, repairChatKeyAsOwner]);

  // ── Decrypt messages ───────────────────────────────────────────────────────

  const decryptMsgList = useCallback(async (chat, rawMsgs) => {
    const chatKey = await getChatKey(chat);
    return Promise.all(rawMsgs.map(async (m) => {
      const plaintext = chatKey ? await decryptMessage(chatKey, m.ciphertext, m.iv) : null;
      return { ...m, text: plaintext ?? "🔒 Зашифрованное сообщение" };
    }));
  }, [getChatKey]);

  // Fetch a single chat (participants + receipts) and merge it into local state.
  // Used when WS event arrives for a chat not yet present in memory.
  const fetchChatById = useCallback(async (chatId) => {
    if (!chatId) return null;
    const res = await authFetch(`/api/chats/${chatId}`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const chat = data?.chat;
    if (!chat) return null;

    setChats((prev) => {
      if (prev.some((c) => c.id === chat.id)) {
        return prev.map((c) => (c.id === chat.id ? { ...c, ...chat } : c));
      }
      return normalizeChatList([chat, ...prev]);
    });

    return chat;
  }, [authFetch, normalizeChatList]);

  const upsertMessage = useCallback((chatId, nextMsg) => {
    setMessages((prev) => {
      const existing = prev[chatId] || [];
      const idx = existing.findIndex((m) => m.id === nextMsg.id);
      if (idx === -1) return { ...prev, [chatId]: [...existing, nextMsg] };
      const updated = [...existing];
      updated[idx] = { ...updated[idx], ...nextMsg };
      return { ...prev, [chatId]: updated };
    });
  }, []);

  const removeMessage = useCallback((chatId, messageId) => {
    setMessages((prev) => {
      const existing = prev[chatId];
      if (!existing) return prev;
      const nextList = existing.filter((m) => m.id !== messageId);
      if (nextList.length === existing.length) return prev;
      return { ...prev, [chatId]: nextList };
    });
  }, []);

  // ── WS event handling ──────────────────────────────────────────────────────

  const handleWsEvent = useCallback(async (event) => {
    switch (event.type) {

      case "new_message": {
        const msg = event.message;
        const chatId = msg.chat_id;
        // Find chat for decryption
        let chat = chats.find((c) => c.id === chatId);
        if (!chat) {
          chat = await fetchChatById(chatId);
          if (!chat) return;
        }
        const chatKey = await getChatKey(chat);
        const text = chatKey ? await decryptMessage(chatKey, msg.ciphertext, msg.iv) : "🔒 Зашифрованное сообщение";
        const decrypted = { ...msg, text };

        upsertMessage(chatId, decrypted);

        // Update unread count in chat list
        setChats((prev) => prev.map((c) =>
          c.id === chatId
            ? { ...c, _lastMsgAt: msg.created_at }
            : c
        ));
        break;
      }

      case "message_edited": {
        const { chatId, message } = event;
        if (!chatId || !message?.id) break;

        let chat = chats.find((c) => c.id === chatId);
        if (!chat) {
          chat = await fetchChatById(chatId);
          if (!chat) break;
        }

        const chatKey = await getChatKey(chat);
        const text = chatKey ? await decryptMessage(chatKey, message.ciphertext, message.iv) : "🔒 Зашифрованное сообщение";
        upsertMessage(chatId, { ...message, text });
        break;
      }

      case "message_deleted_all":
      case "message_deleted_self": {
        const { chatId, messageId } = event;
        if (chatId && messageId) removeMessage(chatId, messageId);
        break;
      }

      case "receipts_update": {
        const { chatId, receipts } = event;
        setChats((prev) => prev.map((c) =>
          c.id === chatId ? { ...c, receipts } : c
        ));
        break;
      }

      case "participant_added": {
        const { chatId, participants } = event;
        const hasChat = chats.some((c) => c.id === chatId);
        if (hasChat) {
          setChats((prev) => prev.map((c) =>
            c.id === chatId ? { ...c, participants } : c
          ));
        } else {
          await fetchChatById(chatId);
        }
        break;
      }

      case "participant_removed": {
        const { chatId, userId: removedUserId, participants } = event;
        if (removedUserId === user?.id) {
          setChats((prev) => prev.filter((c) => c.id !== chatId));
          setMessages((prev) => {
            if (!prev[chatId]) return prev;
            const next = { ...prev };
            delete next[chatId];
            return next;
          });
          setActiveChatId((prev) => (prev === chatId ? null : prev));
          break;
        }
        setChats((prev) => prev.map((c) =>
          c.id === chatId ? { ...c, participants } : c
        ));
        break;
      }

      case "chat_created": {
        const { chat } = event;
        setChats((prev) => {
          if (prev.some((c) => c.id === chat.id)) {
            return prev.map((c) => (c.id === chat.id ? { ...c, ...chat } : c));
          }
          return normalizeChatList([chat, ...prev]);
        });
        break;
      }

      case "chat_updated": {
        const nextChat = event?.chat;
        if (!nextChat?.id) break;
        setChats((prev) => prev.map((c) => (
          c.id === nextChat.id ? { ...c, ...nextChat } : c
        )));
        break;
      }

      default:
        break;
    }
  }, [chats, getChatKey, fetchChatById, normalizeChatList, removeMessage, upsertMessage, user?.id]);

  // ── WebSocket lifecycle ────────────────────────────────────────────────────

  useEffect(() => {
    if (!token || !user) return;

    const sock = new MsgSocket({
      getTicket,
      onOpen:    () => setWsConnected(true),
      onClose:   () => setWsConnected(false),
      onMessage: handleWsEvent,
    });
    wsRef.current = sock;
    sock.connect();

    return () => { sock.disconnect(); wsRef.current = null; };
  }, [token, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-attach message handler when chats change (to have fresh chat list in closure)
  useEffect(() => {
    if (wsRef.current) wsRef.current._onMessage = handleWsEvent;
  }, [handleWsEvent]);

  // ── API: load chats ────────────────────────────────────────────────────────

  const loadChats = useCallback(async (clientId) => {
    setChatsLoaded(false);
    const url = clientId ? `/api/chats?clientId=${encodeURIComponent(clientId)}` : "/api/chats";
    const res  = await authFetch(url);
    if (!res.ok) { setChatsLoaded(true); return []; }
    const data = await res.json();
    const nextChats = normalizeChatList(data.chats || []);
    setChats(nextChats);
    setActiveChatId((prev) => (
      nextChats.some((c) => c.id === prev) ? prev : (nextChats[0]?.id || null)
    ));
    setChatsLoaded(true);
    return nextChats;
  }, [authFetch, normalizeChatList]);

  // ── API: load messages ────────────────────────────────────────────────────

  const loadMessages = useCallback(async (chatId, before) => {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    const url = `/api/chats/${chatId}/messages${before ? `?before=${before}` : ""}`;
    const res  = await authFetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const decrypted = await decryptMsgList(chat, data.messages || []);

    setMessages((prev) => {
      if (before) {
        // Prepend older messages
        const existing = prev[chatId] || [];
        const ids = new Set(existing.map((m) => m.id));
        const older = decrypted.filter((m) => !ids.has(m.id));
        return { ...prev, [chatId]: [...older, ...existing] };
      }
      return { ...prev, [chatId]: decrypted };
    });
  }, [chats, authFetch, decryptMsgList]);

  // ── API: send message ─────────────────────────────────────────────────────

  const dispatchEncryptedMessage = useCallback(async (chatId, { ciphertext, iv, msgType = "text", fileId = null }) => {
    const sent = wsRef.current?.send({ type: "send_message", chatId, ciphertext, iv, msgType, fileId });
    if (sent) return true;
    const res = await authFetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ciphertext, iv, msgType, fileId }),
    });
    return res.ok;
  }, [authFetch]);

  const sendMsg = useCallback(async (chatId, text) => {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return false;

    const chatKey = await getChatKey(chat);
    if (!chatKey) return false;

    const { ciphertext, iv } = await encryptMessage(chatKey, text);
    return dispatchEncryptedMessage(chatId, { ciphertext, iv, msgType: "text" });
  }, [chats, getChatKey, dispatchEncryptedMessage]);

  // ── API: upload encrypted file ─────────────────────────────────────────────

  const uploadEncryptedBlob = useCallback(async (chatId, encryptedBuffer, originalName, mimeType) => {
    const safeName = String(originalName || "file");
    const safeType = String(mimeType || "application/octet-stream");

    const form = new FormData();
    form.append("file", new Blob([encryptedBuffer], { type: "application/octet-stream" }), `${safeName}.enc`);
    form.append("originalName", safeName);
    form.append("mimeType", safeType);

    const res = await authFetch(`/api/chats/${chatId}/files`, { method: "POST", body: form });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const fileId = data?.file?.id;
    if (!fileId) return null;
    return fileId;
  }, [authFetch]);

  const encryptAndUploadFile = useCallback(async (chatId, file, chatKey) => {
    if (!file || !chatKey) return null;

    const arrayBuffer = await file.arrayBuffer();
    const { encrypted, iv } = await encryptFile(chatKey, arrayBuffer);
    const safeName = String(file.name || "file");
    const safeType = String(file.type || "application/octet-stream");
    const size = Number(file.size) > 0 ? Number(file.size) : arrayBuffer.byteLength;
    const thumb = safeType.startsWith("image/") ? await generateImageThumbnail(file) : null;
    const fileId = await uploadEncryptedBlob(chatId, encrypted, safeName, safeType);
    if (!fileId) return null;

    return {
      fileId,
      name: safeName,
      type: safeType,
      size,
      iv,
      thumb,
      msgType: safeType.startsWith("image/") ? "image" : "file",
    };
  }, [uploadEncryptedBlob, generateImageThumbnail]);

  const sendFile = useCallback(async (chatId, file) => {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return false;
    const chatKey = await getChatKey(chat);
    if (!chatKey) return false;

    const uploaded = await encryptAndUploadFile(chatId, file, chatKey);
    if (!uploaded) return false;

    const caption = JSON.stringify({
      name: uploaded.name,
      type: uploaded.type,
      size: uploaded.size,
      iv: uploaded.iv,
      ...(uploaded.thumb ? { thumb: uploaded.thumb } : {}),
    });
    const { ciphertext, iv: msgIv } = await encryptMessage(chatKey, caption);
    return dispatchEncryptedMessage(chatId, {
      ciphertext,
      iv: msgIv,
      msgType: uploaded.msgType,
      fileId: uploaded.fileId,
    });
  }, [chats, getChatKey, encryptAndUploadFile, dispatchEncryptedMessage]);

  const sendFiles = useCallback(async (chatId, filesInput) => {
    const files = Array.from(filesInput || []).filter(Boolean);
    if (files.length === 0) return { ok: false, sent: 0, total: 0, failed: [] };

    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return { ok: false, sent: 0, total: files.length, failed: files.map((f) => f.name || "file") };
    const chatKey = await getChatKey(chat);
    if (!chatKey) return { ok: false, sent: 0, total: files.length, failed: files.map((f) => f.name || "file") };

    const uploaded = [];
    const failed = [];

    for (const file of files) {
      try {
        const item = await encryptAndUploadFile(chatId, file, chatKey);
        if (item) uploaded.push(item);
        else failed.push(file.name || "file");
      } catch {
        failed.push(file.name || "file");
      }
    }

    if (uploaded.length === 0) {
      return { ok: false, sent: 0, total: files.length, failed };
    }

    const MAX_PHOTOS_PER_BUNDLE = 10;
    const MAX_FILES_PER_BUNDLE = 10;

    const groups = [];
    let currentGroup = null;
    for (const item of uploaded) {
      const isImage = String(item?.type || "").startsWith("image/") || item?.msgType === "image";
      const kind = isImage ? "images" : "files";
      const limit = isImage ? MAX_PHOTOS_PER_BUNDLE : MAX_FILES_PER_BUNDLE;
      if (!currentGroup || currentGroup.kind !== kind || currentGroup.items.length >= limit) {
        currentGroup = { kind, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(item);
    }

    let sent = 0;
    for (const group of groups) {
      const payload = JSON.stringify({
        bundle: true,
        bundleType: group.kind,
        files: group.items.map((item) => ({
          fileId: item.fileId,
          name: item.name,
          type: item.type,
          size: item.size,
          iv: item.iv,
          ...(item.thumb ? { thumb: item.thumb } : {}),
        })),
      });
      const { ciphertext, iv } = await encryptMessage(chatKey, payload);
      const dispatched = await dispatchEncryptedMessage(chatId, { ciphertext, iv, msgType: "files_bundle", fileId: null });
      if (dispatched) {
        sent += group.items.length;
      } else {
        failed.push(...group.items.map((item) => item?.name || "file"));
      }
    }

    return {
      ok: failed.length === 0,
      sent,
      total: files.length,
      failed,
    };
  }, [chats, getChatKey, encryptAndUploadFile, dispatchEncryptedMessage]);

  // ── API: edit message ──────────────────────────────────────────────────────

  const editMsg = useCallback(async (chatId, messageId, text) => {
    const trimmed = String(text || "").trim();
    if (!trimmed) return false;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return false;

    const chatKey = await getChatKey(chat);
    if (!chatKey) return false;
    const { ciphertext, iv } = await encryptMessage(chatKey, trimmed);

    const sent = wsRef.current?.send({ type: "edit_message", chatId, messageId, ciphertext, iv });
    if (!sent) {
      const res = await authFetch(`/api/chats/${chatId}/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ciphertext, iv }),
      });
      if (!res.ok) return false;
    }

    upsertMessage(chatId, { id: messageId, text: trimmed, ciphertext, iv, edited_at: new Date().toISOString() });
    return true;
  }, [chats, getChatKey, authFetch, upsertMessage]);

  // ── API: delete message ────────────────────────────────────────────────────

  const deleteMsg = useCallback(async (chatId, messageId, scope = "all") => {
    const normalizedScope = scope === "self" ? "self" : "all";
    const sent = wsRef.current?.send({ type: "delete_message", chatId, messageId, scope: normalizedScope });
    if (!sent) {
      const res = await authFetch(`/api/chats/${chatId}/messages/${messageId}?scope=${encodeURIComponent(normalizedScope)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: normalizedScope }),
      });
      if (!res.ok) return false;
    }
    removeMessage(chatId, messageId);
    return true;
  }, [authFetch, removeMessage]);

  // ── API: forward message ───────────────────────────────────────────────────

  const forwardMsg = useCallback(async (fromChatId, messageId, toChatId) => {
    if (!fromChatId || !toChatId || fromChatId === toChatId) return false;
    const sourceChat = chats.find((c) => c.id === fromChatId);
    const targetChat = chats.find((c) => c.id === toChatId);
    if (!sourceChat || !targetChat) return false;

    const sourceMessage = (messages[fromChatId] || []).find((m) => m.id === messageId);
    if (!sourceMessage) return false;

    const targetChatKey = await getChatKey(targetChat);
    if (!targetChatKey) return false;

    if (sourceMessage.msg_type === "text") {
      const { ciphertext, iv } = await encryptMessage(targetChatKey, sourceMessage.text || "");
      return dispatchEncryptedMessage(toChatId, { ciphertext, iv, msgType: "text" });
    }

    if (sourceMessage.msg_type === "file" || sourceMessage.msg_type === "image") {
      let meta;
      try { meta = JSON.parse(sourceMessage.text || "{}"); } catch { return false; }
      if (!sourceMessage.file_id || !meta?.iv) return false;

      const sourceChatKey = await getChatKey(sourceChat);
      if (!sourceChatKey) return false;

      const encryptedRes = await authFetch(`/api/chats/${fromChatId}/files/${sourceMessage.file_id}`);
      if (!encryptedRes.ok) return false;
      const encryptedBuffer = await encryptedRes.arrayBuffer();
      const plainBuffer = await decryptFile(sourceChatKey, encryptedBuffer, meta.iv);
      if (!plainBuffer) return false;

      const { encrypted, iv: forwardedFileIv } = await encryptFile(targetChatKey, plainBuffer);
      const originalName = meta?.name || "file";
      const mimeType = meta?.type || "application/octet-stream";
      const size = Number(meta?.size) > 0 ? Number(meta.size) : plainBuffer.byteLength;

      const fileId = await uploadEncryptedBlob(toChatId, encrypted, originalName, mimeType);
      if (!fileId) return false;

      const caption = JSON.stringify({
        name: originalName,
        type: mimeType,
        size,
        iv: forwardedFileIv,
        ...(meta?.thumb ? { thumb: meta.thumb } : {}),
      });
      const { ciphertext, iv } = await encryptMessage(targetChatKey, caption);
      const msgType = mimeType.startsWith("image/") && sourceMessage.msg_type === "image" ? "image" : "file";
      return dispatchEncryptedMessage(toChatId, { ciphertext, iv, msgType, fileId });
    }

    if (sourceMessage.msg_type === "files_bundle") {
      let meta;
      try { meta = JSON.parse(sourceMessage.text || "{}"); } catch { return false; }
      const sourceItems = Array.isArray(meta?.files) ? meta.files : [];
      if (sourceItems.length === 0) return false;

      const sourceChatKey = await getChatKey(sourceChat);
      if (!sourceChatKey) return false;

      const forwardedItems = [];
      for (const item of sourceItems) {
        const sourceFileId = item?.fileId || item?.id;
        const sourceIv = item?.iv;
        if (!sourceFileId || !sourceIv) continue;

        const encryptedRes = await authFetch(`/api/chats/${fromChatId}/files/${sourceFileId}`);
        if (!encryptedRes.ok) continue;
        const encryptedBuffer = await encryptedRes.arrayBuffer();
        const plainBuffer = await decryptFile(sourceChatKey, encryptedBuffer, sourceIv);
        if (!plainBuffer) continue;

        const originalName = item?.name || "file";
        const mimeType = item?.type || "application/octet-stream";
        const size = Number(item?.size) > 0 ? Number(item.size) : plainBuffer.byteLength;
        const { encrypted, iv: forwardedIv } = await encryptFile(targetChatKey, plainBuffer);
        const fileId = await uploadEncryptedBlob(toChatId, encrypted, originalName, mimeType);
        if (!fileId) continue;

        forwardedItems.push({
          fileId,
          name: originalName,
          type: mimeType,
          size,
          iv: forwardedIv,
          ...(item?.thumb ? { thumb: item.thumb } : {}),
        });
      }

      if (forwardedItems.length === 0) return false;

      const payload = JSON.stringify({
        bundle: true,
        ...(meta?.bundleType ? { bundleType: meta.bundleType } : {}),
        files: forwardedItems,
      });
      const { ciphertext, iv } = await encryptMessage(targetChatKey, payload);
      return dispatchEncryptedMessage(toChatId, { ciphertext, iv, msgType: "files_bundle", fileId: null });
    }

    return false;
  }, [chats, messages, getChatKey, authFetch, dispatchEncryptedMessage, uploadEncryptedBlob]);

  // ── API: download + decrypt file ──────────────────────────────────────────

  const getFileUrl = useCallback(async (chatId, fileId, ivB64, mimeType) => {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return null;
    const chatKey = await getChatKey(chat);
    if (!chatKey) return null;

    const res = await authFetch(`/api/chats/${chatId}/files/${fileId}`);
    if (!res.ok) return null;
    const encryptedBuffer = await res.arrayBuffer();
    const decrypted = await decryptFile(chatKey, encryptedBuffer, ivB64);
    if (!decrypted) return null;

    const blob = new Blob([decrypted], { type: mimeType || "application/octet-stream" });
    return URL.createObjectURL(blob);
  }, [chats, getChatKey, authFetch]);

  const downloadFile = useCallback(async (chatId, fileId, ivB64, originalName, mimeType, options = {}) => {
    const forceDownloadOnly = !!options?.forceDownload;
    const url = await getFileUrl(chatId, fileId, ivB64, mimeType);
    if (!url) return false;

    const forceDownload = () => {
      const a = document.createElement("a");
      a.href = url;
      a.download = originalName || "file";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    // Try open inline for formats users usually expect to "open".
    const canOpenInline = typeof mimeType === "string" && (
      mimeType.startsWith("image/") ||
      mimeType === "application/pdf" ||
      mimeType.startsWith("text/")
    );
    if (!forceDownloadOnly && canOpenInline) {
      const popup = window.open(url, "_blank", "noopener,noreferrer");
      if (!popup) forceDownload();
    } else {
      forceDownload();
    }
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    return true;
  }, [getFileUrl]);

  const downloadFiles = useCallback(async (chatId, filesInput) => {
    const files = Array.from(filesInput || []).filter(Boolean);
    if (files.length === 0) return { ok: false, downloaded: 0, total: 0, failed: [] };

    let downloaded = 0;
    const failed = [];
    for (const file of files) {
      const fileId = file?.fileId || file?.id;
      const iv = file?.iv;
      if (!fileId || !iv) {
        failed.push(file?.name || "file");
        continue;
      }
      const ok = await downloadFile(chatId, fileId, iv, file?.name, file?.type, { forceDownload: true });
      if (ok) downloaded += 1;
      else failed.push(file?.name || "file");
    }

    return {
      ok: failed.length === 0,
      downloaded,
      total: files.length,
      failed,
    };
  }, [downloadFile]);

  // ── API: mark read ─────────────────────────────────────────────────────────

  const markRead = useCallback((chatId, messageId) => {
    if (!messageId) return;
    const sent = wsRef.current?.send({ type: "mark_read", chatId, messageId });
    if (!sent) {
      authFetch(`/api/chats/${chatId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
    }
    // Optimistically update local receipts
    setChats((prev) => prev.map((c) => {
      if (c.id !== chatId) return c;
      const receipts = (c.receipts || []).filter((r) => r.user_id !== user.id);
      receipts.push({ user_id: user.id, last_read_message_id: messageId, read_at: new Date().toISOString() });
      return { ...c, receipts };
    }));
  }, [authFetch, user?.id]);

  // ── API: create chat ──────────────────────────────────────────────────────

  const createNewChat = useCallback(async (payload, legacyTitle, legacyParticipantUserIds) => {
    if (!identityKeyRef.current) return null;
    const normalizedPayload = (
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload
        : { clientId: payload, title: legacyTitle, participantUserIds: legacyParticipantUserIds }
    );
    const {
      clientId = null,
      title = "Чат",
      icon = "",
      participantUserIds = [],
      isInternal = false,
      isPinned = false,
    } = normalizedPayload;
    const safeTitle = String(title || "").trim().slice(0, 80) || "Чат";
    const safeIcon = String(icon || "").trim().slice(0, 8);
    const wantsInternal = !!isInternal || !clientId;

    // Generate a new chat key
    const chatKey = await generateChatKey();

    // Wrap the chat key for each participant (including self)
    const allIds = Array.from(new Set([user.id, ...participantUserIds]));
    const participants = [];
    for (const uid of allIds) {
      const pubKey = await getPublicKey(uid);
      if (!pubKey) continue;
      const wrappedKey = await wrapChatKeyForParticipant(identityKeyRef.current.privateKey, pubKey, chatKey);
      const encryptedChatKey = JSON.stringify({ wrappedBy: user.id, key: wrappedKey });
      participants.push({ userId: uid, encryptedChatKey });
    }

    const res = await authFetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: wantsInternal ? null : clientId,
        title: safeTitle,
        icon: safeIcon,
        isInternal: wantsInternal,
        isPinned: !!isPinned,
        participants,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();

    // Cache the key locally
    chatKeysRef.current.set(data.chat.id, chatKey);

    setChats((prev) => {
      if (prev.some((c) => c.id === data.chat.id)) return prev;
      return normalizeChatList([data.chat, ...prev]);
    });
    return data.chat;
  }, [user?.id, authFetch, getPublicKey, normalizeChatList]);

  const updateChatSettings = useCallback(async (chatId, patch = {}) => {
    if (!chatId || !patch || typeof patch !== "object") return { ok: false, error: "Некорректные данные" };

    const body = {};
    if (Object.prototype.hasOwnProperty.call(patch, "title")) {
      body.title = String(patch.title || "").trim().slice(0, 80) || "Чат";
    }
    if (Object.prototype.hasOwnProperty.call(patch, "icon")) {
      body.icon = String(patch.icon || "").trim().slice(0, 8);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "isPinned")) {
      body.isPinned = !!patch.isPinned;
    }
    if (Object.keys(body).length === 0) return { ok: false, error: "Нет изменений" };

    const res = await authFetch(`/api/chats/${chatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.error || "Ошибка сервера" };

    if (data?.chat) {
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, ...data.chat } : c)));
    }
    return { ok: true, chat: data?.chat || null };
  }, [authFetch]);

  // ── API: add participant ──────────────────────────────────────────────────

  const addParticipant = useCallback(async (chatId, userId) => {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return "Чат не найден";
    if (!identityKeyRef.current) return "Мессенджер не разблокирован";

    const chatKey = await getChatKey(chat);
    if (!chatKey) return "Не удалось получить ключ чата";

    // Participant must have set up their E2E keys at least once
    const theirPub = await getPublicKey(userId);
    if (!theirPub) return "no_key";

    const wrappedKey = await wrapChatKeyForParticipant(identityKeyRef.current.privateKey, theirPub, chatKey);
    const encryptedChatKey = JSON.stringify({ wrappedBy: user.id, key: wrappedKey });

    const res = await authFetch(`/api/chats/${chatId}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, encryptedChatKey }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.error || "Ошибка сервера";
    }
    return true;
  }, [chats, getChatKey, getPublicKey, user?.id, authFetch]);

  // ── API: remove participant ───────────────────────────────────────────────

  const removeParticipant = useCallback(async (chatId, userId) => {
    const res = await authFetch(`/api/chats/${chatId}/participants/${userId}`, { method: "DELETE" });
    return res.ok;
  }, [authFetch]);

  // ── Typing indicators ─────────────────────────────────────────────────────

  const sendTyping = useCallback((chatId, isTyping) => {
    wsRef.current?.send({ type: isTyping ? "typing" : "stop_typing", chatId });
  }, []);

  const buildMessengerKeysForPassword = useCallback(async (newPassword) => {
    if (!identityKeyRef.current?.privateKey || !newPassword) return null;
    const rewrapped = await rewrapPrivateKey(identityKeyRef.current.privateKey, newPassword);
    return {
      encryptedPrivateKeyJwk: rewrapped.encryptedPrivateKeyJwk,
      keyDerivationSalt: rewrapped.keyDerivationSalt,
      keyDerivationIv: rewrapped.keyDerivationIv,
    };
  }, []);

  const contextValue = useMemo(() => ({
    cryptoReady, cryptoError, wsConnected,
    chats, chatsLoaded, activeChatId, setActiveChatId, messages,
    unlockCrypto,
    buildMessengerKeysForPassword,
    loadChats, loadMessages, sendMsg, sendFile, sendFiles, forwardMsg, editMsg, deleteMsg, downloadFile, downloadFiles, getFileUrl, markRead,
    createNewChat, updateChatSettings, addParticipant, removeParticipant, sendTyping,
  }), [
    cryptoReady, cryptoError, wsConnected,
    chats, chatsLoaded, activeChatId, messages,
    unlockCrypto, buildMessengerKeysForPassword,
    loadChats, loadMessages, sendMsg, sendFile, sendFiles, forwardMsg, editMsg, deleteMsg, downloadFile, downloadFiles, getFileUrl, markRead,
    createNewChat, updateChatSettings, addParticipant, removeParticipant, sendTyping,
  ]);

  return (
    <MessengerContext.Provider value={contextValue}>
      {children}
    </MessengerContext.Provider>
  );
}

export const useMessenger = () => useContext(MessengerContext);
