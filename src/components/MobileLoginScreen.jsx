import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function MobileLoginScreen() {
  const { login } = useAuth();
  const { $ } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
      window.history.replaceState(null, "", "/app/messenger");
      dispatchPopState();
    } catch (err) {
      setError(err.message || "Не удалось войти");
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || !username.trim() || !password;

  return (
    <main style={{
      minHeight: "100dvh",
      background: $.bg,
      color: $.tx,
      display: "flex",
      alignItems: "center",
      padding: "calc(env(safe-area-inset-top) + 20px) 20px calc(env(safe-area-inset-bottom) + 20px)",
      fontFamily: "system-ui, sans-serif",
    }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 420, margin: "0 auto", display: "grid", gap: 18 }}>
        <header style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          <div style={{ color: $.ac, fontWeight: 800, fontSize: 34, letterSpacing: 0 }}>2life</div>
          <div style={{ fontSize: 22, fontWeight: 750, letterSpacing: 0 }}>Мессенджер</div>
          <div style={{ color: $.txS, fontSize: 15 }}>Войдите, чтобы открыть переписку</div>
        </header>

        <label style={{ display: "grid", gap: 7, fontSize: 14, fontWeight: 650 }}>
          Логин
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            style={{
              height: 52,
              borderRadius: 12,
              border: `1px solid ${$.brd}`,
              background: $.bgC,
              color: $.tx,
              padding: "0 14px",
              fontSize: 17,
              outline: "none",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 7, fontSize: 14, fontWeight: 650 }}>
          Пароль
          <div style={{
            display: "flex",
            alignItems: "center",
            height: 52,
            borderRadius: 12,
            border: `1px solid ${$.brd}`,
            background: $.bgC,
            overflow: "hidden",
          }}>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                outline: 0,
                background: "transparent",
                color: $.tx,
                padding: "0 14px",
                fontSize: 17,
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              style={{
                height: "100%",
                minWidth: 84,
                border: 0,
                borderLeft: `1px solid ${$.brd}`,
                background: "transparent",
                color: $.ac,
                fontWeight: 700,
              }}
            >
              {showPassword ? "Скрыть" : "Показать"}
            </button>
          </div>
        </label>

        {error && (
          <div style={{
            color: $.dn,
            background: $.dnD,
            border: `1px solid ${$.dn}44`,
            borderRadius: 10,
            padding: 12,
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        <button
          disabled={disabled}
          style={{
            height: 54,
            border: 0,
            borderRadius: 14,
            background: $.ac,
            color: "#fff",
            fontSize: 17,
            fontWeight: 800,
            opacity: disabled ? 0.55 : 1,
          }}
        >
          {loading ? "Входим..." : "Войти"}
        </button>
      </form>
    </main>
  );
}

function dispatchPopState() {
  try {
    window.dispatchEvent(new Event("popstate"));
  } catch {
    const event = document.createEvent("Event");
    event.initEvent("popstate", true, true);
    window.dispatchEvent(event);
  }
}
