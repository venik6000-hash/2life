import MessengerSettingsPanel from "../components/MessengerSettingsPanel";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";
import { getMessengerFontConfig } from "../utils/messengerFont";

export default function MobileMessengerSettings({ onBack }) {
  const { $ } = useTheme();
  const { fontSize } = useMessenger();
  const cfg = getMessengerFontConfig(fontSize);
  return (
    <main style={{
      height: "100dvh",
      overflowY: "auto",
      overflowX: "hidden",
      background: $.bg,
      color: $.tx,
      fontFamily: "system-ui, sans-serif",
      fontSize: cfg.base,
    }}>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 10px) 12px 10px", borderBottom: `1px solid ${$.brd}`, display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" onClick={onBack} aria-label="Назад" style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 22, flexShrink: 0 }}>‹</button>
        <div style={{ fontWeight: 700, fontSize: cfg.heading, lineHeight: 1.2, minWidth: 0 }}>Настройки</div>
      </header>
      <MessengerSettingsPanel />
    </main>
  );
}
