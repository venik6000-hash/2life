import { useTheme } from "../context/ThemeContext";

export default function MessengerContextMenu({
  x, y,
  canEdit, canDeleteForAll, isPinnedForAll, isPinnedForMe,
  canPinForAll, canPinForMe,
  msgType,
  onReply, onForward, onEdit, onCopy,
  onPinForAll, onUnpinForAll,
  onPinForMe, onUnpinForMe,
  onDeleteSelf, onDeleteAll,
  onEnterSelection,
}) {
  const { $ } = useTheme();
  const top = Math.min(y, window.innerHeight - 360);
  const left = Math.min(x, window.innerWidth - 230);

  const itemStyle = { width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", borderRadius: 6, fontSize: 13, fontFamily: "inherit" };
  const isText = msgType === "text";

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed", top, left, width: 220,
        background: $.bgC, border: `1px solid ${$.brd}`,
        borderRadius: 10, boxShadow: $.sh, zIndex: 9999, padding: 6,
      }}
    >
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
    </div>
  );
}
