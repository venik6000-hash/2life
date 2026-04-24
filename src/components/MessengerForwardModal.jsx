import { useTheme } from "../context/ThemeContext";

export default function MessengerForwardModal({ chats, onForwardToChat, onClose }) {
  const { $ } = useTheme();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998 }}>
      <div style={{ width: 360, maxWidth: "92vw", maxHeight: "70vh", overflowY: "auto", background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 12, boxShadow: $.sh }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${$.brd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Переслать сообщение</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: $.txS, fontFamily: "inherit" }}>✕</button>
        </div>
        <div style={{ padding: 10 }}>
          {chats.length === 0 && (
            <div style={{ fontSize: 12, color: $.txM }}>Нет других чатов для пересылки</div>
          )}
          {chats.map((c) => (
            <button
              key={c.id}
              onClick={() => onForwardToChat(c.id)}
              style={{ width: "100%", textAlign: "left", padding: "9px 10px", background: "none", border: `1px solid ${$.brd}`, borderRadius: 8, cursor: "pointer", fontSize: 13, color: $.tx, marginBottom: 6, fontFamily: "inherit" }}
            >
              {c.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
