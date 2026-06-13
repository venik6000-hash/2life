import { useTheme } from "../context/ThemeContext";
import { isImageLike, parseBundleFiles } from "../utils/messengerUiUtils";

export default function MessengerPinBar({ pinnedMessages, currentIndex = 0, onClickNext, onUnpin, canUnpin = true }) {
  const { $ } = useTheme();
  if (!pinnedMessages || pinnedMessages.length === 0) return null;
  const safeIndex = Math.min(currentIndex, pinnedMessages.length - 1);
  const current = pinnedMessages[safeIndex];
  const total = pinnedMessages.length;
  const isPersonal = !!current?._personal;

  const preview = (() => {
    if (current.deleted_for_all) return "Сообщение удалено";
    if (current.msg_type === "files_bundle") {
      const files = parseBundleFiles(current.text);
      if (files.length === 0) return "📎 Файлы";
      if (files.length === 1) {
        const f = files[0];
        return isImageLike(f.type, f.name, f.thumb) ? "🖼 Фото" : `📎 ${f.name || "Файл"}`;
      }
      const allImages = files.every((f) => isImageLike(f.type, f.name, f.thumb));
      return allImages ? `🖼 Фото (${files.length})` : `📎 ${files.length} файлов`;
    }
    if (current.msg_type === "file") return `📎 ${current.meta?.fileName || "Файл"}`;
    if (current.msg_type === "image") return "🖼️ Фото";
    return (current.text || "").slice(0, 120);
  })();

  const label = total > 1
    ? `Закреплено ${safeIndex + 1}/${total}${isPersonal ? " · только у вас" : ""}`
    : (isPersonal ? "Закреплено · только у вас" : "Закреплено");

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
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 13, color: $.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {preview}
        </div>
      </div>
      {canUnpin && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onUnpin?.(current); }}
          style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent", color: $.txS, cursor: "pointer", fontSize: 16 }}
          aria-label="Открепить"
        >×</button>
      )}
    </div>
  );
}
