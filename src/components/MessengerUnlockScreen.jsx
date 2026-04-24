import { useState } from "react";
import { useTheme } from "../context/ThemeContext";

export default function MessengerUnlockScreen({ unlockCrypto, cryptoError }) {
  const { $ } = useTheme();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleUnlock = async (event) => {
    event.preventDefault();
    if (!password) return;
    setBusy(true);
    await unlockCrypto(password);
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 40 }}>
      <div style={{ textAlign: "center", maxWidth: 380 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Мессенджер зашифрован</div>
        <div style={{ fontSize: 13, color: $.txM, marginBottom: 20 }}>
          Введите пароль, чтобы разблокировать переписку.<br />
          Ваши сообщения зашифрованы сквозным шифрованием и не могут быть прочитаны сервером.
        </div>
        <form onSubmit={handleUnlock} style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bgI, color: $.tx, fontSize: 13, fontFamily: "inherit", outline: "none", minWidth: 200 }}
          />
          <button
            type="submit"
            disabled={busy || !password}
            style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: $.ac, color: "#fff", cursor: password ? "pointer" : "default", fontWeight: 600, fontSize: 13, fontFamily: "inherit", opacity: password ? 1 : 0.5 }}
          >
            {busy ? "..." : "Разблокировать"}
          </button>
        </form>
        {cryptoError && (
          <div style={{ marginTop: 10, color: $.dn, fontSize: 12 }}>{cryptoError}</div>
        )}
      </div>
    </div>
  );
}
