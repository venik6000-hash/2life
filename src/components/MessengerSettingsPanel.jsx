import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { useTheme } from "../context/ThemeContext";
import { getMessengerFontConfig } from "../utils/messengerFont";

function sectionStyle($) {
  return {
    display: "grid",
    gap: 10,
    padding: 14,
    border: `1px solid ${$.brd}`,
    borderRadius: 10,
    background: $.bgC,
    minWidth: 0,
  };
}

function controlStyle($, cfg, extra = {}) {
  return {
    minHeight: cfg.controlHeight,
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${$.brd}`,
    background: $.bg,
    color: $.tx,
    cursor: "pointer",
    fontSize: cfg.control,
    fontFamily: "inherit",
    lineHeight: 1.25,
    minWidth: 0,
    ...extra,
  };
}

export function MessengerSettingsPanelContent({
  $,
  dk,
  setDk,
  user,
  logout,
  authFetch,
  applySession,
  notificationStatus,
  enableNotifications,
  fontSize,
  setFontSize,
  updateDisplayName,
  listDevices,
  revokeDevice,
  onClose,
}) {
  const cfg = getMessengerFontConfig(fontSize);
  const [displayName, setDisplayName] = useState(user?.display_name || user?.username || "");
  const [nameMsg, setNameMsg] = useState("");
  const [devices, setDevices] = useState([]);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  useEffect(() => {
    listDevices().then(setDevices).catch(() => {});
  }, [listDevices]);

  // Подтягиваем актуальное имя при изменении user (например, после успешного rename).
  useEffect(() => {
    setDisplayName(user?.display_name || user?.username || "");
  }, [user?.display_name, user?.username]);

  const handleNameBlur = async () => {
    const next = displayName.trim();
    if (next === (user?.display_name || "")) return;
    setNameMsg("");
    const result = await updateDisplayName(next);
    if (!result.ok) {
      setDisplayName(user?.display_name || "");
      setNameMsg(result.error || "Не удалось сохранить имя");
    } else {
      setNameMsg("Имя обновлено");
      setTimeout(() => setNameMsg(""), 1500);
    }
  };

  const handlePwSubmit = async () => {
    if (pwNew !== pwConfirm) { setPwMsg("Новый пароль не совпадает"); return; }
    if (pwNew.length < 8) { setPwMsg("Минимум 8 символов"); return; }
    try {
      const currentPassword = pwCurrent.trim();
      const body = currentPassword
        ? { currentPassword, newPassword: pwNew }
        : { newPassword: pwNew };
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setPwMsg(data?.error || "Ошибка"); return; }
      if (data?.token && data?.user) applySession(data.token, data.user, data.permissions);
      setPwMsg("Пароль изменён"); setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setTimeout(() => { setPwOpen(false); setPwMsg(""); }, 1200);
    } catch (e) { setPwMsg(e.message); }
  };

  return (
    <div style={{
      display: "grid",
      gap: 12,
      padding: "clamp(12px, 4vw, 18px)",
      color: $.tx,
      fontFamily: "system-ui, sans-serif",
      fontSize: cfg.base,
      width: "100%",
      maxWidth: 720,
      margin: "0 auto",
      boxSizing: "border-box",
      minWidth: 0,
    }}>
      <h2 style={{ margin: 0, fontSize: cfg.heading, lineHeight: 1.25 }}>Настройки</h2>

      {/* Profile */}
      <section style={sectionStyle($)}>
        <div style={{ fontSize: cfg.sectionLabel, color: $.txS, fontWeight: 700 }}>ПРОФИЛЬ</div>
        <label style={{ fontSize: cfg.label }}>Отображаемое имя</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          style={controlStyle($, cfg, { cursor: "text", fontSize: Math.max(16, cfg.input) })}
        />
        {nameMsg && (
          <div style={{ fontSize: cfg.small, color: nameMsg === "Имя обновлено" ? $.ac : $.dn }}>{nameMsg}</div>
        )}
      </section>

      {/* Notifications */}
      <section style={sectionStyle($)}>
        <div style={{ fontSize: cfg.sectionLabel, color: $.txS, fontWeight: 700 }}>УВЕДОМЛЕНИЯ</div>
        <div style={{ fontSize: cfg.label }}>Статус: {notificationStatus}</div>
        <button
          type="button"
          onClick={enableNotifications}
          style={controlStyle($, cfg)}
        >Включить уведомления</button>
      </section>

      {/* Appearance */}
      <section style={sectionStyle($)}>
        <div style={{ fontSize: cfg.sectionLabel, color: $.txS, fontWeight: 700 }}>ВНЕШНИЙ ВИД</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))", gap: 8 }}>
          <button
            type="button"
            aria-pressed={!dk}
            onClick={() => setDk(false)}
            style={controlStyle($, cfg, { background: !dk ? $.ac : $.bg, color: !dk ? "#fff" : $.tx })}
          >Светлая</button>
          <button
            type="button"
            aria-pressed={dk}
            onClick={() => setDk(true)}
            style={controlStyle($, cfg, { background: dk ? $.ac : $.bg, color: dk ? "#fff" : $.tx })}
          >Тёмная</button>
        </div>
        <div style={{ fontSize: cfg.sectionLabel, color: $.txS, marginTop: 2 }}>Размер шрифта</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {["S", "M", "L"].map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={fontSize === s}
              onClick={() => setFontSize(s)}
              style={controlStyle($, cfg, { background: fontSize === s ? $.ac : $.bg, color: fontSize === s ? "#fff" : $.tx })}
            >{s}</button>
          ))}
        </div>
      </section>

      {/* Security */}
      <section style={sectionStyle($)}>
        <div style={{ fontSize: cfg.sectionLabel, color: $.txS, fontWeight: 700 }}>БЕЗОПАСНОСТЬ</div>
        {!pwOpen ? (
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            style={controlStyle($, cfg)}
          >Сменить пароль</button>
        ) : (
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <input
              type="password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              placeholder="Текущий пароль"
              style={controlStyle($, cfg, { cursor: "text", fontSize: Math.max(16, cfg.input) })}
            />
            <input
              type="password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              placeholder="Новый пароль"
              style={controlStyle($, cfg, { cursor: "text", fontSize: Math.max(16, cfg.input) })}
            />
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              placeholder="Повторите новый"
              style={controlStyle($, cfg, { cursor: "text", fontSize: Math.max(16, cfg.input) })}
            />
            {pwMsg && (
              <div style={{ fontSize: cfg.small, color: pwMsg === "Пароль изменён" ? $.ac : $.dn }}>{pwMsg}</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 8 }}>
              <button
                type="button"
                onClick={handlePwSubmit}
                style={controlStyle($, cfg, { border: "none", background: $.ac, color: "#fff", fontWeight: 600 })}
              >Сохранить</button>
              <button
                type="button"
                onClick={() => { setPwOpen(false); setPwMsg(""); }}
                style={controlStyle($, cfg)}
              >Отмена</button>
            </div>
          </div>
        )}

        <div style={{ fontSize: cfg.sectionLabel, color: $.txS, marginTop: 2 }}>Активные устройства</div>
        {devices.length === 0 && (
          <div style={{ fontSize: cfg.small, color: $.txS }}>Нет зарегистрированных устройств</div>
        )}
        {devices.map((d) => (
          <div key={d.device_id} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "6px 0", minWidth: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: cfg.small, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.user_agent || "Устройство"}</div>
              <div style={{ fontSize: cfg.meta, color: $.txS }}>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "—"}</div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await revokeDevice(d.device_id);
                setDevices((prev) => prev.filter((x) => x.device_id !== d.device_id));
              }}
              style={controlStyle($, cfg, { minHeight: Math.max(30, cfg.controlHeight - 4), color: $.dn, fontSize: cfg.small })}
            >Отозвать</button>
          </div>
        ))}
      </section>

      {/* Data / logout */}
      <section style={sectionStyle($)}>
        <div style={{ fontSize: cfg.sectionLabel, color: $.txS, fontWeight: 700 }}>ДАННЫЕ</div>
        <button
          type="button"
          onClick={logout}
          style={controlStyle($, cfg, { border: "none", background: $.dn, color: "#fff", fontWeight: 600 })}
        >Выйти</button>
      </section>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={controlStyle($, cfg)}
        >Закрыть</button>
      )}
    </div>
  );
}

export default function MessengerSettingsPanel({ onClose }) {
  const { user, logout, authFetch, applySession } = useAuth();
  const { $, dk, setDk } = useTheme();
  const {
    notificationStatus, enableNotifications,
    fontSize, setFontSize, updateDisplayName,
    listDevices, revokeDevice,
  } = useMessenger();

  return (
    <MessengerSettingsPanelContent
      $={$}
      dk={dk}
      setDk={setDk}
      user={user}
      logout={logout}
      authFetch={authFetch}
      applySession={applySession}
      notificationStatus={notificationStatus}
      enableNotifications={enableNotifications}
      fontSize={fontSize}
      setFontSize={setFontSize}
      updateDisplayName={updateDisplayName}
      listDevices={listDevices}
      revokeDevice={revokeDevice}
      onClose={onClose}
    />
  );
}
