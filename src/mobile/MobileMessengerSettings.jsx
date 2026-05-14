import MessengerSettingsPanel from "../components/MessengerSettingsPanel";
import { useTheme } from "../context/ThemeContext";

export default function MobileMessengerSettings({ onBack }) {
  const { $ } = useTheme();
  return (
    <main style={{ minHeight: "100dvh", background: $.bg, color: $.tx, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 10px) 12px 10px", borderBottom: `1px solid ${$.brd}`, display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" onClick={onBack} aria-label="Назад" style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 22 }}>‹</button>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Настройки</div>
      </header>
      <MessengerSettingsPanel />
    </main>
  );
}
