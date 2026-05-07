import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";
import EmojiPicker from "../components/EmojiPicker";
import MessageBubble from "../components/MessageBubble";
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
  } = useMessenger();
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
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

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !activeChat) return;
    setSending(true);
    setError("");
    const ok = await sendMsg(activeChat.id, trimmed);
    if (ok) {
      setText("");
      setShowEmoji(false);
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
      </header>

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
          <div key={item.msg.id || item.msg.client_message_id}>
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
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 8 }}>
          {showEmoji && <EmojiPicker onPick={(emoji) => { setText((value) => value + emoji); setShowEmoji(false); }} />}
          <button type="button" onClick={() => setShowEmoji((value) => !value)} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, flexShrink: 0 }}>😊</button>
          <button type="button" onClick={() => fileRef.current?.click()} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, flexShrink: 0 }}>📎</button>
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={handleFile} />
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Сообщение..."
            rows={1}
            style={{
              flex: 1,
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
            }}
          />
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
