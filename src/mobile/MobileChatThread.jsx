import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";
import EmojiPicker from "../components/EmojiPicker";
import MessageBubble from "../components/MessageBubble";
import MessengerContextMenu from "../components/MessengerContextMenu";
import MessengerReadersPopover from "../components/MessengerReadersPopover";
import MessengerPinBar from "../components/MessengerPinBar";
import MessengerMentionPicker from "../components/MessengerMentionPicker";
import MessengerVoiceRecorder from "../components/MessengerVoiceRecorder";
import MobileChatSearchOverlay from "./MobileChatSearchOverlay";
import { fmtDate } from "../utils/messengerUiUtils";

const LONG_PRESS_MS = 400;
const MOVE_TOLERANCE = 8;
const SWIPE_EDGE_PX = 30;           // зона у левого края, где стартует back-swipe
const SWIPE_BACK_THRESHOLD = 80;    // расстояние, после которого вернёмся к списку чатов
const SWIPE_MAX_TRACK = 280;        // насколько далеко тащим (для интерполяции)

export default function MobileChatThread({ onBack, pendingScrollId }) {
  const { user } = useAuth();
  const { $ } = useTheme();
  const {
    activeChatId,
    chats,
    messages,
    loadMessages,
    sendMsg,
    sendFiles,
    editMsg,
    deleteMsg,
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
    sendVoiceMessage,
    cryptoReady,
  } = useMessenger();

  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [ctx, setCtx] = useState(null); // { x, y, msg } | null
  const [readersSheet, setReadersSheet] = useState(null); // { messageId } | null
  const [pinCycleIndex, setPinCycleIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteSheet, setDeleteSheet] = useState(null); // { ids: number[], canForAll: boolean } | null
  const [voiceActive, setVoiceActive] = useState(false);

  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const messageRefs = useRef(new Map());
  const lpTimer = useRef(null);
  const lpStartX = useRef(0);
  const lpStartY = useRef(0);

  // Telegram-style swipe-right: edge-drag по левому краю возвращает на список чатов.
  const [swipeX, setSwipeX] = useState(0);
  const swipeStateRef = useRef({ active: false, startX: 0, startY: 0, locked: null });

  const activeChat = chats.find((chat) => chat.id === activeChatId) || null;
  const msgList = messages[activeChatId] || [];

  useEffect(() => {
    if (activeChatId && !messages[activeChatId]) loadMessages(activeChatId);
    // Не включаем messages в deps — он меняется на каждый WS-эвент и приводит к лишним перевызовам.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgList.length]);

  // markRead — только когда меняется ID последнего сообщения (а не каждый ререндер msgList).
  const lastMsgId = msgList[msgList.length - 1]?.id;
  const lastMsgSenderId = msgList[msgList.length - 1]?.sender_id;
  useEffect(() => {
    if (lastMsgId && lastMsgSenderId !== user?.id) markRead(activeChatId, lastMsgId);
  }, [activeChatId, lastMsgId, lastMsgSenderId, markRead, user?.id]);

  useEffect(() => {
    const id = pendingScrollId?.current;
    if (!id) return;
    pendingScrollId.current = null;
    const t = setTimeout(() => {
      const el = messageRefs.current.get(id);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [pendingScrollId]);

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
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

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

  // ── Swipe-back gesture (как в Telegram) ─────────────────────────────────────
  const onSwipeStart = useCallback((e) => {
    // Запускаем только при касании у левого края и одиночным пальцем.
    if (e.pointerType === "mouse") return;
    if (e.clientX > SWIPE_EDGE_PX) return;
    if (ctx || searchOpen || selectionMode || editTarget) return;
    swipeStateRef.current = { active: true, startX: e.clientX, startY: e.clientY, locked: null };
  }, [ctx, searchOpen, selectionMode, editTarget]);

  const onSwipeMove = useCallback((e) => {
    const s = swipeStateRef.current;
    if (!s.active) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    // Определяем направление один раз: если первое заметное движение по вертикали — отключаем жест,
    // чтобы не мешать скроллу ленты.
    if (s.locked == null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      s.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (s.locked === "v") { s.active = false; return; }
    }
    if (s.locked === "h" && dx > 0) {
      // Тянем содержимое вправо, но с резиновой кривой.
      const clamped = Math.min(dx, SWIPE_MAX_TRACK);
      setSwipeX(clamped);
      e.preventDefault?.();
    }
  }, []);

  const onSwipeEnd = useCallback(() => {
    const s = swipeStateRef.current;
    if (!s.active) { setSwipeX(0); return; }
    s.active = false;
    if (swipeX > SWIPE_BACK_THRESHOLD) {
      // Анимируем «уход» вправо и возвращаемся к списку.
      setSwipeX(window.innerWidth || 800);
      setTimeout(() => { setSwipeX(0); onBack?.(); }, 180);
    } else {
      // Откат назад.
      setSwipeX(0);
    }
  }, [swipeX, onBack]);

  const makeLongPressHandlers = useCallback((msg) => ({
    onPointerDown: (e) => {
      lpStartX.current = e.clientX;
      lpStartY.current = e.clientY;
      lpTimer.current = window.setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(10);
        setCtx({ x: lpStartX.current, y: lpStartY.current, msg });
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e) => {
      if (Math.abs(e.clientX - lpStartX.current) > MOVE_TOLERANCE ||
          Math.abs(e.clientY - lpStartY.current) > MOVE_TOLERANCE) {
        window.clearTimeout(lpTimer.current);
      }
    },
    onPointerUp: () => window.clearTimeout(lpTimer.current),
    onPointerCancel: () => window.clearTimeout(lpTimer.current),
    onContextMenu: (e) => e.preventDefault(),
  }), []);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !activeChat) return;
    setSending(true);
    setError("");
    let ok = false;
    if (editTarget?.id) {
      ok = await editMsg(activeChat.id, editTarget.id, trimmed);
    } else {
      const mentioned = parseMentions(trimmed, activeChat?.participants || []);
      const options = {};
      if (replyTargets[activeChat?.id]) options.replyToMessageId = replyTargets[activeChat.id].id;
      if (mentioned.length > 0) options.mentionedUserIds = mentioned;
      ok = await sendMsg(activeChat.id, trimmed, options);
    }
    if (ok) {
      setText("");
      setEditTarget(null);
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

  const handleDelete = async (msg, scope) => {
    if (!activeChat || !msg?.id) return;
    setCtx(null);
    // Без системного confirm: одиночное удаление сразу применяется, ошибки покажем красным баннером.
    const ok = await deleteMsg(activeChat.id, msg.id, scope);
    if (!ok) setError("Не удалось удалить сообщение");
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
    <main
      onPointerDown={onSwipeStart}
      onPointerMove={onSwipeMove}
      onPointerUp={onSwipeEnd}
      onPointerCancel={onSwipeEnd}
      style={{
        height: "100dvh",
        background: $.bg,
        color: $.tx,
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
        overflow: "hidden",
        transform: swipeX ? `translateX(${swipeX}px)` : undefined,
        transition: swipeX === 0 || swipeX >= SWIPE_MAX_TRACK ? "transform 180ms ease-out" : "none",
        touchAction: "pan-y",
      }}>
      {/* Context menu overlay */}
      {ctx && (() => {
        const msg = ctx.msg || {};
        const isOwn = Number(msg.sender_id) === Number(user?.id);
        const readersForMsg = (activeChat?.receipts || [])
          .filter((rc) => rc.last_read_message_id >= msg.id && rc.user_id !== msg.sender_id)
          .map((rc) => {
            const p = (activeChat?.participants || []).find((x) => x.user_id === rc.user_id);
            return { userId: rc.user_id, name: p?.username || `#${rc.user_id}`, avatar: p?.avatar_url || null };
          });
        return (
        <>
          <div onClick={() => { setCtx(null); setReadersSheet(null); }} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
          <MessengerContextMenu
            x={ctx.x} y={ctx.y}
            msgType={ctx.msg.msg_type}
            canEdit={ctx.msg.sender_id === user?.id && !ctx.msg.deleted_for_all && ctx.msg.msg_type === "text"}
            canDeleteForAll={ctx.msg.sender_id === user?.id || user?.role === "admin"}
            isOwnMessage={isOwn}
            readersPreview={readersForMsg}
            readersCount={readersForMsg.length}
            onShowReaders={() => { setReadersSheet({ messageId: msg.id }); setCtx(null); }}
            isPinnedForAll={!!ctx.msg.pinned_at}
            isPinnedForMe={(pinnedForMe[activeChat?.id] || []).some((m) => m.id === ctx.msg.id)}
            canPinForAll={(pinnedForAll[activeChat?.id] || []).length < 5}
            canPinForMe={(pinnedForMe[activeChat?.id] || []).length < 5}
            onReply={() => { setReplyTarget(activeChat.id, ctx.msg); setCtx(null); }}
            onEdit={() => { setEditTarget(ctx.msg); setText(ctx.msg.text || ""); setCtx(null); }}
            onCopy={() => { navigator.clipboard?.writeText(ctx.msg.text || ""); setCtx(null); }}
            onPinForAll={() => { pinForAll(activeChat.id, ctx.msg.id); setCtx(null); }}
            onUnpinForAll={() => { unpinForAll(activeChat.id, ctx.msg.id); setCtx(null); }}
            onPinForMe={async () => {
              const id = ctx.msg.id;
              setCtx(null);
              const r = await pinForMe(activeChat.id, id);
              if (r && r.ok === false) setError(r.error || "Не удалось закрепить");
            }}
            onUnpinForMe={async () => {
              const id = ctx.msg.id;
              setCtx(null);
              const r = await unpinForMe(activeChat.id, id);
              if (r && r.ok === false) setError(r.error || "Не удалось открепить");
            }}
            onDeleteSelf={() => handleDelete(ctx.msg, "self")}
            onDeleteAll={() => handleDelete(ctx.msg, "all")}
            onEnterSelection={() => { enterSelectionMode(ctx.msg.id); setCtx(null); }}
          />
        </>
        );
      })()}

      {readersSheet && (
        <>
          <div onClick={() => setReadersSheet(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 9999 }} />
          <MessengerReadersPopover
            chatId={activeChat.id}
            messageId={readersSheet.messageId}
            variant="sheet"
            onClose={() => setReadersSheet(null)}
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
          <button type="button" onClick={() => {
              if (selectedIds.length === 0) return;
              // Telegram-style: "Удалить у всех" доступен только если все выделенные сообщения мои (или я админ).
              const list = msgList.filter((m) => selectedSet.has(m.id));
              const onlyMine = list.length > 0 && list.every((m) => m.sender_id === user?.id);
              const canForAll = onlyMine || user?.role === "admin";
              setDeleteSheet({ ids: [...selectedIds], canForAll });
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

      {/* Pin bar: общие + личные (как Telegram) */}
      {(() => {
        const all = pinnedForAll[activeChat?.id] || [];
        const mine = pinnedForMe[activeChat?.id] || [];
        const seen = new Set();
        const combined = [];
        for (const m of all) if (m?.id && !seen.has(m.id)) { seen.add(m.id); combined.push({ ...m, _personal: false }); }
        for (const m of mine) if (m?.id && !seen.has(m.id)) { seen.add(m.id); combined.push({ ...m, _personal: true }); }
        if (combined.length === 0) return null;
        const safeIndex = Math.min(pinCycleIndex, combined.length - 1);
        return (
          <MessengerPinBar
            pinnedMessages={combined}
            currentIndex={safeIndex}
            onClickNext={() => {
              const target = combined[safeIndex];
              if (target) {
                const el = messageRefs.current.get(target.id);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }
              setPinCycleIndex((i) => (i + 1) % combined.length);
            }}
            onUnpin={(item) => {
              if (!item) return;
              if (item._personal) unpinForMe(activeChat.id, item.id);
              else unpinForAll(activeChat.id, item.id);
            }}
          />
        );
      })()}

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
            data-messenger-no-select=""
            {...makeLongPressHandlers(item.msg)}
            ref={(el) => { if (el) messageRefs.current.set(item.msg.id, el); else messageRefs.current.delete(item.msg.id); }}
            style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" }}
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
              isSelected={selectedSet.has(item.msg.id)}
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
          {showEmoji && !voiceActive && <EmojiPicker onPick={(emoji) => { setText((value) => value + emoji); setShowEmoji(false); }} />}
          {!voiceActive && (
            <>
              <button type="button" onClick={() => setShowEmoji((value) => !value)} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, flexShrink: 0 }}>😊</button>
              <button type="button" onClick={() => fileRef.current?.click()} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, flexShrink: 0 }}>📎</button>
              <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={handleFile} />
            </>
          )}
          {!voiceActive && (
          <div style={{ flex: 1, position: "relative" }}>
            {mentionQuery !== null && (
              <MessengerMentionPicker
                query={mentionQuery}
                participants={activeChat.participants || []}
                onPick={(participant) => {
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
          )}
          {!editTarget && (
            <MessengerVoiceRecorder
              disabled={!activeChat || cryptoReady === false}
              onActiveChange={setVoiceActive}
              onSend={(payload) => sendVoiceMessage(activeChat.id, payload)}
            />
          )}
          {!voiceActive && (
            <button
              type="button"
              onClick={handleSend}
              disabled={!text.trim() || sending}
              style={{ width: 42, height: 40, borderRadius: 12, border: 0, background: $.ac, color: "#fff", opacity: !text.trim() || sending ? 0.45 : 1, flexShrink: 0, fontSize: 18 }}
            >
              ➤
            </button>
          )}
        </div>
      </footer>

      {/* Telegram-style bottom sheet для bulk-delete */}
      {deleteSheet && (
        <>
          <div
            onClick={() => setDeleteSheet(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10000 }}
          />
          <div
            role="dialog"
            aria-label="Удалить сообщения"
            style={{
              position: "fixed",
              left: 0, right: 0, bottom: 0,
              background: $.bgC,
              borderTopLeftRadius: 16, borderTopRightRadius: 16,
              padding: "12px 12px calc(env(safe-area-inset-bottom) + 14px)",
              boxShadow: "0 -8px 30px rgba(0,0,0,0.25)",
              zIndex: 10001,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ textAlign: "center", padding: "8px 4px 6px", color: $.txS, fontSize: 13 }}>
              Удалить {deleteSheet.ids.length} сообщ.?
            </div>
            {deleteSheet.canForAll && (
              <button
                type="button"
                onClick={async () => {
                  const ids = deleteSheet.ids;
                  setDeleteSheet(null);
                  const r = await bulkDelete(activeChat.id, ids, "all");
                  if (r && r.ok === false) setError(r.error || "Не удалось удалить");
                }}
                style={{
                  height: 50, borderRadius: 12, border: "none", background: $.dn, color: "#fff",
                  fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >Удалить у всех</button>
            )}
            <button
              type="button"
              onClick={async () => {
                const ids = deleteSheet.ids;
                setDeleteSheet(null);
                const r = await bulkDelete(activeChat.id, ids, "self");
                if (r && r.ok === false) setError(r.error || "Не удалось удалить");
              }}
              style={{
                height: 50, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx,
                fontSize: 16, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              }}
            >Удалить у меня</button>
            <button
              type="button"
              onClick={() => setDeleteSheet(null)}
              style={{
                height: 50, borderRadius: 12, border: "none", background: "transparent", color: $.tx,
                fontSize: 16, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              }}
            >Отмена</button>
          </div>
        </>
      )}
    </main>
  );
}
