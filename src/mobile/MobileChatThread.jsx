import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";
import EmojiPicker from "../components/EmojiPicker";
import MessageBubble from "../components/MessageBubble";
import MessengerContextMenu from "../components/MessengerContextMenu";
import MessengerPinBar from "../components/MessengerPinBar";
import MessengerMentionPicker from "../components/MessengerMentionPicker";
import MobileChatSearchOverlay from "./MobileChatSearchOverlay";
import { fmtDate } from "../utils/messengerUiUtils";

export default function MobileChatThread({ onBack }) {
  const { user } = useAuth();
  const { $ } = useTheme();
  const {
    activeChatId,
    chats,
    messages,
    loadMessages,
    sendMsg,
    sendFiles,
    markRead,
    downloadFile,
    downloadFiles,
    getFileUrl,
    pinnedForAll,
    pinnedForMe,
    replyTargets,
    selectionMode,
    selectedIds,
    pinForAll,
    unpinForAll,
    pinForMe,
    unpinForMe,
    setReplyTarget,
    clearReplyTarget,
    enterSelectionMode,
    exitSelectionMode,
    toggleSelection,
    bulkDelete,
  } = useMessenger();

  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [ctx, setCtx] = useState(null); // { x, y, msg } | null
  const [pinCycleIndex, setPinCycleIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState(null);

  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const messageRefs = useRef(new Map());

  const activeChat = chats.find((chat) => chat.id === activeChatId) || null;
  const msgList = messages[activeChatId] || [];

  useEffect(() => {
    if (activeChatId && !messages[activeChatId]) loadMessages(activeChatId);
  }, [activeChatId, loadMessages, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgList.length]);

  useEffect(() => {
    const last = msgList[msgList.length - 1];
    if (last && last.sender_id !== user?.id) markRead(activeChatId, last.id);
  }, [activeChatId, markRead, msgList, user?.id]);

  const grouped = useMemo(() => {
    const items = [];
    let lastDate = "";
    for (const msg of msgList) {
      const date = fmtDate(msg.created_at);
      if (date !== lastDate) {
        items.push({ type: "date", date });
        lastDate = date;
      }
      items.push({ type: "message", msg });
    }
    return items;
  }, [msgList]);

  const findMessageById = useCallback((id) => {
    const list = messages[activeChatId] || [];
    return list.find((m) => m.id === id) || null;
  }, [messages, activeChatId]);

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

  const LONG_PRESS_MS = 400;
  const MOVE_TOLERANCE = 8;

  const longPressHandlers = (msg) => {
    let timer = null;
    let startX = 0;
    let startY = 0;
    return {
      onPointerDown: (e) => {
        startX = e.clientX; startY = e.clientY;
        timer = window.setTimeout(() => {
          if (navigator.vibrate) navigator.vibrate(10);
          setCtx({ x: startX, y: startY, msg });
        }, LONG_PRESS_MS);
      },
      onPointerMove: (e) => {
        if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE || Math.abs(e.clientY - startY) > MOVE_TOLERANCE) {
          window.clearTimeout(timer);
        }
      },
      onPointerUp: () => { window.clearTimeout(timer); },
      onPointerCancel: () => { window.clearTimeout(timer); },
      onContextMenu: (e) => { e.preventDefault(); },
    };
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !activeChat) return;
    setSending(true);
    setError("");
    const mentioned = parseMentions(trimmed, activeChat?.participants || []);
    const options = {};
    if (replyTargets[activeChat?.id]) options.replyToMessageId = replyTargets[activeChat.id].id;
    if (mentioned.length > 0) options.mentionedUserIds = mentioned;
    const ok = await sendMsg(activeChat.id, trimmed, options);
    if (ok) {
      setText("");
      setShowEmoji(false);
      setMentionQuery(null);
    } else {
      setError("Не удалось отправить сообщение");
    }
    setSending(false);
  };

  const handleFile = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!activeChat || selectedFiles.length === 0) return;
    setSending(true);
    setError("");
    const result = await sendFiles(activeChat.id, selectedFiles);
    if (!result?.ok) {
      setError(result?.sent ? `Отправлено ${result.sent} из ${result.total}` : "Не удалось отправить файлы");
    }
    setSending(false);
    event.target.value = "";
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (event) => {
    const val = event.target.value;
    setText(val);
    // detect @mention query
    const cursor = event.target.selectionStart;
    const before = val.slice(0, cursor);
    const match = before.match(/@(\S*)$/);
    setMentionQuery(match ? match[1] : null);
  };

  const openImage = async (fileMeta) => {
    if (!activeChat || !fileMeta?.fileId) return;
    const popup = window.open("", "_blank", "noopener,noreferrer");
    try {
      const url = await getFileUrl(activeChat.id, fileMeta.fileId, fileMeta.iv, fileMeta.type || "image/*");
      if (!url) {
        popup?.close();
        setError("Не удалось открыть изображение");
        return;
      }
      if (popup) {
        popup.location.href = url;
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileMeta.name || "image";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch {
      popup?.close();
      setError("Не удалось открыть изображение");
    }
  };

  if (!activeChat) {
    return (
      <main style={{ height: "100dvh", background: $.bg, color: $.tx, padding: "calc(env(safe-area-inset-top) + 14px) 16px", fontFamily: "system-ui, sans-serif" }}>
        <button type="button" onClick={onBack} style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx }}>‹</button>
      </main>
    );
  }

  return (
    <main style={{ height: "100dvh", background: $.bg, color: $.tx, display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif", overflow: "hidden" }}>
      {/* Context menu overlay */}
      {ctx && (
        <>
          <div onClick={() => setCtx(null)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
          <MessengerContextMenu
            x={ctx.x} y={ctx.y}
            msgType={ctx.msg.msg_type}
            canEdit={ctx.msg.sender_id === user?.id && !ctx.msg.deleted_for_all && ctx.msg.msg_type === "text"}
            canDeleteForAll={ctx.msg.sender_id === user?.id}
            isPinnedForAll={!!ctx.msg.pinned_at}
            isPinnedForMe={(pinnedForMe[activeChat?.id] || []).some((m) => m.id === ctx.msg.id)}
            canPinForAll={(pinnedForAll[activeChat?.id] || []).length < 5}
            canPinForMe={(pinnedForMe[activeChat?.id] || []).length < 5}
            onReply={() => { setReplyTarget(activeChat.id, ctx.msg); setCtx(null); }}
            onForward={() => { setCtx(null); }}
            onEdit={() => { setCtx(null); }}
            onCopy={() => { navigator.clipboard?.writeText(ctx.msg.text || ""); setCtx(null); }}
            onPinForAll={() => { pinForAll(activeChat.id, ctx.msg.id); setCtx(null); }}
            onUnpinForAll={() => { unpinForAll(activeChat.id, ctx.msg.id); setCtx(null); }}
            onPinForMe={() => { pinForMe(activeChat.id, ctx.msg.id); setCtx(null); }}
            onUnpinForMe={() => { unpinForMe(activeChat.id, ctx.msg.id); setCtx(null); }}
            onDeleteSelf={() => { setCtx(null); }}
            onDeleteAll={() => { setCtx(null); }}
            onEnterSelection={() => { enterSelectionMode(ctx.msg.id); setCtx(null); }}
          />
        </>
      )}

      {/* Search overlay */}
      {searchOpen && (
        <MobileChatSearchOverlay
          chatId={activeChat.id}
          onClose={() => setSearchOpen(false)}
          onJumpToMessage={(id) => {
            const el = messageRefs.current.get(id);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      )}

      {/* Header — selection mode or normal */}
      {selectionMode ? (
        <header style={{ padding: "calc(env(safe-area-inset-top) + 10px) 12px 10px", borderBottom: `1px solid ${$.brd}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button type="button" onClick={exitSelectionMode} style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 18 }}>✕</button>
          <div style={{ flex: 1, fontWeight: 700 }}>Выбрано: {selectedIds.length}</div>
          <button type="button" onClick={async () => {
              if (selectedIds.length === 0) return;
              const choice = window.confirm(`Удалить ${selectedIds.length} сообщ. у всех? (Отмена = у себя)`);
              const scope = choice ? "all" : "self";
              const r = await bulkDelete(activeChat.id, selectedIds, scope);
              if (!r.ok && r.error?.includes?.("BULK_DELETE_FORBIDDEN")) alert("Нельзя удалить чужие у всех");
            }} style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 18 }}>🗑</button>
        </header>
      ) : (
        <header style={{ padding: "calc(env(safe-area-inset-top) + 10px) 12px 10px", borderBottom: `1px solid ${$.brd}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button type="button" onClick={onBack} aria-label="Назад" style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 22 }}>‹</button>
          <span style={{ width: 40, height: 40, borderRadius: 13, background: $.bgC, display: "grid", placeItems: "center", fontSize: 19, flexShrink: 0 }}>
            {activeChat.icon || (activeChat.is_internal ? "💬" : "👤")}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 750, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0 }}>{activeChat.title || "Чат"}</div>
            <div style={{ fontSize: 12, color: $.txS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {(activeChat.participants || []).map((participant) => participant.display_name || participant.username).filter(Boolean).join(", ")}
            </div>
          </div>
          <button type="button" onClick={() => setSearchOpen(true)} aria-label="Поиск" style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 18 }}>🔍</button>
        </header>
      )}

      {/* Pin bar */}
      {(pinnedForAll[activeChat?.id] || []).length > 0 && (
        <MessengerPinBar
          pinnedMessages={pinnedForAll[activeChat?.id]}
          currentIndex={pinCycleIndex}
          onClickNext={() => {
            const list = pinnedForAll[activeChat?.id];
            const target = list[pinCycleIndex];
            if (target) {
              const el = messageRefs.current.get(target.id);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            setPinCycleIndex((i) => (i + 1) % list.length);
          }}
          onUnpin={(id) => unpinForAll(activeChat.id, id)}
        />
      )}

      <section style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 10px", display: "flex", flexDirection: "column" }}>
        {msgList.length === 0 && (
          <div style={{ margin: "auto", textAlign: "center", color: $.txS, fontSize: 14 }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>💬</div>
            Сообщений пока нет
          </div>
        )}
        {grouped.map((item, index) => item.type === "date" ? (
          <div key={`date-${item.date}-${index}`} style={{ textAlign: "center", fontSize: 11, color: $.txS, margin: "8px 0" }}>
            <span style={{ background: $.bgI, padding: "2px 10px", borderRadius: 10 }}>{item.date}</span>
          </div>
        ) : (
          <div
            key={item.msg.id || item.msg.client_message_id}
            {...longPressHandlers(item.msg)}
            ref={(el) => { if (el) messageRefs.current.set(item.msg.id, el); else messageRefs.current.delete(item.msg.id); }}
          >
            <MessageBubble
              msg={item.msg}
              isMine={item.msg.sender_id === user?.id}
              chatReceipts={activeChat.receipts || []}
              participants={activeChat.participants || []}
              currentUserId={user?.id}
              chatId={activeChat.id}
              downloadFile={downloadFile}
              downloadFiles={downloadFiles}
              getFileUrl={getFileUrl}
              onOpenImage={openImage}
              replyToMessage={item.msg.reply_to_message_id ? findMessageById(item.msg.reply_to_message_id) : null}
              onJumpToMessage={(id) => { const el = messageRefs.current.get(id); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
              selectionMode={selectionMode}
              isSelected={selectedIds.includes(item.msg.id)}
              onToggleSelection={toggleSelection}
            />
            {item.msg.pending && (
              <div style={{ textAlign: "right", color: $.txS, fontSize: 10, margin: "-3px 8px 6px" }}>Отправляется...</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </section>

      <footer style={{ padding: "8px 10px calc(env(safe-area-inset-bottom) + 8px)", borderTop: `1px solid ${$.brd}`, flexShrink: 0 }}>
        {error && <div style={{ color: $.dn, fontSize: 12, margin: "0 4px 6px" }}>{error}</div>}

        {/* Reply preview */}
        {replyTargets[activeChat?.id] && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 8px" }}>
            <div style={{ width: 3, height: 32, background: $.ac, borderRadius: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: $.ac }}>Ответ на:</div>
              <div style={{ fontSize: 12, color: $.txS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {replyTargets[activeChat.id].text?.slice(0, 80) || "[файл]"}
              </div>
            </div>
            <button type="button" onClick={() => clearReplyTarget(activeChat.id)}
                    style={{ border: "none", background: "transparent", color: $.txS, fontSize: 20 }}>×</button>
          </div>
        )}

        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 8 }}>
          {showEmoji && <EmojiPicker onPick={(emoji) => { setText((value) => value + emoji); setShowEmoji(false); }} />}
          <button type="button" onClick={() => setShowEmoji((value) => !value)} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, flexShrink: 0 }}>😊</button>
          <button type="button" onClick={() => fileRef.current?.click()} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, flexShrink: 0 }}>📎</button>
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={handleFile} />
          <div style={{ flex: 1, position: "relative" }}>
            {mentionQuery !== null && (
              <MessengerMentionPicker
                query={mentionQuery}
                participants={activeChat.participants || []}
                onSelect={(participant) => {
                  const name = participant.display_name || participant.username;
                  const val = text;
                  const cursor = textareaRef.current?.selectionStart ?? val.length;
                  const before = val.slice(0, cursor).replace(/@\S*$/, `@${name} `);
                  const after = val.slice(cursor);
                  setText(before + after);
                  setMentionQuery(null);
                  setTimeout(() => textareaRef.current?.focus(), 0);
                }}
              />
            )}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="Сообщение..."
              rows={1}
              style={{
                width: "100%",
                minHeight: 40,
                maxHeight: 112,
                borderRadius: 14,
                border: `1px solid ${$.brd}`,
                background: $.bgC,
                color: $.tx,
                resize: "none",
                padding: "10px 12px",
                fontSize: 16,
                lineHeight: 1.35,
                outline: "none",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            style={{ width: 42, height: 40, borderRadius: 12, border: 0, background: $.ac, color: "#fff", opacity: !text.trim() || sending ? 0.45 : 1, flexShrink: 0, fontSize: 18 }}
          >
            ➤
          </button>
        </div>
      </footer>
    </main>
  );
}

