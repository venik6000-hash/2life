import { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useMessenger } from "../context/MessengerContext";
import { fmtTime, isImageLike, parseBundleFiles } from "../utils/messengerUiUtils";
import { getUnreadCount } from "../utils/messengerUnread";

function lastMessagePreview(message) {
  if (!message) return "Нет сообщений";
  if (message.pending) return "Отправляется...";
  if (message.msg_type === "files_bundle") {
    const files = parseBundleFiles(message.text);
    if (files.length === 0) return "Файлы";
    return files.every((file) => isImageLike(file.type, file.name, file.thumb))
      ? `Фото (${files.length})`
      : `Файлы (${files.length})`;
  }
  if (message.msg_type === "image") return "Фото";
  if (message.msg_type === "file") return "Файл";
  const text = String(message.text || "").replace(/\s+/g, " ").trim();
  if (!text) return "Нет сообщений";
  return text.length > 70 ? `${text.slice(0, 70)}...` : text;
}

export default function MobileChatList({ onOpenChat, onOpenSettings, onOpenSearch }) {
  const { $ } = useTheme();
  const { user } = useAuth();
  const { chats, activeChatId, setActiveChatId, messages, wsConnected, chatsLoaded } = useMessenger();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const items = Array.isArray(chats) ? [...chats] : [];
    const withActivity = items.map((chat) => {
      const chatMessages = messages[chat.id] || [];
      const last = chatMessages[chatMessages.length - 1] || null;
      return { chat, last, timestamp: Date.parse(last?.created_at || chat.created_at || "") || 0 };
    });
    withActivity.sort((a, b) => {
      if (!!a.chat.is_pinned !== !!b.chat.is_pinned) return a.chat.is_pinned ? -1 : 1;
      return b.timestamp - a.timestamp;
    });
    return withActivity.filter(({ chat }) => {
      if (!needle) return true;
      const title = `${chat.title || ""}`.toLowerCase();
      const people = (chat.participants || [])
        .map((participant) => participant.display_name || participant.username || "")
        .join(" ")
        .toLowerCase();
      return title.includes(needle) || people.includes(needle);
    });
  }, [chats, messages, query]);

  return (
    <main style={{ height: "100dvh", background: $.bg, color: $.tx, display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif", overflow: "hidden" }}>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 14px) 16px 10px", borderBottom: `1px solid ${$.brd}`, display: "grid", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 24, letterSpacing: 0 }}>Мессенджер</strong>
            <div style={{ fontSize: 12, color: wsConnected ? $.up : $.txS, marginTop: 2 }}>
              {wsConnected ? "online" : "offline"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="Поиск"
              style={{ minWidth: 44, height: 44, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 20 }}
            >
              🔍
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Настройки"
              style={{ minWidth: 44, height: 44, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 20 }}
            >
              ⚙
            </button>
          </div>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск"
          style={{ height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, padding: "0 12px", fontSize: 16, outline: "none" }}
        />
      </header>

      <section style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {!chatsLoaded && <div style={{ padding: 16, fontSize: 14, color: $.txS }}>Загрузка...</div>}
        {chatsLoaded && filtered.length === 0 && (
          <div style={{ padding: 16, fontSize: 14, color: $.txS }}>
            {query.trim() ? "Ничего не найдено." : "Нет доступных чатов."}
          </div>
        )}
        {filtered.map(({ chat, last }) => {
          const unread = getUnreadCount(chat, messages, user);
          const hasUnreadMention = ((messages[chat.id] || [])).some((m) => {
            const lastRead = (chat.receipts || []).find((r) => r.user_id === user?.id)?.last_read_message_id || 0;
            return m.id > lastRead && m.sender_id !== user?.id && Array.isArray(m.meta?.mentionedUserIds) && m.meta.mentionedUserIds.includes(user?.id);
          });
          return (
            <button
              key={chat.id}
              type="button"
              onClick={() => { setActiveChatId(chat.id); onOpenChat(); }}
              style={{
                width: "100%",
                minHeight: 74,
                border: 0,
                borderBottom: `1px solid ${$.brd}`,
                background: chat.id === activeChatId ? $.acD : $.bg,
                color: $.tx,
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: "11px 16px",
                textAlign: "left",
              }}
            >
              <span style={{ width: 44, height: 44, borderRadius: 14, background: unread > 0 ? $.acD : $.bgC, display: "grid", placeItems: "center", fontSize: 20, flexShrink: 0, border: unread > 0 ? `1px solid ${$.ac}` : "1px solid transparent" }}>
                {chat.icon || (chat.is_internal ? "💬" : "👤")}
              </span>
              <span style={{ minWidth: 0, flex: 1, display: "grid", gap: 4 }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0, fontWeight: unread > 0 ? 800 : 700 }}>{chat.title || "Чат"}</strong>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {last && <span style={{ color: unread > 0 ? $.ac : $.txS, fontSize: 11 }}>{fmtTime(last.created_at)}</span>}
                    {hasUnreadMention && (
                      <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: $.ac, color: "#fff", fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 5px" }}>@</span>
                    )}
                    {unread > 0 && (
                      <span style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: 999, background: $.ac, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, lineHeight: 1 }}>
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </span>
                </span>
                <span style={{ color: unread > 0 ? $.tx : $.txS, fontSize: 13, fontWeight: unread > 0 ? 650 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {lastMessagePreview(last)}
                </span>
              </span>
            </button>
          );
        })}
      </section>
    </main>
  );
}
