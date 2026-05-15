import { useTheme } from "../context/ThemeContext";
import { useMessenger } from "../context/MessengerContext";
import ReadReceipt from "./ReadReceipt";
import FileMessageBubble from "./FileMessageBubble";
import FileBundleBubble from "./FileBundleBubble";
import { fmtTime } from "../utils/messengerUiUtils";
import { getMessengerFontConfig } from "../utils/messengerFont";

function renderTextWithMentions(text, mentionedUserIds, participants, accentColor) {
  if (!mentionedUserIds || mentionedUserIds.length === 0 || !participants) return text;
  const mentions = mentionedUserIds
    .map((id) => participants.find((p) => p.user_id === id))
    .filter(Boolean)
    .map((p) => `@${p.display_name || p.username}`);
  if (mentions.length === 0) return text;
  const escaped = mentions.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = String(text || "").split(re);
  return parts.map((part, idx) =>
    mentions.includes(part)
      ? <span key={idx} style={{ color: accentColor, fontWeight: 600 }}>{part}</span>
      : part
  );
}

export default function MessageBubble({
  msg, isMine, chatReceipts, participants, currentUserId,
  chatId, downloadFile, downloadFiles, getFileUrl, onOpenImage, onContextMenu,
  replyToMessage, isSelected, selectionMode, mentionedUserIds, onJumpToMessage, onToggleSelection,
}) {
  const { $ } = useTheme();
  const messenger = useMessenger();
  const cfg = getMessengerFontConfig(messenger?.fontSize);
  const isFile = msg.msg_type === "file" || msg.msg_type === "image";
  const isBundle = msg.msg_type === "files_bundle";
  const bubbleBg = isMine ? $.ac : $.bgC;
  const textColor = isMine ? "#fff" : $.tx;
  const mentionColor = isMine ? "#fff" : $.ac;
  const replyAccent = isMine ? "rgba(255,255,255,.9)" : $.ac;
  const replyTextColor = isMine ? "rgba(255,255,255,.86)" : $.txS;
  const replyBg = isMine ? "rgba(255,255,255,.12)" : $.bg;

  return (
    <div
      onContextMenu={(e) => onContextMenu?.(e, msg)}
      style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", marginBottom: 6, width: "100%" }}
    >
      {!isMine && (
        <span style={{ fontSize: cfg.meta, color: $.txM, marginLeft: 8, marginBottom: 2 }}>{msg.sender_display_name || msg.sender_username}</span>
      )}
      <div style={{ display: "flex", flexDirection: isMine ? "row-reverse" : "row", alignItems: "flex-start", width: "100%", minWidth: 0 }}>
        {selectionMode && (
          <div
            onClick={() => onToggleSelection?.(msg.id)}
            style={{
              width: 22, height: 22, borderRadius: "50%", border: `2px solid ${isSelected ? $.ac : $.brd}`,
              display: "grid", placeItems: "center", marginRight: isMine ? 0 : 8, marginLeft: isMine ? 8 : 0,
              marginTop: 8, flexShrink: 0,
              background: isSelected ? $.ac : "transparent", color: "#fff",
              cursor: "pointer",
            }}
          >
            {isSelected ? "✓" : ""}
          </div>
        )}
        <div style={{
          maxWidth: "72%", minWidth: 0, padding: "8px 12px",
          borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          background: bubbleBg, color: textColor,
          boxShadow: "0 1px 3px rgba(0,0,0,.12)", overflowWrap: "anywhere", wordBreak: "break-word",
        }}>
          {replyToMessage && !replyToMessage.deleted_for_all && (
            <button
              type="button"
              onClick={() => onJumpToMessage?.(replyToMessage.id)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                border: "none", borderLeft: `3px solid ${replyAccent}`, padding: "5px 6px 5px 8px", marginBottom: 6,
                background: replyBg, borderRadius: 6, cursor: "pointer", color: "inherit",
              }}
            >
              <div style={{ fontSize: cfg.small, fontWeight: 700, color: replyAccent }}>
                {replyToMessage.sender_display_name || replyToMessage.sender_username}
              </div>
              <div style={{ fontSize: cfg.small, color: replyTextColor, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {replyToMessage.msg_type === "image" || replyToMessage.msg_type === "image_bundle" ? "🖼️ Фото" :
                 replyToMessage.msg_type === "file" || replyToMessage.msg_type === "file_bundle" ? `📎 ${replyToMessage.meta?.fileName || "Файл"}` :
                 replyToMessage.text}
              </div>
            </button>
          )}
          {replyToMessage?.deleted_for_all && (
            <div style={{ borderLeft: `3px solid ${$.brd}`, paddingLeft: 8, marginBottom: 6, fontSize: cfg.small, color: $.txS, fontStyle: "italic" }}>
              Сообщение удалено
            </div>
          )}
          {isBundle ? (
            <FileBundleBubble msg={msg} chatId={chatId} downloadFile={downloadFile} downloadFiles={downloadFiles} getFileUrl={getFileUrl} onOpenImage={onOpenImage} />
          ) : isFile ? (
            <FileMessageBubble msg={msg} chatId={chatId} downloadFile={downloadFile} getFileUrl={getFileUrl} onOpenImage={onOpenImage} />
          ) : (
            <span style={{ fontSize: cfg.message, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
              {renderTextWithMentions(msg.text, msg.meta?.mentionedUserIds || mentionedUserIds, participants, mentionColor)}
            </span>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 3 }}>
            {msg.edited_at && <span style={{ fontSize: cfg.meta, opacity: .55 }}>ред.</span>}
            <span style={{ fontSize: cfg.meta, opacity: .6 }}>{fmtTime(msg.created_at)}</span>
            {isMine && (
              <ReadReceipt
                messageId={msg.id}
                chatReceipts={chatReceipts}
                currentUserId={currentUserId}
                participants={participants}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
