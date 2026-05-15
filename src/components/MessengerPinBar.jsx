import { useTheme } from "../context/ThemeContext";

export default function MessengerPinBar({ pinnedMessages, currentIndex = 0, onClickNext, onUnpin, canUnpin = true }) {
  const { $ } = useTheme();
  if (!pinnedMessages || pinnedMessages.length === 0) return null;
  const safeIndex = Math.min(currentIndex, pinnedMessages.length - 1);
  const current = pinnedMessages[safeIndex];
  const total = pinnedMessages.length;

  const preview = (() => {
    if (current.deleted_for_all) return "Сообщение удалено";
    if (current.msg_type === "file" || current.msg_type === "file_bundle") return `📎 ${current.meta?.fileName || "Файл"}`;
    if (current.msg_type === "image" || current.msg_type === "image_bundle") return "🖼️ Фото";
    return (current.text || "").slice(0, 120);
  })();

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px",
      borderBottom: `1px solid ${$.brd}`,
      background: $.bgC,
      minHeight: 44,
      cursor: "pointer",
    }} onClick={onClickNext} role="button" aria-label="Закреплённые сообщения">
      <span style={{ fontSize: 14, color: $.ac, flexShrink: 0 }}>📌</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 600 }}>
          {total > 1 ? `Закреплено ${safeIndex + 1}/${total}` : "Закреплено"}
        </div>
        <div style={{ fontSize: 13, color: $.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {preview}
        </div>
      </div>
      {canUnpin && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onUnpin?.(current.id); }}
          style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent", color: $.txS, cursor: "pointer", fontSize: 16 }}
          aria-label="Открепить"
        >×</button>
      )}
    </div>
  );
}
