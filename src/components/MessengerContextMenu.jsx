import { useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";

export default function MessengerContextMenu({
  x, y,
  canEdit, canDeleteForAll, isPinnedForAll, isPinnedForMe,
  canPinForAll, canPinForMe,
  msgType,
  // NEW:
  isOwnMessage,        // boolean
  readersPreview,      // [{ userId, avatar, name }] — derived client-side, up to 3
  readersCount,        // number
  onShowReaders,       // (anchorRect) => void
  // existing:
  onReply, onForward, onEdit, onCopy,
  onPinForAll, onUnpinForAll,
  onPinForMe, onUnpinForMe,
  onDeleteSelf, onDeleteAll,
  onEnterSelection,
}) {
  const { $ } = useTheme();
  const rowRef = useRef(null);
  const top = Math.min(y, window.innerHeight - 360);
  const left = Math.min(x, window.innerWidth - 230);

  const itemStyle = { width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", borderRadius: 6, fontSize: 13, fontFamily: "inherit" };
  const isText = msgType === "text";

  const showViews = isOwnMessage && readersCount > 0;

  return (
    <div onClick={(e) => e.stopPropagation()}
         style={{ position: "fixed", top, left, width: 230, background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 10, boxShadow: $.sh, zIndex: 9999, padding: 6 }}>
      {onReply && <button onClick={onReply} style={{ ...itemStyle, color: $.tx }}>Ответить</button>}
      {onForward && <button onClick={onForward} style={{ ...itemStyle, color: $.tx }}>Переслать</button>}
      {isPinnedForAll
        ? <button onClick={onUnpinForAll} style={{ ...itemStyle, color: $.tx }}>Открепить</button>
        : canPinForAll && <button onClick={onPinForAll} style={{ ...itemStyle, color: $.tx }}>Закрепить для всех</button>}
      {isPinnedForMe
        ? <button onClick={onUnpinForMe} style={{ ...itemStyle, color: $.tx }}>Убрать из своих закладок</button>
        : canPinForMe && <button onClick={onPinForMe} style={{ ...itemStyle, color: $.tx }}>Закрепить для себя</button>}
      {isText && onCopy && <button onClick={onCopy} style={{ ...itemStyle, color: $.tx }}>Копировать</button>}
      {canEdit && <button onClick={onEdit} style={{ ...itemStyle, color: $.tx }}>Редактировать</button>}
      {onEnterSelection && <button onClick={onEnterSelection} style={{ ...itemStyle, color: $.tx }}>Выбрать</button>}
      {onDeleteSelf && <button onClick={onDeleteSelf} style={{ ...itemStyle, color: $.tx }}>Удалить у себя</button>}
      {canDeleteForAll && <button onClick={onDeleteAll} style={{ ...itemStyle, color: $.dn }}>Удалить у всех</button>}

      {showViews && (
        <>
          <div style={{ height: 1, background: $.brd, margin: "6px 4px" }} />
          <button
            ref={rowRef}
            onMouseEnter={() => onShowReaders?.(rowRef.current?.getBoundingClientRect())}
            onClick={() => onShowReaders?.(rowRef.current?.getBoundingClientRect())}
            style={{ ...itemStyle, display: "flex", alignItems: "center", gap: 8, color: $.txS }}
          >
            <span style={{ color: $.ac, fontWeight: 600 }}>✓✓</span>
            <span style={{ flex: 1 }}>{readersCount} {pluralize(readersCount)}</span>
            <span style={{ display: "flex", marginRight: 4 }}>
              {readersPreview.slice(0, 3).map((r, i) => (
                <MiniAvatar key={r.userId} reader={r} offset={i} bg={$.acD} fg={$.ac} brd={$.bgC} />
              ))}
            </span>
            <span style={{ color: $.txM }}>›</span>
          </button>
        </>
      )}
    </div>
  );
}

function pluralize(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "просмотр";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "просмотра";
  return "просмотров";
}

function MiniAvatar({ reader, offset, bg, fg, brd }) {
  const initials = String(reader.name || "?").split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  const style = { width: 22, height: 22, borderRadius: "50%", marginLeft: offset === 0 ? 0 : -8, border: `2px solid ${brd}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: bg, color: fg, fontSize: 9, fontWeight: 700 };
  if (reader.avatar) return <img src={reader.avatar} alt="" style={{ ...style, padding: 0 }} />;
  return <div style={style}>{initials || "?"}</div>;
}
