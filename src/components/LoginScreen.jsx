import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { setPendingPassword } from "../utils/cryptoSession";
import Input from "./Input";
import Button from "./Button";

export default function LoginScreen() {
  const { login } = useAuth();
  const { $ } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      setPendingPassword(password);
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: $.bg,
      fontFamily: "system-ui, sans-serif",
    }}>
      <form onSubmit={handleSubmit} style={{
        width: 340,
        background: $.bgC,
        border: `1px solid ${$.brd}`,
        borderRadius: 14,
        padding: "36px 32px",
        boxShadow: $.sh,
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: $.ac, letterSpacing: -0.5 }}>2life</div>
          <div style={{ fontSize: 13, color: $.txS, marginTop: 4 }}>Войдите в систему</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, color: $.txS, marginBottom: 5, fontWeight: 600 }}>
            ЛОГИН
          </label>
          <Input
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="admin"
          />
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "block", fontSize: 11, color: $.txS, marginBottom: 5, fontWeight: 600 }}>
            ПАРОЛЬ
          </label>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••"
          />
        </div>

        {error && (
          <div style={{
            background: $.dnD,
            border: `1px solid ${$.dn}44`,
            borderRadius: 7,
            padding: "9px 12px",
            marginBottom: 16,
            fontSize: 13,
            color: $.dn,
          }}>
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={loading || !username || !password}
          fullWidth
          size="lg"
        >
          {loading ? "Вход..." : "Войти"}
        </Button>
      </form>
    </div>
  );
}
