import { useTheme } from "../context/ThemeContext";

export function MessengerEmptyState() {
  const { $ } = useTheme();

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: $.txM,
        flexDirection: "column",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 36 }}>💬</span>
      <span style={{ fontSize: 14 }}>Выберите чат или создайте новый</span>
    </div>
  );
}

export default function MessengerShell({ chatList, banner, children }) {
  const { $ } = useTheme();

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, borderRadius: 10, overflow: "hidden", border: `1px solid ${$.brd}` }}>
      {chatList}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: $.bg }}>
        {banner}
        {children}
      </div>
    </div>
  );
}
