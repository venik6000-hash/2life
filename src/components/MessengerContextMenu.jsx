import { useTheme } from "../context/ThemeContext";

export default function MessengerContextMenu({ x, y, canEdit, canDeleteForAll, onForward, onEdit, onDeleteSelf, onDeleteAll }) {
  const { $ } = useTheme();
  const top = Math.min(y, window.innerHeight - 190);
  const left = Math.min(x, window.innerWidth - 220);

  const itemStyle = { width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: "none", cursor: "pointer", borderRadius: 6, fontSize: 13, fontFamily: "inherit" };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed", top, left, width: 210,
        background: $.bgC, border: `1px solid ${$.brd}`,
        borderRadius: 10, boxShadow: $.sh, zIndex: 9999, padding: 6,
      }}
    >
      <button onClick={onForward} style={{ ...itemStyle, color: $.tx }}>Переслать</button>
      {canEdit && <button onClick={onEdit} style={{ ...itemStyle, color: $.tx }}>Редактировать</button>}
      <button onClick={onDeleteSelf} style={{ ...itemStyle, color: $.tx }}>Удалить у себя</button>
      {canDeleteForAll && <button onClick={onDeleteAll} style={{ ...itemStyle, color: $.dn }}>Удалить у всех</button>}
    </div>
  );
}
