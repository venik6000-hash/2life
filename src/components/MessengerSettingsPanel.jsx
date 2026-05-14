import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";

export default function MessengerSettingsPanel({ onClose }) {
  const { user, logout, authFetch } = useAuth();
  // ThemeContext exposes dk (boolean) and setDk. Derive a "mode" string from it.
  const { $, dk, setDk } = useTheme();
  const {
    wsConnected, notificationStatus, enableNotifications,
    fontSize, setFontSize, updateDisplayName,
    listDevices, revokeDevice,
  } = useMessenger();
  const [displayName, setDisplayName] = useState(user?.display_name || user?.username || "");
  const [devices, setDevices] = useState([]);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  useEffect(() => {
    listDevices().then(setDevices).catch(() => {});
  }, [listDevices]);

  const handleNameBlur = async () => {
    if (displayName.trim() === (user?.display_name || "")) return;
    const result = await updateDisplayName(displayName.trim());
    if (!result.ok) setDisplayName(user?.display_name || "");
  };

  const handlePwSubmit = async () => {
    if (pwNew !== pwConfirm) { setPwMsg("Новый пароль не совпадает"); return; }
    if (pwNew.length < 6) { setPwMsg("Минимум 6 символов"); return; }
    try {
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setPwMsg(data?.error || "Ошибка"); return; }
      setPwMsg("Пароль изменён"); setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setTimeout(() => { setPwOpen(false); setPwMsg(""); }, 1200);
    } catch (e) { setPwMsg(e.message); }
  };

  return (
    <div style={{ display: "grid", gap: 12, padding: 14, color: $.tx, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Настройки</h2>

      {/* Profile */}
      <section style={{ display: "grid", gap: 6, padding: 12, border: `1px solid ${$.brd}`, borderRadius: 10, background: $.bgC }}>
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 700 }}>ПРОФИЛЬ</div>
        <label style={{ fontSize: 12 }}>Отображаемое имя</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={handleNameBlur}
          style={{ height: 36, padding: "0 10px", border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bg, color: $.tx }}
        />
      </section>

      {/* Notifications */}
      <section style={{ display: "grid", gap: 6, padding: 12, border: `1px solid ${$.brd}`, borderRadius: 10, background: $.bgC }}>
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 700 }}>УВЕДОМЛЕНИЯ</div>
        <div style={{ fontSize: 12 }}>Статус: {notificationStatus}</div>
        <button
          type="button"
          onClick={enableNotifications}
          style={{ height: 36, borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, cursor: "pointer" }}
        >Включить уведомления</button>
      </section>

      {/* Appearance */}
      <section style={{ display: "grid", gap: 8, padding: 12, border: `1px solid ${$.brd}`, borderRadius: 10, background: $.bgC }}>
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 700 }}>ВНЕШНИЙ ВИД</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setDk(false)}
            style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${$.brd}`, background: !dk ? $.ac : $.bg, color: !dk ? "#fff" : $.tx, cursor: "pointer", fontSize: 12 }}
          >Светлая</button>
          <button
            type="button"
            onClick={() => setDk(true)}
            style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${$.brd}`, background: dk ? $.ac : $.bg, color: dk ? "#fff" : $.tx, cursor: "pointer", fontSize: 12 }}
          >Тёмная</button>
        </div>
        <div style={{ fontSize: 11, color: $.txS, marginTop: 4 }}>Размер шрифта</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["S", "M", "L"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFontSize(s)}
              style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${$.brd}`, background: fontSize === s ? $.ac : $.bg, color: fontSize === s ? "#fff" : $.tx, cursor: "pointer", fontSize: 12 }}
            >{s}</button>
          ))}
        </div>
      </section>

      {/* Security */}
      <section style={{ display: "grid", gap: 8, padding: 12, border: `1px solid ${$.brd}`, borderRadius: 10, background: $.bgC }}>
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 700 }}>БЕЗОПАСНОСТЬ</div>
        {!pwOpen ? (
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            style={{ height: 36, borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, cursor: "pointer" }}
          >Сменить пароль</button>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            <input
              type="password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              placeholder="Текущий пароль"
              style={{ height: 36, padding: "0 10px", border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bg, color: $.tx }}
            />
            <input
              type="password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              placeholder="Новый пароль"
              style={{ height: 36, padding: "0 10px", border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bg, color: $.tx }}
            />
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              placeholder="Повторите новый"
              style={{ height: 36, padding: "0 10px", border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bg, color: $.tx }}
            />
            {pwMsg && (
              <div style={{ fontSize: 12, color: pwMsg === "Пароль изменён" ? $.ac : $.dn }}>{pwMsg}</div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={handlePwSubmit}
                style={{ flex: 1, height: 36, borderRadius: 8, border: "none", background: $.ac, color: "#fff", cursor: "pointer", fontWeight: 600 }}
              >Сохранить</button>
              <button
                type="button"
                onClick={() => { setPwOpen(false); setPwMsg(""); }}
                style={{ flex: 1, height: 36, borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, cursor: "pointer" }}
              >Отмена</button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, color: $.txS, marginTop: 4 }}>Активные устройства</div>
        {devices.length === 0 && (
          <div style={{ fontSize: 12, color: $.txS }}>Нет зарегистрированных устройств</div>
        )}
        {devices.map((d) => (
          <div key={d.device_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.user_agent || "Устройство"}</div>
              <div style={{ fontSize: 10, color: $.txS }}>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "—"}</div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await revokeDevice(d.device_id);
                setDevices((prev) => prev.filter((x) => x.device_id !== d.device_id));
              }}
              style={{ height: 30, padding: "0 10px", borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.dn, cursor: "pointer", fontSize: 12 }}
            >Отозвать</button>
          </div>
        ))}
      </section>

      {/* Data / logout */}
      <section style={{ display: "grid", gap: 6, padding: 12, border: `1px solid ${$.brd}`, borderRadius: 10, background: $.bgC }}>
        <div style={{ fontSize: 11, color: $.txS, fontWeight: 700 }}>ДАННЫЕ</div>
        <button
          type="button"
          onClick={logout}
          style={{ height: 36, borderRadius: 8, border: "none", background: $.dn, color: "#fff", cursor: "pointer", fontWeight: 600 }}
        >Выйти</button>
      </section>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{ height: 36, borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bg, color: $.tx, cursor: "pointer" }}
        >Закрыть</button>
      )}
    </div>
  );
}
