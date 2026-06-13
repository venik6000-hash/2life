import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useMessenger } from "../context/MessengerContext";
import { isImageLike, parseBundleFiles } from "../utils/messengerUiUtils";
import { getUnreadCount } from "../utils/messengerUnread";
import { formatChatListTime } from "../utils/chatTimeFormat";

function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function safeParseVoiceMeta(text) {
  try {
    const v = JSON.parse(text || "{}");
    return typeof v === "object" && v ? v : null;
  } catch { return null; }
}

export default function MessengerChatList({
  chats,
  activeChatId,
  setActiveChatId,
  user,
  createNewChat,
  messages,
  canCreateChat,
  onSearchJump,
  onOpenSettings,
}) {
  const { $ } = useTheme();
  const { searchGlobal } = useMessenger();
  const [creating, setCreating] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalGroups, setGlobalGroups] = useState([]);

  useEffect(() => {
    if (!globalSearchOpen) { setGlobalGroups([]); return; }
    const t = setTimeout(async () => {
      if (globalQuery.trim().length < 2) { setGlobalGroups([]); return; }
      const result = await searchGlobal(globalQuery.trim());
      setGlobalGroups(result.groups || []);
    }, 300);
    return () => clearTimeout(t);
  }, [globalQuery, globalSearchOpen, searchGlobal]);

  const handleCreate = async () => {
    if (!canCreateChat || creating) return;
    const titleInput = window.prompt("Название внутреннего чата", "Личный чат");
    if (titleInput == null) return;
    const iconInput = window.prompt("Иконка (эмодзи или короткий текст)", "💬");
    if (iconInput == null) return;
    const shouldPin = window.confirm("Закрепить чат наверху списка?");

    setCreating(true);
    const created = await createNewChat({
      title: titleInput,
      icon: iconInput,
      isInternal: true,
      isPinned: shouldPin,
      participantUserIds: [],
    });
    if (created?.id) setActiveChatId(created.id);
    setCreating(false);
  };

  const getLastMessagePreview = (lastMessage) => {
    if (!lastMessage) return "Нет сообщений";
    const type = lastMessage.type || lastMessage.msg_type;
    if (type === "files_bundle") {
      const files = parseBundleFiles(lastMessage.text);
      if (files.length === 0) return "📎 Файлы";
      if (files.length === 1) {
        const f = files[0];
        return isImageLike(f.type, f.name, f.thumb) ? "🖼 Фото" : `📎 ${f.name || "Файл"}`;
      }
      const allImages = files.every((file) => isImageLike(file.type, file.name, file.thumb));
      return allImages ? `🖼 Фото (${files.length})` : `📎 ${files.length} файлов`;
    }
    if (type === "image") return "🖼 Фото";
    if (type === "file") return "📎 Файл";
    if (type === "voice") {
      const meta = safeParseVoiceMeta(lastMessage.text);
      return meta?.duration ? `🎤 Голосовое ${fmtDuration(meta.duration)}` : "🎤 Голосовое";
    }
    const text = String(lastMessage.text || "");
    if (!text) return "Нет сообщений";
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  };

  const getActivityTimestamp = useCallback((chat) => {
    const chatMessages = messages[chat.id] || [];
    const lastMessage = chatMessages[chatMessages.length - 1];
    const source = chat._lastMsgAt || lastMessage?.created_at || chat.created_at;
    const parsed = Date.parse(source || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [messages]);

  const sortedChats = useMemo(() => {
    const items = Array.isArray(chats) ? [...chats] : [];
    items.sort((a, b) => {
      const aPinned = !!a.is_pinned;
      const bPinned = !!b.is_pinned;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      const bTimestamp = getActivityTimestamp(b);
      const aTimestamp = getActivityTimestamp(a);
      if (bTimestamp !== aTimestamp) return bTimestamp - aTimestamp;
      return Number(b.id || 0) - Number(a.id || 0);
    });
    return items;
  }, [chats, getActivityTimestamp]);

  return (
    <div style={{ width: 300, minWidth: 300, height: "100%", minHeight: 0, borderRight: `1px solid ${$.brd}`, display: "flex", flexDirection: "column", background: $.bgC }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${$.brd}`, fontWeight: 700, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>💬 Чаты</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {onOpenSettings && (
            <button
              type="button"
              title="Настройки"
              onClick={onOpenSettings}
              style={{
                background: $.bg,
                color: $.tx,
                border: `1px solid ${$.brd}`,
                borderRadius: 6,
                width: 28,
                height: 28,
                cursor: "pointer",
                fontSize: 15,
                display: "grid",
                placeItems: "center",
              }}
            >
              ⚙
            </button>
          )}
          {canCreateChat && (
            <button
              title="Новый чат"
              onClick={handleCreate}
              disabled={creating}
              style={{
                background: $.ac,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                width: 28,
                height: 28,
                cursor: creating ? "default" : "pointer",
                opacity: creating ? 0.5 : 1,
                fontSize: 16,
                display: "grid",
                placeItems: "center",
              }}
            >
              +
            </button>
          )}
        </div>
      </div>

      {/* Global search bar */}
      <div style={{ padding: 10, borderBottom: `1px solid ${$.brd}` }}>
        {globalSearchOpen ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              placeholder="Поиск по всем чатам..."
              style={{ flex: 1, height: 34, padding: "0 10px", border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bg, color: $.tx }}
            />
            <button type="button" onClick={() => { setGlobalSearchOpen(false); setGlobalQuery(""); setGlobalGroups([]); }}>×</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setGlobalSearchOpen(true)}
            style={{ width: "100%", height: 34, borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.txS, textAlign: "left", padding: "0 10px", cursor: "pointer" }}
          >
            🔍 Поиск по сообщениям
          </button>
        )}
      </div>

      {/* Global search results */}
      {globalSearchOpen && globalGroups.length > 0 && (
        <div style={{ borderBottom: `1px solid ${$.brd}`, padding: "4px 0", maxHeight: 360, overflowY: "auto" }}>
          {globalGroups.map((g) => (
            <div key={g.chatId} style={{ padding: "6px 12px" }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: $.txS, marginBottom: 4 }}>{g.chatTitle}</div>
              {g.matches.map((m) => (
                <button
                  key={m.messageId}
                  type="button"
                  onClick={() => { onSearchJump?.(g.chatId, m.messageId); setActiveChatId?.(g.chatId); setGlobalSearchOpen(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", border: "none", background: "transparent", color: $.tx, cursor: "pointer", borderRadius: 6, fontSize: 12 }}
                >
                  {m.snippet}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {chats.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: $.txM, textAlign: "center" }}>
            Нет доступных чатов.
          </div>
        )}
        {sortedChats.map((chat) => {
          const unread = getUnreadCount(chat, messages, user);
          const chatMessages = messages[chat.id] || [];
          const lastMessage = chat.last_message;
          const source = chat._lastMsgAt || lastMessage?.createdAt || chat.created_at;
          const icon = chat.icon || (chat.is_internal ? "💬" : "👤");

          // Check for unread mention
          const hasUnreadMention = (() => {
            const list = chatMessages;
            const lastRead = (chat.receipts || []).find((r) => r.user_id === user?.id)?.last_read_message_id || 0;
            return list.some((m) => m.id > lastRead && m.sender_id !== user?.id && Array.isArray(m.meta?.mentionedUserIds) && m.meta.mentionedUserIds.includes(user?.id));
          })();

          return (
            <div
              key={chat.id}
              onClick={() => setActiveChatId(chat.id)}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                borderBottom: `1px solid ${$.brd}`,
                background: chat.id === activeChatId ? $.acD : "transparent",
                transition: "background .1s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: chat.id === activeChatId ? $.ac : $.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {chat.title}
                  </span>
                  {chat.is_pinned && <span style={{ fontSize: 11, color: $.ac, flexShrink: 0 }}>📌</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  {(lastMessage || source) && <span style={{ fontSize: 10, color: $.txM }}>{formatChatListTime(source)}</span>}
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {hasUnreadMention && (
                      <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: $.ac, color: "#fff", fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 5px" }}>@</span>
                    )}
                    {unread > 0 && <span style={{ background: $.ac, color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>{unread}</span>}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: $.txM, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {getLastMessagePreview(lastMessage)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
