import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { useMessenger } from "../context/MessengerContext";
import Button from "./Button";
import EmojiPicker from "./EmojiPicker";
import MessageBubble from "./MessageBubble";
import MessengerContextMenu from "./MessengerContextMenu";
import MessengerReadersPopover from "./MessengerReadersPopover";
import MessengerForwardModal from "./MessengerForwardModal";
import MessengerImageViewer from "./MessengerImageViewer";
import MessengerMentionPicker from "./MessengerMentionPicker";
import MessengerPinBar from "./MessengerPinBar";
import MessengerVoiceRecorder from "./MessengerVoiceRecorder";
import TextArea from "./TextArea";
import { fmtDate, parseBundleFiles, isImageLike } from "../utils/messengerUiUtils";

export default function MessengerChatWindow({
  chat, chats, user, messages,
  sendMsg, sendFiles, forwardMsg, editMsg, deleteMsg,
  markRead, downloadFile, downloadFiles, getFileUrl, showParticipants, setShowParticipants,
  updateChatSettings,
  jumpToMessageId,
  onJumpHandled,
  readOnly = false,
}) {
  const { $ } = useTheme();
  const {
    pinnedForAll, pinnedForMe, replyTargets, selectionMode, selectedIds,
    pinForAll, unpinForAll, pinForMe, unpinForMe,
    setReplyTarget, clearReplyTarget,
    enterSelectionMode, exitSelectionMode, toggleSelection,
    bulkDelete,
    searchInChat,
    sendVoiceMessage,
    cryptoReady,
  } = useMessenger();

  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [readersPopover, setReadersPopover] = useState(null);
  const [deleteSheet, setDeleteSheet] = useState(null); // { ids: number[], canForAll: boolean }
  const [forwardTarget, setForwardTarget] = useState(null);
  const [actionError, setActionError] = useState("");
  const [metaBusy, setMetaBusy] = useState(false);
  const [imageViewer, setImageViewer] = useState(null);
  const [pinCycleIndex, setPinCycleIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [voiceActive, setVoiceActive] = useState(false);

  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);
  const messageRefs = useRef(new Map());
  const imageViewerUrlRef = useRef("");
  const imageViewerReqRef = useRef(0);
  const imageViewerStateRef = useRef(null);
  const msgList = messages[chat.id] || [];
  const chatReceipts = chat.receipts || [];

  // Bug 5: показываем и общие, и личные закрепления единым списком (как Telegram).
  // Личные приходят с флагом _personal, чтобы PinBar отображал «только у вас» и звал нужный unpin.
  const chatPinsForAll = pinnedForAll[chat?.id] || [];
  const chatPinsForMe = pinnedForMe[chat?.id] || [];
  const chatPins = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const m of chatPinsForAll) {
      if (m?.id && !seen.has(m.id)) { seen.add(m.id); out.push({ ...m, _personal: false }); }
    }
    for (const m of chatPinsForMe) {
      if (m?.id && !seen.has(m.id)) { seen.add(m.id); out.push({ ...m, _personal: true }); }
    }
    return out;
  }, [chatPinsForAll, chatPinsForMe]);

  const onJumpToMessage = useCallback((messageId) => {
    const el = messageRefs.current.get(messageId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("messenger-highlight");
    setTimeout(() => el.classList.remove("messenger-highlight"), 1200);
  }, []);

  const findMessageById = useCallback((id) => {
    const list = messages[chat?.id] || [];
    return list.find((m) => m.id === id) || null;
  }, [messages, chat?.id]);

  const imageGallery = useMemo(() => {
    const items = [];
    for (const msg of msgList) {
      if (!msg) continue;
      if (msg.msg_type === "files_bundle") {
        const files = parseBundleFiles(msg.text).filter((f) => isImageLike(f.type, f.name, f.thumb));
        for (const file of files) {
          if (!file.fileId || !file.iv) continue;
          items.push({ fileId: file.fileId, iv: file.iv, name: file.name || "Изображение", type: file.type || "image/*" });
        }
        continue;
      }
      if (msg.msg_type !== "image" && msg.msg_type !== "file") continue;
      if (!msg.file_id) continue;
      let meta = {};
      try { meta = JSON.parse(msg.text || "{}"); } catch { meta = {}; }
      const iv = meta?.iv;
      if (!iv) continue;
      const name = meta?.name || "Изображение";
      const type = meta?.type || (msg.msg_type === "image" ? "image/*" : "");
      if (!isImageLike(type, name, meta?.thumb)) continue;
      items.push({ fileId: msg.file_id, iv, name, type: type || "image/*" });
    }
    return items;
  }, [msgList]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgList.length]);

  const lastMsgId = msgList[msgList.length - 1]?.id;
  const lastMsgSenderId = msgList[msgList.length - 1]?.sender_id;
  useEffect(() => {
    const last = msgList[msgList.length - 1];
    if (last && last.sender_id !== user.id) markRead(chat.id, last.id);
  }, [chat.id, lastMsgId, lastMsgSenderId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const close = () => { setContextMenu(null); setReadersPopover(null); };
    const closeOnEsc = (e) => {
      if (e.key === "Escape") { setContextMenu(null); setReadersPopover(null); setForwardTarget(null); closeImageViewer(); }
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", closeOnEsc);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", closeOnEsc); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { imageViewerStateRef.current = imageViewer; }, [imageViewer]);

  useEffect(() => {
    if (!jumpToMessageId) return;
    const t = setTimeout(() => {
      onJumpToMessage(jumpToMessageId);
      onJumpHandled?.();
    }, 100);
    return () => clearTimeout(t);
  }, [jumpToMessageId, onJumpHandled, onJumpToMessage, msgList.length]);

  useEffect(() => {
    if (!searchOpen) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
      const result = await searchInChat(chat.id, searchQuery.trim());
      setSearchResults(result.matches || []);
      setSearchIndex(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchOpen, searchQuery, chat?.id, searchInChat]);

  const closeImageViewer = useCallback(() => {
    imageViewerReqRef.current += 1;
    if (imageViewerUrlRef.current) { URL.revokeObjectURL(imageViewerUrlRef.current); imageViewerUrlRef.current = ""; }
    setImageViewer(null);
  }, []);

  const loadImageViewerItem = useCallback(async (itemsInput, indexInput) => {
    const items = Array.isArray(itemsInput) ? itemsInput.filter(Boolean) : [];
    if (items.length === 0) { closeImageViewer(); return; }
    const rawIndex = Number(indexInput) || 0;
    const index = ((rawIndex % items.length) + items.length) % items.length;
    const target = items[index];
    if (!target?.fileId || !target?.iv) {
      setImageViewer({ items, index, url: "", name: target?.name || "Изображение", loading: false, error: "Не удалось открыть изображение" });
      return;
    }
    const reqId = imageViewerReqRef.current + 1;
    imageViewerReqRef.current = reqId;
    setImageViewer({ items, index, url: "", name: target.name || "Изображение", loading: true, error: "" });
    let url = "";
    try { url = await getFileUrl(chat.id, target.fileId, target.iv, target.type || "image/*"); } catch { url = ""; }
    if (reqId !== imageViewerReqRef.current) { if (url) URL.revokeObjectURL(url); return; }
    if (imageViewerUrlRef.current) { URL.revokeObjectURL(imageViewerUrlRef.current); imageViewerUrlRef.current = ""; }
    if (!url) {
      setImageViewer({ items, index, url: "", name: target.name || "Изображение", loading: false, error: "Не удалось открыть изображение" });
      return;
    }
    imageViewerUrlRef.current = url;
    setImageViewer({ items, index, url, name: target.name || "Изображение", loading: false, error: "" });
  }, [chat.id, getFileUrl, closeImageViewer]);

  useEffect(() => {
    return () => {
      imageViewerReqRef.current += 1;
      if (imageViewerUrlRef.current) { URL.revokeObjectURL(imageViewerUrlRef.current); imageViewerUrlRef.current = ""; }
    };
  }, []);

  const openImageViewer = useCallback((fileMeta) => {
    const fileId = fileMeta?.fileId || fileMeta?.id;
    const iv = fileMeta?.iv;
    const name = fileMeta?.name || "Изображение";
    const type = fileMeta?.type || "image/*";
    if (!fileId || !iv) { setActionError("Не удалось открыть изображение"); return; }
    let items = imageGallery;
    let startIndex = items.findIndex((item) => item.fileId === fileId && item.iv === iv);
    if (startIndex < 0) startIndex = items.findIndex((item) => item.fileId === fileId);
    if (startIndex < 0) { items = [{ fileId, iv, name, type }, ...items]; startIndex = 0; }
    loadImageViewerItem(items, startIndex);
  }, [imageGallery, loadImageViewerItem]);

  const navigateImageViewer = useCallback((delta) => {
    const current = imageViewerStateRef.current;
    const items = current?.items || [];
    if (items.length <= 1) return;
    const nextIndex = ((current.index + delta) % items.length + items.length) % items.length;
    loadImageViewerItem(items, nextIndex);
  }, [loadImageViewerItem]);

  useEffect(() => {
    if (!imageViewer) return;
    const onKeyDown = (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); navigateImageViewer(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); navigateImageViewer(1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageViewer, navigateImageViewer]);

  const parseMentions = (textValue, participants) => {
    const ids = [];
    for (const p of participants || []) {
      const name = p.display_name || p.username;
      if (!name) continue;
      const re = new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$|[^\\w-])`);
      if (re.test(textValue)) ids.push(p.user_id);
    }
    return ids;
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setText(value);
    const cursor = e.target.selectionStart;
    const before = value.slice(0, cursor);
    const match = before.match(/(?:^|\s)@(\S*)$/);
    setMentionQuery(match ? match[1] : null);
  };

  const pickMention = (participant) => {
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, cursor).replace(/@\S*$/, "");
    const after = text.slice(cursor);
    const insertion = `@${participant.display_name || participant.username} `;
    setText(before + insertion + after);
    setMentionQuery(null);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setActionError("");
    let ok = false;
    if (editTarget?.id) {
      ok = await editMsg(chat.id, editTarget.id, trimmed);
    } else {
      const mentioned = parseMentions(trimmed, chat?.participants || []);
      const options = {};
      if (replyTargets[chat?.id]) options.replyToMessageId = replyTargets[chat.id].id;
      if (mentioned.length > 0) options.mentionedUserIds = mentioned;
      ok = await sendMsg(chat.id, trimmed, options);
    }
    if (ok) { setText(""); setEditTarget(null); setMentionQuery(null); }
    else { setActionError(editTarget ? "Не удалось отредактировать сообщение" : "Не удалось отправить сообщение"); }
    setSending(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFile = async (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setSending(true);
    setActionError("");
    const result = await sendFiles(chat.id, selected);
    if (!result?.ok) {
      if ((result?.sent || 0) === 0) {
        setActionError("Не удалось отправить файлы");
      } else {
        const shortFailed = (result.failed || []).slice(0, 3).join(", ");
        const tail = (result.failed || []).length > 3 ? "…" : "";
        setActionError(`Отправлено ${result.sent} из ${result.total}. Ошибка: ${shortFailed}${tail}`);
      }
    }
    setSending(false);
    e.target.value = "";
  };

  const handleStartEdit = (msg) => {
    setEditTarget(msg); setText(msg.text || ""); setShowEmoji(false); setContextMenu(null);
  };

  const handleDelete = async (msg, scope) => {
    setContextMenu(null);
    const ok = await deleteMsg(chat.id, msg.id, scope);
    if (!ok) setActionError("Не удалось удалить сообщение");
  };

  const handleForwardToChat = async (targetChatId) => {
    if (!forwardTarget) return;
    setSending(true);
    setActionError("");
    const ok = await forwardMsg(chat.id, forwardTarget.id, targetChatId);
    if (!ok) setActionError("Не удалось переслать сообщение");
    setSending(false);
    if (ok) setForwardTarget(null);
  };

  const handleTogglePin = async () => {
    if (metaBusy) return;
    setMetaBusy(true);
    setActionError("");
    const result = await updateChatSettings(chat.id, { isPinned: !chat.is_pinned });
    if (!result?.ok) setActionError(result?.error || "Не удалось обновить закрепление");
    setMetaBusy(false);
  };

  const handleEditInternalMeta = async () => {
    if (!canEditInternalChat || metaBusy) return;
    const titleInput = window.prompt("Название чата", chat.title || "Чат");
    if (titleInput == null) return;
    const iconInput = window.prompt("Иконка чата", chat.icon || "💬");
    if (iconInput == null) return;
    setMetaBusy(true);
    setActionError("");
    const result = await updateChatSettings(chat.id, { title: titleInput, icon: iconInput });
    if (!result?.ok) setActionError(result?.error || "Не удалось обновить чат");
    setMetaBusy(false);
  };

  const grouped = useMemo(() => {
    const items = [];
    let lastDate = null;
    for (const msg of msgList) {
      const d = fmtDate(msg.created_at);
      if (d !== lastDate) { items.push({ type: "date", d }); lastDate = d; }
      items.push({ type: "msg", msg });
    }
    return items;
  }, [msgList]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const canEdit = !readOnly && contextMenu?.msg && contextMenu.msg.sender_id === user.id && contextMenu.msg.msg_type === "text" && !contextMenu.msg.deleted_for_all;
  const canDeleteForAll = !readOnly && contextMenu?.msg && (contextMenu.msg.sender_id === user.id || user.role === "admin");
  const forwardChats = (chats || []).filter((c) => c.id !== chat.id);
  const meInChat = (chat.participants || []).find((p) => p.user_id === user.id) || null;
  const canEditInternalChat = !readOnly && (!!chat.is_internal) && (meInChat?.role_in_chat === "owner" || user.role === "admin");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Selection action bar */}
      {selectionMode && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
          borderBottom: `1px solid ${$.brd}`, background: $.bgC, flexShrink: 0,
        }}>
          <button type="button" onClick={exitSelectionMode}
                  style={{ border: "none", background: "transparent", color: $.tx, fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ flex: 1, fontWeight: 600 }}>Выбрано: {selectedIds.length}</div>
          <button type="button"
            onClick={() => {
              if (selectedIds.length === 0) return;
              const list = msgList.filter((m) => selectedSet.has(m.id));
              const onlyMine = list.length > 0 && list.every((m) => m.sender_id === user.id);
              const canForAll = onlyMine || user.role === "admin";
              setDeleteSheet({ ids: [...selectedIds], canForAll });
            }}
            style={{ height: 36, padding: "0 12px", borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, cursor: "pointer" }}>
            Удалить
          </button>
        </div>
      )}

      {/* Header */}
      {!selectionMode && (
        searchOpen ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, borderBottom: `1px solid ${$.brd}`, flexShrink: 0 }}>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск в чате..."
              style={{ flex: 1, height: 36, padding: "0 12px", border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bg, color: $.tx }}
            />
            <div style={{ fontSize: 12, color: $.txS, minWidth: 60 }}>
              {searchResults.length > 0 ? `${searchIndex + 1}/${searchResults.length}` : "—"}
            </div>
            <button type="button" disabled={searchResults.length === 0}
                    onClick={() => { const n = (searchIndex - 1 + searchResults.length) % searchResults.length; setSearchIndex(n); onJumpToMessage(searchResults[n].messageId); }}>↑</button>
            <button type="button" disabled={searchResults.length === 0}
                    onClick={() => { const n = (searchIndex + 1) % searchResults.length; setSearchIndex(n); onJumpToMessage(searchResults[n].messageId); }}>↓</button>
            <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}>×</button>
          </div>
        ) : (
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${$.brd}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>{chat.icon || (chat.is_internal ? "💬" : "👤")}</span>
                <span>{chat.title}</span>
                {chat.is_pinned && <span style={{ fontSize: 12, color: $.ac }}>📌</span>}
              </div>
              <div style={{ fontSize: 11, color: $.txM }}>
                {(chat.participants || []).map((p) => p.display_name || p.username).join(", ")}
              </div>
            </div>
            <button type="button" onClick={() => setSearchOpen(true)}
                    style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", color: $.tx, cursor: "pointer", fontSize: 16 }}>🔍</button>
            <Button variant="pill" tone="accent" size="sm" active={chat.is_pinned} onClick={handleTogglePin} disabled={metaBusy} title={chat.is_pinned ? "Открепить чат" : "Закрепить чат"}>📌</Button>
            {canEditInternalChat && (
              <Button variant="ghost" size="sm" onClick={handleEditInternalMeta} disabled={metaBusy} title="Изменить имя и иконку">✎</Button>
            )}
            <Button variant="soft" tone="accent" size="sm" onClick={() => setShowParticipants(!showParticipants)} title="Участники">
              👥 {(chat.participants || []).length}
            </Button>
          </div>
        )
      )}

      {/* PinBar */}
      {chatPins.length > 0 && (
        <MessengerPinBar
          pinnedMessages={chatPins}
          currentIndex={pinCycleIndex}
          onClickNext={() => {
            if (chatPins.length === 0) return;
            const target = chatPins[pinCycleIndex];
            if (target) onJumpToMessage(target.id);
            setPinCycleIndex((i) => (i + 1) % chatPins.length);
          }}
          onUnpin={(item) => {
            if (!item) return;
            if (item._personal) unpinForMe(chat.id, item.id);
            else unpinForAll(chat.id, item.id);
          }}
          canUnpin={true}
        />
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column" }}>
        {msgList.length === 0 && (
          <div style={{ margin: "auto", textAlign: "center", color: $.txM, fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            Сообщений пока нет.<br />Начните переписку!
          </div>
        )}
        {grouped.map((item, i) => item.type === "date"
          ? (
            <div key={`d-${i}`} style={{ textAlign: "center", fontSize: 11, color: $.txM, margin: "8px 0" }}>
              <span style={{ background: $.bgI, padding: "2px 10px", borderRadius: 10 }}>{item.d}</span>
            </div>
          )
          : (
            <div
              key={item.msg.id}
              ref={(el) => { if (el) messageRefs.current.set(item.msg.id, el); else messageRefs.current.delete(item.msg.id); }}
              onClick={(e) => { if (selectionMode) { toggleSelection(item.msg.id); e.preventDefault(); } }}
            >
              <MessageBubble
                msg={item.msg}
                isMine={item.msg.sender_id === user.id}
                chatReceipts={chatReceipts}
                participants={chat.participants}
                currentUserId={user.id}
                chatId={chat.id}
                downloadFile={downloadFile}
                downloadFiles={downloadFiles}
                getFileUrl={getFileUrl}
                onOpenImage={openImageViewer}
                onContextMenu={(e, msg) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, msg }); }}
                replyToMessage={item.msg.reply_to_message_id ? findMessageById(item.msg.reply_to_message_id) : null}
                onJumpToMessage={onJumpToMessage}
                selectionMode={selectionMode}
                isSelected={selectedSet.has(item.msg.id)}
                onToggleSelection={toggleSelection}
              />
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {readOnly ? (
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${$.brd}`, flexShrink: 0, fontSize: 12, color: $.txM, textAlign: "center" }}>
          У вас доступ к мессенджеру только для чтения
        </div>
      ) : (
      <div style={{ padding: "10px 14px", borderTop: `1px solid ${$.brd}`, flexShrink: 0 }}>
        {editTarget && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "6px 10px", borderRadius: 8, background: $.bgI, border: `1px solid ${$.brd}` }}>
            <div style={{ fontSize: 11, color: $.txM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Редактирование: {editTarget.text?.slice(0, 80)}
            </div>
            <Button variant="bare" tone="danger" size="xs" onClick={() => { setEditTarget(null); setText(""); }}>Отмена</Button>
          </div>
        )}

        {/* Reply preview */}
        {replyTargets[chat?.id] && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", borderTop: `1px solid ${$.brd}`, background: $.bgC,
            marginBottom: 8, borderRadius: 8,
          }}>
            <div style={{ width: 3, height: 32, background: $.ac, borderRadius: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: $.ac }}>Ответ на:</div>
              <div style={{ fontSize: 12, color: $.txS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {replyTargets[chat.id].text?.slice(0, 80) || "[файл]"}
              </div>
            </div>
            <button type="button" onClick={() => clearReplyTarget(chat.id)}
                    style={{ border: "none", background: "transparent", color: $.txS, fontSize: 18, cursor: "pointer" }}
                    aria-label="Отменить ответ">×</button>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", position: "relative" }}>
          {showEmoji && !voiceActive && <EmojiPicker onPick={(em) => { setText((t) => t + em); setShowEmoji(false); }} />}
          {!voiceActive && (
            <>
              <Button variant="bare" tone="neutral" size="icon" onClick={() => setShowEmoji(!showEmoji)}>😊</Button>
              <Button variant="bare" tone="neutral" size="icon" onClick={() => fileRef.current?.click()} title="Прикрепить файлы">📎</Button>
              <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={handleFile} />
              <div style={{ flex: 1, position: "relative" }}>
                {mentionQuery !== null && (
                  <MessengerMentionPicker
                    participants={chat?.participants || []}
                    query={mentionQuery}
                    onPick={pickMention}
                    currentUserId={user?.id}
                  />
                )}
                <TextArea
                  inputRef={textareaRef}
                  value={text}
                  onChange={handleInputChange}
                  onKeyDown={handleKey}
                  placeholder={editTarget ? "Измените сообщение..." : "Сообщение... (Enter — отправить, Shift+Enter — новая строка)"}
                  rows={1}
                  resize="none"
                  minHeight={40}
                  maxHeight={120}
                  lineHeight={1.5}
                />
              </div>
            </>
          )}
          {!editTarget && (
            <MessengerVoiceRecorder
              disabled={!chat || cryptoReady === false}
              onActiveChange={setVoiceActive}
              onSend={(payload) => sendVoiceMessage(chat.id, payload)}
            />
          )}
          {!voiceActive && (
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              style={{
                background: $.ac, color: "#fff", border: "none", borderRadius: 10,
                width: 40, height: 40, cursor: text.trim() ? "pointer" : "default",
                fontSize: 18, flexShrink: 0, opacity: text.trim() ? 1 : .4,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit",
              }}
            >{editTarget ? "✓" : "➤"}</button>
          )}
        </div>
        {actionError && <div style={{ fontSize: 11, color: $.dn, marginTop: 6, paddingLeft: 4 }}>{actionError}</div>}
        <div style={{ fontSize: 10, color: $.txM, marginTop: 4, paddingLeft: 4 }}>🔒 Сообщения зашифрованы</div>
      </div>
      )}

      {contextMenu && (() => {
        const msg = contextMenu.msg || {};
        const isOwn = Number(msg.sender_id) === Number(user.id);
        const readersForMsg = chatReceipts
          .filter((rc) => rc.last_read_message_id >= msg.id && rc.user_id !== msg.sender_id)
          .map((rc) => {
            const p = (chat.participants || []).find((x) => x.user_id === rc.user_id);
            return { userId: rc.user_id, name: p?.username || `#${rc.user_id}`, avatar: p?.avatar_url || null };
          });
        const myPins = pinnedForMe[chat?.id] || [];
        return (
        <MessengerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canEdit={canEdit}
          canDeleteForAll={canDeleteForAll}
          msgType={contextMenu.msg?.msg_type}
          isOwnMessage={isOwn}
          readersPreview={readersForMsg}
          readersCount={readersForMsg.length}
          onShowReaders={(rect) => setReadersPopover({ messageId: msg.id, anchorRect: rect })}
          onReply={() => { setReplyTarget(chat.id, contextMenu.msg); setContextMenu(null); }}
          onForward={() => { setContextMenu(null); setForwardTarget(contextMenu.msg); }}
          onEdit={() => handleStartEdit(contextMenu.msg)}
          onDeleteSelf={() => handleDelete(contextMenu.msg, "self")}
          onDeleteAll={() => handleDelete(contextMenu.msg, "all")}
          onPinForAll={() => { pinForAll(chat.id, contextMenu.msg.id); setContextMenu(null); }}
          onUnpinForAll={() => { unpinForAll(chat.id, contextMenu.msg.id); setContextMenu(null); }}
          onPinForMe={async () => {
            const id = contextMenu.msg.id;
            setContextMenu(null);
            const r = await pinForMe(chat.id, id);
            if (r && r.ok === false) setActionError(r.error || "Не удалось закрепить");
          }}
          onUnpinForMe={async () => {
            const id = contextMenu.msg.id;
            setContextMenu(null);
            const r = await unpinForMe(chat.id, id);
            if (r && r.ok === false) setActionError(r.error || "Не удалось открепить");
          }}
          isPinnedForAll={!!contextMenu.msg?.pinned_at}
          isPinnedForMe={myPins.some((m) => m.id === contextMenu.msg?.id)}
          canPinForAll={chatPins.length < 5}
          canPinForMe={myPins.length < 5}
          onCopy={() => { navigator.clipboard?.writeText(contextMenu.msg?.text || ""); setContextMenu(null); }}
          onEnterSelection={() => { enterSelectionMode(contextMenu.msg?.id); setContextMenu(null); }}
        />
        );
      })()}

      {readersPopover && (
        <MessengerReadersPopover
          chatId={chat.id}
          messageId={readersPopover.messageId}
          anchorRect={readersPopover.anchorRect}
          onClose={() => setReadersPopover(null)}
        />
      )}

      {forwardTarget && (
        <MessengerForwardModal
          chats={forwardChats}
          onForwardToChat={handleForwardToChat}
          onClose={() => setForwardTarget(null)}
        />
      )}

      {imageViewer && (
        <MessengerImageViewer
          imageViewer={imageViewer}
          onClose={closeImageViewer}
          onNavigate={navigateImageViewer}
        />
      )}

      {/* Delete confirmation modal — Telegram-style */}
      {deleteSheet && (
        <>
          <div onClick={() => setDeleteSheet(null)}
               style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998 }} />
          <div role="dialog" aria-label="Удалить сообщения"
               style={{
                 position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                 width: "min(360px, 92vw)", background: $.bgC, color: $.tx,
                 border: `1px solid ${$.brd}`, borderRadius: 12, padding: 18, zIndex: 9999,
                 boxShadow: $.sh, display: "grid", gap: 10,
               }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Удалить {deleteSheet.ids.length} сообщ.?</div>
            <div style={{ fontSize: 13, color: $.txS }}>
              {deleteSheet.canForAll
                ? "Можно удалить только у себя или у всех участников чата."
                : "В выделении есть чужие сообщения — у всех удалить нельзя, только у себя."}
            </div>
            <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
              {deleteSheet.canForAll && (
                <button type="button"
                  onClick={async () => {
                    const ids = deleteSheet.ids;
                    setDeleteSheet(null);
                    const r = await bulkDelete(chat.id, ids, "all");
                    if (r && r.ok === false) setActionError(r.error || "Не удалось удалить");
                  }}
                  style={{ height: 40, borderRadius: 8, border: "none", background: $.dn, color: "#fff",
                           fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  Удалить у всех
                </button>
              )}
              <button type="button"
                onClick={async () => {
                  const ids = deleteSheet.ids;
                  setDeleteSheet(null);
                  const r = await bulkDelete(chat.id, ids, "self");
                  if (r && r.ok === false) setActionError(r.error || "Не удалось удалить");
                }}
                style={{ height: 40, borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx,
                         fontWeight: 500, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Удалить у меня
              </button>
              <button type="button"
                onClick={() => setDeleteSheet(null)}
                style={{ height: 40, borderRadius: 8, border: "none", background: "transparent", color: $.tx,
                         fontWeight: 500, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Отмена
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
