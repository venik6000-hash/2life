import { useTheme } from "../context/ThemeContext";

const STORAGE_KEY = "messenger_ios_install_banner_dismissed";

export function shouldShowIosInstallBanner() {
  if (typeof window === "undefined") return false;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (!isIos) return false;
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  if (isStandalone) return false;
  if (localStorage.getItem(STORAGE_KEY) === "true") return false;
  return true;
}

export default function MessengerIosInstallBanner({ onClose }) {
  const { $ } = useTheme();
  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    onClose?.();
  };
  return (
    <div style={{
      position: "fixed", left: 12, right: 12,
      bottom: "calc(env(safe-area-inset-bottom) + 12px)",
      background: $.bgC, color: $.tx, border: `1px solid ${$.brd}`, borderRadius: 14,
      padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", zIndex: 9997,
      boxShadow: $.sh, fontSize: 13,
    }}>
      <div style={{ fontSize: 22 }}>📱</div>
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        Добавьте приложение на главный экран для уведомлений.
        <br />Нажмите <strong>⬆</strong> (Поделиться) → <em>«На экран Домой»</em>
      </div>
      <button type="button" onClick={handleDismiss} aria-label="Закрыть" style={{
        width: 28, height: 28, borderRadius: 8, border: "none",
        background: "transparent", color: $.txS, fontSize: 18, cursor: "pointer",
      }}>×</button>
    </div>
  );
}
