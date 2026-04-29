import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import EmojiPicker from "./EmojiPicker";
import MessageBubble from "./MessageBubble";
import MessengerContextMenu from "./MessengerContextMenu";
import MessengerForwardModal from "./MessengerForwardModal";
import MessengerImageViewer from "./MessengerImageViewer";
import TextArea from "./TextArea";
import { fmtDate, parseBundleFiles, isImageLike } from "../utils/messengerUiUtils";

export default function MessengerChatWindow({
  chat, chats, user, messages,
  sendMsg, sendFiles, forwardMsg, editMsg, deleteMsg,
  markRead, downloadFile, downloadFiles, getFileUrl, showParticipants, setShowParticipants,
  updateChatSettings,
}) {
  const { $ } = useTheme();
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [forwardTarget, setForwardTarget] = useState(null);
  const [actionError, setActionError] = useState("");
  const [metaBusy, setMetaBusy] = useState(false);
  const [imageViewer, setImageViewer] = useState(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const imageViewerUrlRef = useRef("");
  const imageViewerReqRef = useRef(0);
  const imageViewerStateRef = useRef(null);
  const msgList = messages[chat.id] || [];
  const chatReceipts = chat.receipts || [];

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

  useEffect(() => {
    const last = msgList[msgList.length - 1];
    if (last && last.sender_id !== user.id) markRead(chat.id, last.id);
  }, [msgList.length, chat.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const close = () => setContextMenu(null);
    const closeOnEsc = (e) => {
      if (e.key === "Escape") { setContextMenu(null); setForwardTarget(null); closeImageViewer(); }
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", closeOnEsc);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", closeOnEsc); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { imageViewerStateRef.current = imageViewer; }, [imageViewer]);

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

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setActionError("");
    let ok = false;
    if (editTarget?.id) { ok = await editMsg(chat.id, editTarget.id, trimmed); }
    else { ok = await sendMsg(chat.id, trimmed); }
    if (ok) { setText(""); setEditTarget(null); }
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
    const title = scope === "all" ? "Удалить сообщение у всех?" : "Удалить сообщение только у себя?";
    if (!window.confirm(title)) return;
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

  const grouped = [];
  let lastDate = null;
  for (const msg of msgList) {
    const d = fmtDate(msg.created_at);
    if (d !== lastDate) { grouped.push({ type: "date", d }); lastDate = d; }
    grouped.push({ type: "msg", msg });
  }

  const canEdit = contextMenu?.msg && contextMenu.msg.sender_id === user.id && contextMenu.msg.msg_type === "text";
  const canDeleteForAll = contextMenu?.msg && (contextMenu.msg.sender_id === user.id || user.role === "admin");
  const forwardChats = (chats || []).filter((c) => c.id !== chat.id);
  const meInChat = (chat.participants || []).find((p) => p.user_id === user.id) || null;
  const canEditInternalChat = (!!chat.is_internal) && (meInChat?.role_in_chat === "owner" || user.role === "admin");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
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
        <Button variant="pill" tone="accent" size="sm" active={chat.is_pinned} onClick={handleTogglePin} disabled={metaBusy} title={chat.is_pinned ? "Открепить чат" : "Закрепить чат"}>📌</Button>
        {canEditInternalChat && (
          <Button variant="ghost" size="sm" onClick={handleEditInternalMeta} disabled={metaBusy} title="Изменить имя и иконку">✎</Button>
        )}
        <Button variant="soft" tone="accent" size="sm" onClick={() => setShowParticipants(!showParticipants)} title="Участники">
          👥 {(chat.participants || []).length}
        </Button>
      </div>

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
            <MessageBubble
              key={item.msg.id}
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
            />
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "10px 14px", borderTop: `1px solid ${$.brd}`, flexShrink: 0 }}>
        {editTarget && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "6px 10px", borderRadius: 8, background: $.bgI, border: `1px solid ${$.brd}` }}>
            <div style={{ fontSize: 11, color: $.txM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Редактирование: {editTarget.text?.slice(0, 80)}
            </div>
            <Button variant="bare" tone="danger" size="xs" onClick={() => { setEditTarget(null); setText(""); }}>Отмена</Button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", position: "relative" }}>
          {showEmoji && <EmojiPicker onPick={(em) => { setText((t) => t + em); setShowEmoji(false); }} />}
          <Button variant="bare" tone="neutral" size="icon" onClick={() => setShowEmoji(!showEmoji)}>😊</Button>
          <Button variant="bare" tone="neutral" size="icon" onClick={() => fileRef.current?.click()} title="Прикрепить файлы">📎</Button>
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={handleFile} />
          <div style={{ flex: 1 }}>
            <TextArea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKey}
              placeholder={editTarget ? "Измените сообщение..." : "Сообщение... (Enter — отправить, Shift+Enter — новая строка)"}
              rows={1}
              resize="none"
              minHeight={40}
              maxHeight={120}
              lineHeight={1.5}
            />
          </div>
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
        </div>
        {actionError && <div style={{ fontSize: 11, color: $.dn, marginTop: 6, paddingLeft: 4 }}>{actionError}</div>}
        <div style={{ fontSize: 10, color: $.txM, marginTop: 4, paddingLeft: 4 }}>🔒 Сообщения зашифрованы</div>
      </div>

      {contextMenu && (
        <MessengerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canEdit={canEdit}
          canDeleteForAll={canDeleteForAll}
          onForward={() => { setContextMenu(null); setForwardTarget(contextMenu.msg); }}
          onEdit={() => handleStartEdit(contextMenu.msg)}
          onDeleteSelf={() => handleDelete(contextMenu.msg, "self")}
          onDeleteAll={() => handleDelete(contextMenu.msg, "all")}
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
    </div>
  );
}
