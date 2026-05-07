import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";

export default function MobileMessengerSettings({ onBack }) {
  const { logout } = useAuth();
  const { wsConnected, notificationStatus, enableNotifications, clearLocalCache } = useMessenger();
  const { $ } = useTheme();
  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheStatus, setCacheStatus] = useState("");
  const [notificationBusy, setNotificationBusy] = useState(false);

  const notificationLabel = {
    default: "не настроены",
    granted: "разрешены, устройство не зарегистрировано",
    enabled: "включены",
    denied: "запрещены",
    requesting: "запрашиваю разрешение...",
    permission_timeout: "телефон не вернул разрешение",
    registering: "регистрирую устройство...",
    service_worker_failed: "service worker не готов",
    subscribe_failed: "браузер отказал в push-подписке",
    subscription_incomplete: "браузер вернул неполную подписку",
    server_registration_failed: "сервер не принял устройство",
    unsupported: "не поддерживаются",
    missing_key: "не настроен ключ сервера",
    registration_failed: "не удалось зарегистрировать устройство",
  }[notificationStatus] || notificationStatus || "не настроены";

  const handleClearCache = async () => {
    setCacheClearing(true);
    setCacheStatus("");
    await clearLocalCache();
    setCacheStatus("Кэш очищен");
    setCacheClearing(false);
  };

  const handleEnableNotifications = async () => {
    setNotificationBusy(true);
    await enableNotifications();
    setNotificationBusy(false);
  };

  return (
    <main style={{
      minHeight: "100dvh",
      background: $.bg,
      color: $.tx,
      padding: "calc(env(safe-area-inset-top) + 12px) 16px calc(env(safe-area-inset-bottom) + 16px)",
      display: "grid",
      alignContent: "start",
      gap: 12,
      fontFamily: "system-ui, sans-serif",
    }}>
      <button type="button" onClick={onBack} aria-label="Назад" style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 22 }}>‹</button>
      <h1 style={{ fontSize: 24, margin: 0, letterSpacing: 0 }}>Настройки</h1>
      <section style={{ display: "grid", gap: 8, padding: 14, border: `1px solid ${$.brd}`, borderRadius: 12, background: $.bgC }}>
        <div>Синхронизация: {wsConnected ? "online" : "offline"}</div>
        <div>Уведомления: {notificationLabel}</div>
      </section>
      <button type="button" onClick={handleEnableNotifications} disabled={notificationBusy} style={{ height: 48, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 15, opacity: notificationBusy ? 0.7 : 1 }}>
        {notificationBusy ? "Включаю..." : "Включить уведомления"}
      </button>
      <button type="button" onClick={handleClearCache} disabled={cacheClearing} style={{ height: 48, borderRadius: 12, border: `1px solid ${$.brd}`, background: $.bgC, color: $.tx, fontSize: 15, opacity: cacheClearing ? 0.7 : 1 }}>
        {cacheClearing ? "Очищаю..." : (cacheStatus || "Очистить кэш")}
      </button>
      <button type="button" onClick={logout} style={{ height: 48, borderRadius: 12, border: 0, background: $.dn, color: "#fff", fontSize: 15, fontWeight: 750 }}>
        Выйти
      </button>
    </main>
  );
}
