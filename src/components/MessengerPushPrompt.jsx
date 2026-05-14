import { useState } from "react";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";

const STORAGE_KEY = "messenger_push_prompt_seen";

export function shouldShowPushPrompt() {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (!("serviceWorker" in navigator)) return false;
  if (Notification.permission !== "default") return false;
  if (localStorage.getItem(STORAGE_KEY) === "true") return false;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  if (isIos && !isStandalone) return false;
  return true;
}

export default function MessengerPushPrompt({ onClose }) {
  const { $ } = useTheme();
  const { enableNotifications } = useMessenger();
  const [busy, setBusy] = useState(false);

  const handleEnable = async () => {
    setBusy(true);
    try { await enableNotifications(); } catch {}
    localStorage.setItem(STORAGE_KEY, "true");
    setBusy(false);
    onClose?.();
  };

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose?.();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "grid", placeItems: "center", zIndex: 9998, padding: 20,
    }} onClick={handleDismiss}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: $.bg, color: $.tx, border: `1px solid ${$.brd}`,
        borderRadius: 16, padding: 24, maxWidth: 360, width: "100%",
        boxShadow: $.sh, textAlign: "center",
      }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔔</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>Включить уведомления?</h2>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: $.txS, lineHeight: 1.5 }}>
          Чтобы не пропускать сообщения от врача — разрешите уведомления.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={handleDismiss} disabled={busy} style={{
            flex: 1, height: 44, borderRadius: 10, border: `1px solid ${$.brd}`,
            background: $.bgC, color: $.tx, cursor: "pointer", fontSize: 14,
          }}>Не сейчас</button>
          <button type="button" onClick={handleEnable} disabled={busy} style={{
            flex: 1, height: 44, borderRadius: 10, border: "none",
            background: $.ac, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
            opacity: busy ? 0.7 : 1,
          }}>{busy ? "Включаю..." : "Включить"}</button>
        </div>
      </div>
    </div>
  );
}
