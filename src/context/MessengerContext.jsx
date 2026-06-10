import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { MsgSocket } from "../utils/websocket";
import { MessengerApi } from "../utils/messengerApi";
import { shouldSyncMessengerInCurrentView } from "../utils/messengerRealtime";
import { ensurePushSubscription, requestNotificationPermission } from "../utils/pushSubscription";
import {
  clearMessengerCache,
  loadCachedFile,
  loadCachedMessages,
  loadPendingQueue,
  saveCachedFile,
  saveCachedMessages,
  savePendingQueue,
} from "../utils/messengerCache";

const MessengerStateContext = createContext(null);
const MessengerActionsContext = createContext(null);
const CURSOR_KEY = "dash_messenger_sync_cursor";
const FILE_IV_PLACEHOLDER = "server";
const WS_RETRY_MS = 4000;
const DEVICE_ID_KEY = "dash_messenger_device_id";

const makeId = () => (
  globalThis.crypto?.randomUUID?.() || `local_${Date.now()}_${Math.random().toString(36).slice(2)}`
);

const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

const getOrCreateDeviceId = () => {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (deviceId) return deviceId;
  deviceId = makeId();
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
};

const safeJsonString = (value) => {
  try { return JSON.stringify(value || {}); }
  catch { return "{}"; }
};

const eventPayload = (event) => {
  if (event?.payload && typeof event.payload === "object") return event.payload;
  try { return JSON.parse(event?.payload || "{}"); }
  catch { return {}; }
};

const normalizeMessage = (message, fallbackChatId = null) => ({
  ...message,
  chat_id: message?.chat_id || fallbackChatId,
  text: typeof message?.text === "string" ? message.text : "",
  meta: message?.meta && typeof message.meta === "object" ? message.meta : {},
  msg_type: message?.msg_type || "text",
  deleted_for_all: !!message?.deleted_for_all,
});

const buildMessageMeta = (payload = {}) => {
  const meta = payload.meta && typeof payload.meta === "object" ? { ...payload.meta } : {};
  if (Array.isArray(payload.mentionedUserIds) && payload.mentionedUserIds.length > 0) {
    meta.mentionedUserIds = payload.mentionedUserIds;
  }
  return meta;
};

const normalizeChatList = (items = []) => {
  const seen = new Set();
  const normalized = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.id) continue;
    const key = item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ ...item, participants: item.participants || [], receipts: item.receipts || [] });
  }
  return normalized;
};

const sortMessages = (items) => {
  const seen = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    const key = item.client_message_id || item.id;
    if (!key) continue;
    seen.set(String(key), item);
  }
  return Array.from(seen.values()).sort((a, b) => {
    const aTime = Date.parse(a.created_at || "") || 0;
    const bTime = Date.parse(b.created_at || "") || 0;
    if (aTime !== bTime) return aTime - bTime;
    return Number(a.id || 0) - Number(b.id || 0);
  });
};

const removeChatMessagesFromCache = (chatId, scope) => {
  try { saveCachedMessages(chatId, [], scope).catch(() => {}); }
  catch {}
};

export function MessengerProvider({ children }) {
  const { token, user, authFetch, updateUser, logout, permissions } = useAuth();
  // Live revocation: when permissions are known and messenger read is off,
  // the messenger must shut down (close WS, drop chats) without a reload.
  // Unknown permissions (null, e.g. slow /me) keep the old allow behavior.
  const messengerBlocked = permissions
    ? !(permissions.isAdmin || permissions.sections?.messenger?.read || permissions.sections?.messenger?.write)
    : false;
  const cacheScope = user?.id ? `user_${user.id}` : "anonymous";
  const cursorKey = `${CURSOR_KEY}_${cacheScope}`;
  const [ready, setReady] = useState(false);
  const [cryptoError, setCryptoError] = useState("");
  const [chats, setChats] = useState([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState({});
  const [pendingQueue, setPendingQueue] = useState([]);
  const [syncCursor, setSyncCursor] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState(() => (
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  ));
  const [pinnedForAll, setPinnedForAll] = useState({}); // { [chatId]: Message[] }
  const [pinnedForMe, setPinnedForMe] = useState({});   // { [chatId]: Message[] }
  const [replyTargets, setReplyTargets] = useState({}); // { [chatId]: Message | null }
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);    // message ids (current active chat)
  const [fontSize, setFontSizeState] = useState(() => localStorage.getItem("messenger_font_size") || "M");
  const wsRef = useRef(null);
  const flushInFlightRef = useRef(false);
  const retryTimersRef = useRef(new Map());
  const syncMessengerRef = useRef(null);
  const removedChatIdsRef = useRef(new Set());
  const cacheResetVersionRef = useRef(0);

  const clearRetryTimer = useCallback((clientMessageId) => {
    const entry = retryTimersRef.current.get(clientMessageId);
    window.clearTimeout(entry?.timer || entry);
    retryTimersRef.current.delete(clientMessageId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSyncCursor(Number(localStorage.getItem(cursorKey) || 0));
    loadPendingQueue(cacheScope)
      .then((persistedQueue) => {
        if (cancelled) return;
        setPendingQueue(persistedQueue);
        setMessages((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const item of persistedQueue) {
            if (!item?.chatId || !item?.id) continue;
            const existing = next[item.chatId] || [];
            if (existing.some((message) => message.client_message_id === item.id || message.id === item.id)) continue;
            changed = true;
            next[item.chatId] = sortMessages([
              ...existing,
              {
                id: item.id,
                chat_id: item.chatId,
                sender_id: user?.id,
                sender_username: user?.username,
                sender_display_name: user?.display_name || "",
                text: item.payload?.text || "",
                meta: item.payload?.meta || {},
                msg_type: item.payload?.msgType || "text",
                file_id: item.payload?.fileId || null,
                client_message_id: item.id,
                created_at: item.createdAt,
                pending: true,
              },
            ]);
          }
          return changed ? next : prev;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // user object identity flips on display-name updates, but we only read id/username/display_name
    // for optimistic stubs — stale name in pending preview is benign and not worth a queue reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheScope, cursorKey, user?.id]);

  useEffect(() => {
    if (!token || !user || messengerBlocked) {
      setReady(false);
      setChats([]);
      setChatsLoaded(false);
      setActiveChatId(null);
      setMessages({});
      setWsConnected(false);
      return;
    }
    setCryptoError("");
    setReady(true);
  }, [token, user, messengerBlocked]);

  const persistPendingQueue = useCallback((updater) => {
    setPendingQueue((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      savePendingQueue(next, cacheScope).catch(() => {});
      return next;
    });
  }, [cacheScope]);

  const upsertMessage = useCallback((chatId, nextMessage) => {
    if (!chatId || !nextMessage) return;
    const normalized = normalizeMessage(nextMessage, chatId);
    setMessages((prev) => {
      const existing = prev[chatId] || [];
      const matchIndex = existing.findIndex((item) => (
        item.id === normalized.id ||
        (normalized.client_message_id && item.client_message_id === normalized.client_message_id)
      ));
      const next = matchIndex >= 0
        ? existing.map((item, index) => {
            if (index !== matchIndex) return item;
            const merged = { ...item, ...normalized };
            merged.pending = normalized.pending === true;
            return merged;
          })
        : [...existing, normalized];
      const sorted = sortMessages(next);
      saveCachedMessages(chatId, sorted, cacheScope).catch(() => {});
      return { ...prev, [chatId]: sorted };
    });
  }, [cacheScope]);

  const removeMessage = useCallback((chatId, messageId) => {
    setMessages((prev) => {
      const nextList = (prev[chatId] || []).filter((message) => message.id !== messageId);
      saveCachedMessages(chatId, nextList, cacheScope).catch(() => {});
      return { ...prev, [chatId]: nextList };
    });
  }, [cacheScope]);

  const patchMessage = useCallback((chatId, messageId, patch) => {
    if (!chatId || !messageId) return;
    setMessages((prev) => {
      const current = prev[chatId] || [];
      let changed = false;
      const nextList = current.map((message) => {
        if (message.id !== messageId) return message;
        changed = true;
        return { ...message, ...patch };
      });
      if (!changed) return prev;
      saveCachedMessages(chatId, nextList, cacheScope).catch(() => {});
      return { ...prev, [chatId]: nextList };
    });
  }, [cacheScope]);

  const queuePendingMessage = useCallback((chatId, payload) => {
    const id = payload.clientMessageId || makeId();
    const item = {
      id,
      chatId,
      payload: { ...payload, clientMessageId: id },
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    persistPendingQueue((prev) => [...prev.filter((queued) => queued.id !== id), item]);
    upsertMessage(chatId, {
      id,
      chat_id: chatId,
      sender_id: user?.id,
      sender_username: user?.username,
      sender_display_name: user?.display_name || "",
      text: payload.text || "",
      meta: buildMessageMeta(payload),
      msg_type: payload.msgType || "text",
      file_id: payload.fileId || null,
      reply_to_message_id: payload.replyToMessageId || null,
      client_message_id: id,
      created_at: item.createdAt,
      pending: true,
    });
    return item;
  }, [persistPendingQueue, upsertMessage, user]);

  const clearRemovedChatLocalState = useCallback((chatId) => {
    removedChatIdsRef.current.add(chatId);
    setChats((prev) => prev.filter((chat) => chat.id !== chatId));
    setMessages((prev) => {
      const next = { ...prev };
      delete next[chatId];
      return next;
    });
    setActiveChatId((prev) => (prev === chatId ? null : prev));
    persistPendingQueue((prev) => prev.filter((item) => item.chatId !== chatId));
    for (const [clientMessageId, entry] of retryTimersRef.current.entries()) {
      if (entry?.chatId !== chatId) continue;
      window.clearTimeout(entry.timer);
      retryTimersRef.current.delete(clientMessageId);
    }
    removeChatMessagesFromCache(chatId, cacheScope);
  }, [cacheScope, persistPendingQueue]);

  const getTicket = useCallback(async () => {
    const res = await authFetch("/api/auth/ws-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getOrCreateDeviceId() }),
    });
    if (!res.ok) throw new Error("ws-ticket failed");
    const payload = await res.json();
    return payload.ticket;
  }, [authFetch]);

  const loadChats = useCallback(async (clientId) => {
    setChatsLoaded(false);
    try {
      const data = await MessengerApi.listChats(authFetch, clientId);
      const nextChats = normalizeChatList(data.chats || []);
      setChats(nextChats);
      setActiveChatId((prev) => (nextChats.some((chat) => chat.id === prev) ? prev : (nextChats[0]?.id || null)));
      return nextChats;
    } catch {
      return [];
    } finally {
      setChatsLoaded(true);
    }
  }, [authFetch]);

  const fetchChatById = useCallback(async (chatId) => {
    try {
      const data = await MessengerApi.getChat(authFetch, chatId);
      if (!data?.chat) return null;
      setChats((prev) => normalizeChatList([data.chat, ...prev.filter((chat) => chat.id !== data.chat.id)]));
      return data.chat;
    } catch {
      return null;
    }
  }, [authFetch]);

  const loadMessages = useCallback(async (chatId, before) => {
    if (!chatId) return [];
    if (!before) {
      try {
        const cached = await loadCachedMessages(chatId, cacheScope);
        if (cached.length > 0) setMessages((prev) => ({ ...prev, [chatId]: sortMessages(cached) }));
      } catch {}
    }
    try {
      const data = await MessengerApi.listMessages(authFetch, chatId, before);
      const nextMessages = (data.messages || []).map((message) => normalizeMessage(message, chatId));
      setMessages((prev) => {
        const current = prev[chatId] || [];
        const pending = current.filter((message) => message.pending);
        const merged = before ? sortMessages([...nextMessages, ...current]) : sortMessages([...nextMessages, ...pending]);
        saveCachedMessages(chatId, merged, cacheScope).catch(() => {});
        return { ...prev, [chatId]: merged };
      });
      return nextMessages;
    } catch {
      return [];
    }
  }, [authFetch, cacheScope]);

  const sendPayload = useCallback(async (chatId, payload, { optimistic = true } = {}) => {
    if (!chatId || !payload) return false;
    const resetVersion = cacheResetVersionRef.current;
    const clientMessageId = payload.clientMessageId || makeId();
    const fullPayload = { ...payload, clientMessageId, deviceId: getOrCreateDeviceId() };
    if (optimistic) {
      upsertMessage(chatId, {
        id: clientMessageId,
        chat_id: chatId,
        sender_id: user?.id,
        sender_username: user?.username,
        sender_display_name: user?.display_name || "",
        text: fullPayload.text || "",
        meta: buildMessageMeta(fullPayload),
        msg_type: fullPayload.msgType || "text",
        file_id: fullPayload.fileId || null,
        reply_to_message_id: fullPayload.replyToMessageId || null,
        client_message_id: clientMessageId,
        created_at: new Date().toISOString(),
        pending: true,
      });
    }

    const sentBySocket = wsRef.current?.send({ type: "send_message", chatId, ...fullPayload });
    if (sentBySocket) {
      clearRetryTimer(clientMessageId);
      const timer = window.setTimeout(() => {
        retryTimersRef.current.delete(clientMessageId);
        if (resetVersion !== cacheResetVersionRef.current) return;
        queuePendingMessage(chatId, fullPayload);
      }, WS_RETRY_MS);
      retryTimersRef.current.set(clientMessageId, { timer, chatId });
      return true;
    }

    if (!isOnline()) {
      if (resetVersion === cacheResetVersionRef.current) queuePendingMessage(chatId, fullPayload);
      return true;
    }

    try {
      const data = await MessengerApi.sendMessage(authFetch, chatId, fullPayload);
      if (data?.message) {
        clearRetryTimer(data.message.client_message_id);
        upsertMessage(chatId, data.message);
      }
      return true;
    } catch {
      if (resetVersion === cacheResetVersionRef.current) queuePendingMessage(chatId, fullPayload);
      return true;
    }
  }, [authFetch, queuePendingMessage, upsertMessage, user]);

  const loadPinnedForAll = useCallback(async (chatId) => {
    try {
      const { messages: pinned } = await MessengerApi.listPinnedForAll(authFetch, chatId);
      setPinnedForAll((prev) => ({ ...prev, [chatId]: pinned.map((m) => normalizeMessage(m, chatId)) }));
    } catch {}
  }, [authFetch]);

  const loadPinnedForMe = useCallback(async (chatId) => {
    try {
      const { messages: pinned } = await MessengerApi.listPinnedForMe(authFetch, chatId);
      setPinnedForMe((prev) => ({ ...prev, [chatId]: pinned.map((m) => normalizeMessage(m, chatId)) }));
    } catch {}
  }, [authFetch]);

  const flushPendingQueue = useCallback(async () => {
    if (!ready || !isOnline() || pendingQueue.length === 0 || flushInFlightRef.current) return;
    flushInFlightRef.current = true;
    const resetVersion = cacheResetVersionRef.current;
    const snapshot = pendingQueue;
    const snapshotIds = new Set(snapshot.map((item) => item.id));
    persistPendingQueue((prev) => prev.filter((item) => !snapshotIds.has(item.id)));

    try {
      const remaining = [];
      for (const item of snapshot) {
        if (resetVersion !== cacheResetVersionRef.current) return;
        if (removedChatIdsRef.current.has(item.chatId)) continue;
        try {
          const data = await MessengerApi.sendMessage(authFetch, item.chatId, item.payload);
          if (resetVersion !== cacheResetVersionRef.current) return;
          if (data?.message) {
            clearRetryTimer(data.message.client_message_id);
            upsertMessage(item.chatId, data.message);
          }
        } catch {
          if (resetVersion === cacheResetVersionRef.current && !removedChatIdsRef.current.has(item.chatId)) {
            remaining.push({ ...item, attempts: Number(item.attempts || 0) + 1 });
          }
        }
      }
      if (resetVersion === cacheResetVersionRef.current && remaining.length > 0) {
        persistPendingQueue((prev) => {
          const currentIds = new Set(prev.map((item) => item.id));
          return [...prev, ...remaining.filter((item) => !currentIds.has(item.id))];
        });
      }
    } finally {
      flushInFlightRef.current = false;
    }
  }, [authFetch, pendingQueue, persistPendingQueue, ready, upsertMessage]);

  useEffect(() => {
    flushPendingQueue();
  }, [flushPendingQueue, wsConnected]);

  useEffect(() => {
    const onOnline = () => flushPendingQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushPendingQueue]);

  useEffect(() => () => {
    for (const entry of retryTimersRef.current.values()) window.clearTimeout(entry?.timer || entry);
    retryTimersRef.current.clear();
  }, []);

  const handleWsEvent = useCallback((event) => {
    if (!event || typeof event !== "object") return;
    switch (event.type) {
      case "new_message":
      case "message_edited": {
        const message = normalizeMessage(event.message, event.chatId || event.message?.chat_id);
        if (message.chat_id) upsertMessage(message.chat_id, message);
        if (message.client_message_id) {
          clearRetryTimer(message.client_message_id);
          persistPendingQueue((prev) => prev.filter((item) => item.id !== message.client_message_id));
        }
        if (message && message.msg_type !== "system" && message.chat_id) {
          setChats((prev) => prev.map((chat) => (
            chat.id === message.chat_id
              ? {
                  ...chat,
                  _lastMsgAt: message.created_at,
                  last_message: {
                    id: message.id,
                    senderId: message.sender_id,
                    type: message.msg_type,
                    text: message.text,
                    createdAt: message.created_at,
                  },
                }
              : chat
          )));
        }
        break;
      }
      case "message_deleted_all":
      case "message_deleted_self":
        removeMessage(event.chatId, event.messageId);
        if ("lastMessage" in event) {
          setChats((prev) => prev.map((chat) => (
            chat.id === event.chatId ? { ...chat, last_message: event.lastMessage } : chat
          )));
        }
        break;
      case "messages_deleted_self_bulk":
        for (const id of event.messageIds || []) removeMessage(event.chatId, id);
        if ("lastMessage" in event) {
          setChats((prev) => prev.map((chat) => (
            chat.id === event.chatId ? { ...chat, last_message: event.lastMessage } : chat
          )));
        }
        break;
      case "receipts_update":
        setChats((prev) => prev.map((chat) => (
          chat.id === event.chatId ? { ...chat, receipts: event.receipts || [] } : chat
        )));
        break;
      case "participant_added":
        setChats((prev) => prev.map((chat) => (
          chat.id === event.chatId ? { ...chat, participants: event.participants || [] } : chat
        )));
        break;
      case "participant_removed":
        if (event.userId === user?.id) {
          clearRemovedChatLocalState(event.chatId);
        } else {
          setChats((prev) => prev.map((chat) => (
            chat.id === event.chatId ? { ...chat, participants: event.participants || [] } : chat
          )));
        }
        break;
      case "chat_created":
        if (event.chat) {
          setChats((prev) => normalizeChatList([event.chat, ...prev.filter((chat) => chat.id !== event.chat.id)]));
        }
        break;
      case "chat_updated":
        if (event.chat?.id) {
          setChats((prev) => prev.map((chat) => (
            chat.id === event.chat.id ? { ...chat, ...event.chat } : chat
          )));
        }
        break;
      case "message_pinned":
        patchMessage(event.chatId, event.messageId, { pinned_at: event.pinnedAt || new Date().toISOString() });
        loadPinnedForAll(event.chatId).catch(() => {});
        break;
      case "message_unpinned":
        patchMessage(event.chatId, event.messageId, { pinned_at: null });
        loadPinnedForAll(event.chatId).catch(() => {});
        break;
      case "personal_pin_added":
      case "personal_pin_removed":
        loadPinnedForMe(event.chatId).catch(() => {});
        break;
      case "force_logout": {
        // Серверный отзыв этого устройства: чистим всё и выходим.
        const ourDevice = getOrCreateDeviceId();
        if (!event.deviceId || event.deviceId === ourDevice) {
          try { logout?.(); } catch (_) {}
        }
        break;
      }
      case "user_updated":
        // Кто-то из участников чата сменил display_name — обновим локально, чтобы шапки не были стали.
        if (event.user?.id) {
          setChats((prev) => prev.map((chat) => ({
            ...chat,
            participants: (chat.participants || []).map((p) =>
              p.user_id === event.user.id ? { ...p, display_name: event.user.display_name || p.display_name } : p
            ),
          })));
          setMessages((prev) => {
            const next = {};
            for (const [chatId, list] of Object.entries(prev)) {
              next[chatId] = list.map((m) =>
                m.sender_id === event.user.id ? { ...m, sender_display_name: event.user.display_name || m.sender_display_name } : m
              );
            }
            return next;
          });
        }
        break;
      default:
        break;
    }
  }, [clearRemovedChatLocalState, clearRetryTimer, loadPinnedForAll, loadPinnedForMe, logout, patchMessage, persistPendingQueue, removeMessage, upsertMessage, user?.id]);

  useEffect(() => {
    if (!token || !user || messengerBlocked) return undefined;
    const sock = new MsgSocket({
      getTicket,
      onOpen: () => {
        setWsConnected(true);
        if (shouldSyncMessengerInCurrentView()) syncMessengerRef.current?.();
      },
      onClose: () => setWsConnected(false),
      onMessage: handleWsEvent,
    });
    wsRef.current = sock;
    sock.connect();
    return () => {
      sock.disconnect();
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [getTicket, handleWsEvent, token, user, messengerBlocked]);

  const setReplyTarget = useCallback((chatId, message) => {
    setReplyTargets((prev) => ({ ...prev, [chatId]: message || null }));
  }, []);

  const clearReplyTarget = useCallback((chatId) => {
    setReplyTargets((prev) => ({ ...prev, [chatId]: null }));
  }, []);

  const sendMsg = useCallback(async (chatId, text, options = {}) => {
    const trimmed = String(text || "").trim();
    if (!trimmed) return false;
    const payload = { text: trimmed, meta: {}, msgType: "text" };
    if (options.replyToMessageId) payload.replyToMessageId = options.replyToMessageId;
    if (options.mentionedUserIds?.length) payload.mentionedUserIds = options.mentionedUserIds;
    const result = await sendPayload(chatId, payload);
    if (options.replyToMessageId) clearReplyTarget(chatId);
    return result;
  }, [sendPayload, clearReplyTarget]);

  const enterSelectionMode = useCallback((initialId = null) => {
    setSelectionMode(true);
    setSelectedIds(initialId ? [initialId] : []);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const toggleSelection = useCallback((messageId) => {
    setSelectedIds((prev) => (
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId]
    ));
  }, []);

  const bulkDelete = useCallback(async (chatId, ids, scope) => {
    const safeIds = Array.isArray(ids) ? ids.filter((id) => Number.isFinite(Number(id))) : [];
    if (safeIds.length === 0) return { ok: false, error: "Нет выделенных сообщений" };
    // Снапшот для возможного отката (только при scope='all' с отказом сервера).
    const snapshot = (messages[chatId] || []).filter((m) => safeIds.includes(m.id));
    // Оптимистичное удаление + сразу выходим из selection mode (Telegram-style).
    setMessages((prev) => {
      const cur = prev[chatId] || [];
      const next = cur.filter((m) => !safeIds.includes(m.id));
      saveCachedMessages(chatId, next, cacheScope).catch(() => {});
      return { ...prev, [chatId]: next };
    });
    exitSelectionMode();
    try {
      const result = await MessengerApi.bulkDelete(authFetch, chatId, safeIds, scope);
      return { ok: true, ...result };
    } catch (e) {
      // Откат: возвращаем удалённые сообщения, чтобы пользователь не остался в неконсистентном состоянии.
      if (snapshot.length > 0) {
        setMessages((prev) => {
          const cur = prev[chatId] || [];
          const merged = sortMessages([...cur, ...snapshot]);
          saveCachedMessages(chatId, merged, cacheScope).catch(() => {});
          return { ...prev, [chatId]: merged };
        });
      }
      return { ok: false, error: e.message };
    }
  }, [authFetch, cacheScope, exitSelectionMode, messages]);

  const bulkForward = useCallback(async (chatId, ids, targetChatId) => {
    try {
      const result = await MessengerApi.bulkForward(authFetch, chatId, ids, targetChatId);
      exitSelectionMode();
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [authFetch, exitSelectionMode]);

  const uploadFile = useCallback(async (chatId, file) => {
    const form = new FormData();
    const name = String(file?.name || "file");
    const type = String(file?.type || "application/octet-stream");
    form.append("file", file, name);
    form.append("originalName", name);
    form.append("mimeType", type);
    const data = await MessengerApi.uploadFile(authFetch, chatId, form);
    return data.file || null;
  }, [authFetch]);

  const sendFile = useCallback(async (chatId, file) => {
    if (!file) return false;
    const uploaded = await uploadFile(chatId, file);
    if (!uploaded?.id) return false;
    const meta = {
      name: uploaded.original_name || file.name || "file",
      type: uploaded.mime_type || file.type || "application/octet-stream",
      size: Number(uploaded.size_bytes || file.size || 0),
      iv: FILE_IV_PLACEHOLDER,
    };
    const msgType = String(meta.type || "").startsWith("image/") ? "image" : "file";
    return sendPayload(chatId, {
      text: safeJsonString(meta),
      meta,
      msgType,
      fileId: uploaded.id,
    });
  }, [sendPayload, uploadFile]);

  const sendVoiceMessage = useCallback(async (chatId, { blob, mime, duration, waveformB64 }) => {
    if (!chatId || !blob) return false;
    // Wrap blob as a File so the existing uploader provides a name/type.
    const fileName = `voice_${Date.now()}.${(mime || "audio/webm").includes("ogg") ? "ogg" : (mime || "audio/webm").includes("mp4") ? "m4a" : "webm"}`;
    const file = (typeof File === "function")
      ? new File([blob], fileName, { type: mime || "audio/webm" })
      : Object.assign(blob, { name: fileName });
    const uploaded = await uploadFile(chatId, file);
    if (!uploaded?.id) return false;
    const payload = JSON.stringify({
      fileId: uploaded.id,
      duration: Number(duration) || 0,
      waveform: waveformB64 || "",
    });
    const meta = {
      name: uploaded.original_name || file.name,
      type: uploaded.mime_type || mime || "audio/webm",
      size: Number(uploaded.size_bytes || blob.size || 0),
      iv: FILE_IV_PLACEHOLDER,
      duration: Number(duration) || 0,
    };
    return sendPayload(chatId, {
      text: payload,
      meta,
      msgType: "voice",
      fileId: uploaded.id,
    });
  }, [sendPayload, uploadFile]);

  const sendFiles = useCallback(async (chatId, filesInput) => {
    const files = Array.from(filesInput || []).filter(Boolean);
    if (files.length === 0) return { ok: false, sent: 0, total: 0, failed: [] };

    let sent = 0;
    const failed = [];
    for (const file of files) {
      try {
        const ok = await sendFile(chatId, file);
        if (ok) sent += 1;
        else failed.push(file.name || "file");
      } catch {
        failed.push(file.name || "file");
      }
    }
    return { ok: failed.length === 0, sent, total: files.length, failed };
  }, [sendFile]);

  const editMsg = useCallback(async (chatId, messageId, text) => {
    const trimmed = String(text || "").trim();
    if (!trimmed) return false;
    // Запоминаем прежнее состояние для отката, если правка не пройдёт.
    const prev = (messages[chatId] || []).find((m) => m.id === messageId) || null;
    const sent = wsRef.current?.send({ type: "edit_message", chatId, messageId, text: trimmed, meta: {} });
    if (!sent) {
      try {
        const data = await MessengerApi.editMessage(authFetch, chatId, messageId, { text: trimmed, meta: {} });
        if (data?.message) upsertMessage(chatId, data.message);
        else if (prev) upsertMessage(chatId, prev);
      } catch {
        if (prev) upsertMessage(chatId, prev); // откат
        return false;
      }
    }
    upsertMessage(chatId, { id: messageId, chat_id: chatId, text: trimmed, edited_at: new Date().toISOString() });
    return true;
  }, [authFetch, messages, upsertMessage]);

  const deleteMsg = useCallback(async (chatId, messageId, scope = "all") => {
    const normalizedScope = scope === "self" ? "self" : "all";
    const sent = wsRef.current?.send({ type: "delete_message", chatId, messageId, scope: normalizedScope });
    if (!sent) {
      try {
        await MessengerApi.deleteMessage(authFetch, chatId, messageId, normalizedScope);
      } catch {
        return false;
      }
    }
    removeMessage(chatId, messageId);
    return true;
  }, [authFetch, removeMessage]);

  const forwardMsg = useCallback(async (fromChatId, messageId, toChatId) => {
    if (!fromChatId || !toChatId || fromChatId === toChatId) return false;
    const sourceMessage = (messages[fromChatId] || []).find((message) => message.id === messageId);
    if (!sourceMessage || sourceMessage.msg_type !== "text") return false;
    return sendPayload(toChatId, { text: sourceMessage.text || "", meta: {}, msgType: "text" });
  }, [messages, sendPayload]);

  const getFileUrl = useCallback(async (chatId, fileId, _iv, mimeType) => {
    if (!chatId || !fileId) return null;
    try {
      const cached = await loadCachedFile(fileId, cacheScope);
      if (cached?.blob) return URL.createObjectURL(mimeType ? cached.blob.slice(0, cached.blob.size, mimeType) : cached.blob);
    } catch {}

    const res = await authFetch(`/api/chats/${chatId}/files/${fileId}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    saveCachedFile(fileId, blob, { chatId, mimeType }, cacheScope).catch(() => {});
    return URL.createObjectURL(mimeType ? blob.slice(0, blob.size, mimeType) : blob);
  }, [authFetch, cacheScope]);

  const downloadFile = useCallback(async (chatId, fileId, ivB64, originalName, mimeType, options = {}) => {
    const url = await getFileUrl(chatId, fileId, ivB64, mimeType);
    if (!url) return false;
    const forceDownloadOnly = !!options?.forceDownload;
    const canOpenInline = typeof mimeType === "string" && (
      mimeType.startsWith("image/") || mimeType === "application/pdf" || mimeType.startsWith("text/")
    );
    const download = () => {
      const a = document.createElement("a");
      a.href = url;
      a.download = originalName || "file";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    if (!forceDownloadOnly && canOpenInline) {
      const popup = window.open(url, "_blank", "noopener,noreferrer");
      if (!popup) download();
    } else {
      download();
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
      const ok = fileId
        ? await downloadFile(chatId, fileId, file?.iv, file?.name, file?.type, { forceDownload: true })
        : false;
      if (ok) downloaded += 1;
      else failed.push(file?.name || "file");
    }
    return { ok: failed.length === 0, downloaded, total: files.length, failed };
  }, [downloadFile]);

  const markReadLastRef = useRef(new Map()); // chatId -> last messageId we sent
  const markRead = useCallback((chatId, messageId) => {
    if (!chatId || !messageId) return;
    const lastSent = markReadLastRef.current.get(chatId);
    if (lastSent && Number(lastSent) >= Number(messageId)) return;
    markReadLastRef.current.set(chatId, messageId);
    const sent = wsRef.current?.send({ type: "mark_read", chatId, messageId });
    if (!sent) MessengerApi.markRead(authFetch, chatId, messageId).catch(() => {});
    setChats((prev) => prev.map((chat) => {
      if (chat.id !== chatId) return chat;
      const receipts = (chat.receipts || []).filter((receipt) => receipt.user_id !== user?.id);
      receipts.push({ user_id: user?.id, last_read_message_id: messageId, read_at: new Date().toISOString() });
      return { ...chat, receipts };
    }));
  }, [authFetch, user?.id]);

  const pinForAll = useCallback(async (chatId, messageId) => {
    try {
      await MessengerApi.pinForAll(authFetch, chatId, messageId);
      await loadPinnedForAll(chatId);
      patchMessage(chatId, messageId, { pinned_at: new Date().toISOString() });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [authFetch, loadPinnedForAll, patchMessage]);

  const unpinForAll = useCallback(async (chatId, messageId) => {
    try {
      await MessengerApi.unpinForAll(authFetch, chatId, messageId);
      await loadPinnedForAll(chatId);
      patchMessage(chatId, messageId, { pinned_at: null });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }, [authFetch, loadPinnedForAll, patchMessage]);

  const pinForMe = useCallback(async (chatId, messageId) => {
    try {
      await MessengerApi.pinForMe(authFetch, chatId, messageId);
      await loadPinnedForMe(chatId);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }, [authFetch, loadPinnedForMe]);

  const unpinForMe = useCallback(async (chatId, messageId) => {
    try {
      await MessengerApi.unpinForMe(authFetch, chatId, messageId);
      await loadPinnedForMe(chatId);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }, [authFetch, loadPinnedForMe]);

  const createNewChat = useCallback(async (payload, legacyTitle, legacyParticipantUserIds) => {
    const normalized = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : { clientId: payload, title: legacyTitle, participantUserIds: legacyParticipantUserIds };
    const clientId = normalized.clientId || null;
    const body = {
      clientId,
      title: String(normalized.title || "Чат").trim().slice(0, 80) || "Чат",
      icon: String(normalized.icon || "").trim().slice(0, 8),
      isInternal: !!normalized.isInternal || !clientId,
      isPinned: !!normalized.isPinned,
      participants: Array.from(new Set(normalized.participantUserIds || []))
        .filter((userId) => Number.isInteger(Number(userId)) && Number(userId) > 0)
        .map((userId) => ({ userId: Number(userId) })),
    };
    try {
      const data = await MessengerApi.createChat(authFetch, body);
      if (data?.chat) {
        setChats((prev) => normalizeChatList([data.chat, ...prev.filter((chat) => chat.id !== data.chat.id)]));
      }
      return data?.chat || null;
    } catch {
      return null;
    }
  }, [authFetch]);

  const updateChatSettings = useCallback(async (chatId, patch = {}) => {
    if (!chatId || !patch || typeof patch !== "object") return { ok: false, error: "Некорректные данные" };
    const body = {};
    if (Object.prototype.hasOwnProperty.call(patch, "title")) {
      body.title = String(patch.title || "").trim().slice(0, 80) || "Чат";
    }
    if (Object.prototype.hasOwnProperty.call(patch, "icon")) {
      body.icon = String(patch.icon || "").trim().slice(0, 8);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "isPinned")) body.isPinned = !!patch.isPinned;
    if (Object.keys(body).length === 0) return { ok: false, error: "Нет изменений" };
    try {
      const data = await MessengerApi.updateChat(authFetch, chatId, body);
      if (data?.chat) setChats((prev) => prev.map((chat) => (chat.id === chatId ? { ...chat, ...data.chat } : chat)));
      return { ok: true, chat: data?.chat || null };
    } catch (error) {
      return { ok: false, error: error.message || "Ошибка сервера" };
    }
  }, [authFetch]);

  const addParticipant = useCallback(async (chatId, userId) => {
    try {
      const data = await MessengerApi.addParticipant(authFetch, chatId, userId);
      if (data?.participants) {
        setChats((prev) => prev.map((chat) => (
          chat.id === chatId ? { ...chat, participants: data.participants } : chat
        )));
      }
      return true;
    } catch (error) {
      return error.message || "Ошибка сервера";
    }
  }, [authFetch]);

  const removeParticipant = useCallback(async (chatId, userId) => {
    try {
      const data = await MessengerApi.removeParticipant(authFetch, chatId, userId);
      if (data?.participants) {
        setChats((prev) => prev.map((chat) => (
          chat.id === chatId ? { ...chat, participants: data.participants } : chat
        )));
      }
      return true;
    } catch {
      return false;
    }
  }, [authFetch]);

  const sendTyping = useCallback((chatId, isTyping) => {
    wsRef.current?.send({ type: isTyping ? "typing" : "stop_typing", chatId });
  }, []);

  const replaySyncEvents = useCallback(async (events = []) => {
    const refreshChats = new Set();
    const refreshMessages = new Set();
    for (const event of events) {
      const payload = eventPayload(event);
      const chatId = Number(event?.chat_id || payload.chatId || 0);
      const applyLastMessage = (lastMessage) => {
        setChats((prev) => prev.map((chat) => (
          chat.id === chatId
            ? { ...chat, _lastMsgAt: lastMessage?.createdAt || null, last_message: lastMessage }
            : chat
        )));
      };
      switch (event?.event_type) {
        case "new_message":
        case "message_edited":
          if (chatId) refreshMessages.add(chatId);
          if (chatId && payload.lastMessage) applyLastMessage(payload.lastMessage);
          break;
        case "message_deleted_all":
        case "message_deleted_self":
          if (chatId && payload.messageId) removeMessage(chatId, payload.messageId);
          if (chatId && "lastMessage" in payload) applyLastMessage(payload.lastMessage);
          break;
        case "message_pinned":
          if (chatId && payload.messageId) {
            patchMessage(chatId, payload.messageId, { pinned_at: payload.pinnedAt || new Date().toISOString() });
            loadPinnedForAll(chatId);
          }
          break;
        case "message_unpinned":
          if (chatId && payload.messageId) {
            patchMessage(chatId, payload.messageId, { pinned_at: null });
            loadPinnedForAll(chatId);
          }
          break;
        case "personal_pin_added":
        case "personal_pin_removed":
          if (chatId) loadPinnedForMe(chatId);
          break;
        case "chat_created":
        case "chat_updated":
        case "participant_added":
          if (chatId) refreshChats.add(chatId);
          break;
        case "participant_removed":
          if (payload.userId === user?.id) {
            clearRemovedChatLocalState(chatId);
          } else if (chatId) {
            refreshChats.add(chatId);
          }
          break;
        default:
          if (chatId) refreshMessages.add(chatId);
          break;
      }
    }

    await Promise.all(Array.from(refreshChats).map((chatId) => fetchChatById(chatId)));
    await Promise.all(Array.from(refreshMessages).map((chatId) => loadMessages(chatId)));
  }, [clearRemovedChatLocalState, fetchChatById, loadMessages, loadPinnedForAll, loadPinnedForMe, patchMessage, removeMessage, setChats, user?.id]);

  const syncMessenger = useCallback(async () => {
    try {
      const data = await MessengerApi.sync(authFetch, syncCursor);
      const events = data?.events || [];
      await replaySyncEvents(events);
      const cursor = Number(data?.cursor || syncCursor);
      if (Number.isFinite(cursor)) {
        setSyncCursor(cursor);
        localStorage.setItem(cursorKey, String(cursor));
      }
      return events;
    } catch {
      return [];
    }
  }, [authFetch, cursorKey, replaySyncEvents, syncCursor]);

  useEffect(() => {
    syncMessengerRef.current = syncMessenger;
  }, [syncMessenger]);

  useEffect(() => {
    if (!activeChatId) return;
    loadPinnedForAll(activeChatId);
    loadPinnedForMe(activeChatId);
  }, [activeChatId, loadPinnedForAll, loadPinnedForMe]);

  const registerDevice = useCallback(async (payload) => {
    const data = await MessengerApi.registerDevice(authFetch, payload);
    return data?.deviceId || null;
  }, [authFetch]);

  const unregisterDevice = useCallback(async (deviceId) => MessengerApi.unregisterDevice(authFetch, deviceId), [authFetch]);

  const enableNotifications = useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotificationStatus("unsupported");
      return false;
    }

    setNotificationStatus("requesting");
    const permission = await requestNotificationPermission(Notification);
    if (permission !== "granted") {
      setNotificationStatus(permission);
      return false;
    }

    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setNotificationStatus("missing_key");
      return false;
    }

    try {
      setNotificationStatus("registering");
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error("service worker timeout")), 15000)),
      ]).catch(() => null);
      if (!registration?.pushManager) {
        setNotificationStatus("service_worker_failed");
        return false;
      }

      let subscription = null;
      try {
        subscription = await ensurePushSubscription(registration, publicKey);
      } catch {
        setNotificationStatus("subscribe_failed");
        return false;
      }

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setNotificationStatus("subscription_incomplete");
        return false;
      }
      try {
        await MessengerApi.registerDevice(authFetch, {
          deviceId: getOrCreateDeviceId(),
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        });
      } catch {
        setNotificationStatus("server_registration_failed");
        return false;
      }
      setNotificationStatus("enabled");
      return true;
    } catch {
      setNotificationStatus("registration_failed");
      return false;
    }
  }, [authFetch]);

  const searchInChat = useCallback(async (chatId, q, before = null) => {
    try { return await MessengerApi.searchInChat(authFetch, chatId, q, before); }
    catch (e) { return { matches: [], done: true, error: e.message }; }
  }, [authFetch]);

  const searchGlobal = useCallback(async (q, before = null) => {
    try { return await MessengerApi.searchGlobal(authFetch, q, before); }
    catch (e) { return { groups: [], done: true, error: e.message }; }
  }, [authFetch]);

  const updateDisplayName = useCallback(async (displayName) => {
    try {
      const result = await MessengerApi.updateDisplayName(authFetch, displayName);
      const nextName = result?.displayName ?? displayName;
      // 1. Обновляем глобальный user в AuthContext (он используется в шапках, оптимистических сообщениях и т.п.)
      try { updateUser?.({ display_name: nextName }); } catch (_) {}
      // 2. Прокатываем имя по локальным чатам и сообщениям, чтобы не ждать перезагрузки.
      if (user?.id) {
        setChats((prev) => prev.map((chat) => ({
          ...chat,
          participants: (chat.participants || []).map((p) =>
            p.user_id === user.id ? { ...p, display_name: nextName } : p
          ),
        })));
        setMessages((prev) => {
          const next = {};
          for (const [chatId, list] of Object.entries(prev)) {
            next[chatId] = list.map((m) =>
              m.sender_id === user.id ? { ...m, sender_display_name: nextName } : m
            );
          }
          return next;
        });
      }
      return { ok: true, displayName: nextName };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [authFetch, updateUser, user?.id]);

  const setFontSize = useCallback((size) => {
    const safe = ["S", "M", "L"].includes(size) ? size : "M";
    setFontSizeState(safe);
    localStorage.setItem("messenger_font_size", safe);
  }, []);

  const listDevices = useCallback(async () => {
    try { return (await MessengerApi.listDevices(authFetch))?.devices || []; }
    catch { return []; }
  }, [authFetch]);

  const revokeDevice = useCallback(async (deviceId) => {
    try { return await MessengerApi.removeDevice(authFetch, deviceId); }
    catch (e) { return { ok: false, error: e.message }; }
  }, [authFetch]);

  const clearLocalCache = useCallback(async () => {
    cacheResetVersionRef.current += 1;
    for (const entry of retryTimersRef.current.values()) window.clearTimeout(entry?.timer || entry);
    retryTimersRef.current.clear();
    await clearMessengerCache(cacheScope).catch(() => {});
    localStorage.removeItem(cursorKey);
    setSyncCursor(0);
    setMessages({});
    setPendingQueue([]);
  }, [cacheScope, cursorKey]);

  const unlockCrypto = useCallback(async () => {
    setCryptoError("");
    setReady(!!token && !!user);
    return true;
  }, [token, user]);

  const buildMessengerKeysForPassword = useCallback(async () => null, []);

  useEffect(() => {
    if (!ready) return;
    if (!shouldSyncMessengerInCurrentView()) return;
    syncMessengerRef.current?.();
  }, [ready]);

  const stateValue = useMemo(() => ({
    ready,
    cryptoReady: ready,
    cryptoError,
    wsConnected,
    notificationStatus,
    chats,
    chatsLoaded,
    activeChatId,
    messages,
    pendingQueue,
    syncCursor,
    pinnedForAll,
    pinnedForMe,
    replyTargets,
    selectionMode,
    selectedIds,
    fontSize,
  }), [ready, cryptoError, wsConnected, notificationStatus, chats, chatsLoaded, activeChatId, messages, pendingQueue, syncCursor, pinnedForAll, pinnedForMe, replyTargets, selectionMode, selectedIds, fontSize]);

  // NOTE: this value is NOT yet fully referentially stable. Five actions close over
  // high-traffic volatile state and so appear in the dep array below: editMsg/forwardMsg
  // (messages), bulkDelete (messages), flushPendingQueue (pendingQueue), syncMessenger
  // (syncCursor). Until those are refactored to read state via refs, actionsValue
  // re-identifies on most message/sync activity — so migrating a consumer to
  // useMessengerActions() alone will NOT insulate it from message traffic yet. It DOES
  // already insulate from low-frequency state (fontSize, selection, notificationStatus,
  // wsConnected, cryptoError, replyTargets). Finish the ref refactor before relying on
  // action-only stability (see plan Phase 6 Step 3).
  const actionsValue = useMemo(() => ({
    setNotificationStatus,
    setActiveChatId,
    unlockCrypto,
    buildMessengerKeysForPassword,
    loadChats,
    fetchChatById,
    loadMessages,
    sendMsg,
    sendFile,
    sendFiles,
    sendVoiceMessage,
    forwardMsg,
    editMsg,
    deleteMsg,
    downloadFile,
    downloadFiles,
    getFileUrl,
    markRead,
    createNewChat,
    updateChatSettings,
    addParticipant,
    removeParticipant,
    sendTyping,
    queuePendingMessage,
    flushPendingQueue,
    syncMessenger,
    registerDevice,
    unregisterDevice,
    enableNotifications,
    clearLocalCache,
    pinForAll, unpinForAll, pinForMe, unpinForMe,
    loadPinnedForAll, loadPinnedForMe,
    setReplyTarget, clearReplyTarget,
    enterSelectionMode, exitSelectionMode, toggleSelection,
    bulkDelete, bulkForward,
    searchInChat, searchGlobal,
    updateDisplayName, setFontSize,
    listDevices, revokeDevice,
  }), [
    addParticipant,
    buildMessengerKeysForPassword,
    bulkDelete,
    bulkForward,
    clearLocalCache,
    clearReplyTarget,
    createNewChat,
    deleteMsg,
    downloadFile,
    downloadFiles,
    editMsg,
    enableNotifications,
    enterSelectionMode,
    exitSelectionMode,
    fetchChatById,
    flushPendingQueue,
    forwardMsg,
    getFileUrl,
    listDevices,
    loadChats,
    loadMessages,
    loadPinnedForAll,
    loadPinnedForMe,
    markRead,
    pinForAll,
    pinForMe,
    queuePendingMessage,
    registerDevice,
    removeParticipant,
    revokeDevice,
    searchGlobal,
    searchInChat,
    sendFile,
    sendFiles,
    sendVoiceMessage,
    sendMsg,
    sendTyping,
    setFontSize,
    setReplyTarget,
    syncMessenger,
    toggleSelection,
    unlockCrypto,
    unpinForAll,
    unpinForMe,
    unregisterDevice,
    updateChatSettings,
    updateDisplayName,
  ]);

  return (
    <MessengerActionsContext.Provider value={actionsValue}>
      <MessengerStateContext.Provider value={stateValue}>
        {children}
      </MessengerStateContext.Provider>
    </MessengerActionsContext.Provider>
  );
}

export const useMessengerState = () => useContext(MessengerStateContext);
export const useMessengerActions = () => useContext(MessengerActionsContext);

// Back-compat shim: merges state + actions so existing consumers keep the single-object API.
// New/perf-sensitive consumers should migrate to useMessengerState()/useMessengerActions().
export const useMessenger = () => {
  const state = useContext(MessengerStateContext);
  const actions = useContext(MessengerActionsContext);
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
};
