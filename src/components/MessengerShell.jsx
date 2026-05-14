import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import MessengerSettingsPanel from "./MessengerSettingsPanel";
import MessengerPushPrompt, { shouldShowPushPrompt } from "./MessengerPushPrompt";
import MessengerIosInstallBanner, { shouldShowIosInstallBanner } from "./MessengerIosInstallBanner";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [showIosBanner, setShowIosBanner] = useState(false);

  useEffect(() => {
    setShowPushPrompt(shouldShowPushPrompt());
    setShowIosBanner(shouldShowIosInstallBanner());
  }, []);

  // Clone chatList to inject settings button into its header area via a wrapper
  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, borderRadius: 10, overflow: "hidden", border: `1px solid ${$.brd}`, position: "relative" }}>
      {/* Chat list column with settings cog */}
      <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
        {chatList}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки"
          style={{
            position: "absolute", bottom: 12, right: 12,
            width: 36, height: 36, borderRadius: 8,
            border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx,
            cursor: "pointer", fontSize: 18, zIndex: 10,
          }}
        >⚙</button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: $.bg }}>
        {banner}
        {children}
      </div>

      {/* Settings drawer */}
      {settingsOpen && (
        <aside style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: 380,
          background: $.bg, borderLeft: `1px solid ${$.brd}`,
          overflowY: "auto", zIndex: 100, boxShadow: $.sh,
        }}>
          <MessengerSettingsPanel onClose={() => setSettingsOpen(false)} />
        </aside>
      )}

      {/* Push prompt and iOS install banner */}
      {showPushPrompt && <MessengerPushPrompt onClose={() => setShowPushPrompt(false)} />}
      {showIosBanner && <MessengerIosInstallBanner onClose={() => setShowIosBanner(false)} />}
    </div>
  );
}
