import { useCallback, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { fmtTime, isImageLike, parseBundleFiles } from "../utils/messengerUiUtils";

export default function MessengerChatList({
  chats,
  activeChatId,
  setActiveChatId,
  user,
  createNewChat,
  messages,
  canCreateChat,
}) {
  const { $ } = useTheme();
  const [creating, setCreating] = useState(false);

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

  const getUnreadCount = (chat) => {
    const myReceipt = (chat.receipts || []).find((receipt) => receipt.user_id === user.id);
    const chatMessages = messages[chat.id] || [];
    const unread = chatMessages.filter((message) =>
      message.sender_id !== user.id &&
      (!myReceipt || message.id > myReceipt.last_read_message_id)
    );
    return unread.length;
  };

  const getLastMessagePreview = (lastMessage) => {
    if (!lastMessage) return "Нет сообщений";
    if (lastMessage.msg_type === "files_bundle") {
      const files = parseBundleFiles(lastMessage.text);
      if (files.length === 0) return "📎 Файлы";
      const allImages = files.every((file) => isImageLike(file.type, file.name, file.thumb));
      return allImages ? `🖼 Фото (${files.length})` : `📎 Файлы (${files.length})`;
    }
    if (lastMessage.msg_type === "image") return "🖼 Фото";
    if (lastMessage.msg_type === "file") return "📎 Файл";
    const text = String(lastMessage.text || "");
    if (!text) return "Нет сообщений";
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
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
    <div style={{ width: 240, minWidth: 240, borderRight: `1px solid ${$.brd}`, display: "flex", flexDirection: "column", background: $.bgC }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${$.brd}`, fontWeight: 700, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>💬 Чаты</span>
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
              width: 26,
              height: 26,
              cursor: creating ? "default" : "pointer",
              opacity: creating ? 0.5 : 1,
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            +
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {chats.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: $.txM, textAlign: "center" }}>
            Нет доступных чатов.
          </div>
        )}
        {sortedChats.map((chat) => {
          const unread = getUnreadCount(chat);
          const chatMessages = messages[chat.id] || [];
          const lastMessage = chatMessages[chatMessages.length - 1];
          const icon = chat.icon || (chat.is_internal ? "💬" : "👤");
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
                  {lastMessage && <span style={{ fontSize: 10, color: $.txM }}>{fmtTime(lastMessage.created_at)}</span>}
                  {unread > 0 && <span style={{ background: $.ac, color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>{unread}</span>}
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
