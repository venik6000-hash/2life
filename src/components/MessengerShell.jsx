import { cloneElement, isValidElement, useEffect, useState } from "react";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";
import MessengerSettingsPanel from "./MessengerSettingsPanel";
import MessengerPushPrompt, { shouldShowPushPrompt } from "./MessengerPushPrompt";
import MessengerIosInstallBanner, { shouldShowIosInstallBanner } from "./MessengerIosInstallBanner";
import { getMessengerFontConfig } from "../utils/messengerFont";

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
  const messenger = useMessenger();
  const cfg = getMessengerFontConfig(messenger?.fontSize);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [showIosBanner, setShowIosBanner] = useState(false);

  useEffect(() => {
    setShowPushPrompt(shouldShowPushPrompt());
    setShowIosBanner(shouldShowIosInstallBanner());
  }, []);

  // Bug 6: закрываем панель настроек при переключении чата.
  useEffect(() => {
    if (settingsOpen) setSettingsOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messenger?.activeChatId]);

  const chatListWithSettings = isValidElement(chatList)
    ? cloneElement(chatList, { onOpenSettings: () => setSettingsOpen(true) })
    : chatList;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, borderRadius: 10, overflow: "hidden", border: `1px solid ${$.brd}`, position: "relative", fontSize: cfg.base }}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: "0 0 300px" }}>
        {chatListWithSettings}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: $.bg }}>
        {banner}
        {children}
      </div>

      {/* Settings drawer */}
      {settingsOpen && (
        <aside style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: "min(380px, 100%)",
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
