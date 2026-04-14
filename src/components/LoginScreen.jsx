import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { setPendingPassword } from "../utils/cryptoSession";

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

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

  const inp = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1px solid #2a3148", background: "#181d28",
    color: "#e4e8f0", fontSize: 14, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#06080e", fontFamily: "system-ui, sans-serif",
    }}>
      <form onSubmit={handleSubmit} style={{
        width: 340, background: "#0d1017", border: "1px solid #1c2233",
        borderRadius: 14, padding: "36px 32px", boxShadow: "0 8px 40px rgba(0,0,0,.5)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#22c997", letterSpacing: -0.5 }}>2life</div>
          <div style={{ fontSize: 13, color: "#7d89a1", marginTop: 4 }}>Войдите в систему</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, color: "#7d89a1", marginBottom: 5, fontWeight: 600 }}>
            ЛОГИН
          </label>
          <input
            style={inp} type="text" autoComplete="username" autoFocus
            value={username} onChange={e => setUsername(e.target.value)}
            placeholder="admin"
          />
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "block", fontSize: 11, color: "#7d89a1", marginBottom: 5, fontWeight: 600 }}>
            ПАРОЛЬ
          </label>
          <input
            style={inp} type="password" autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••"
          />
        </div>

        {error && (
          <div style={{
            background: "rgba(239,83,80,.12)", border: "1px solid rgba(239,83,80,.3)",
            borderRadius: 7, padding: "9px 12px", marginBottom: 16,
            fontSize: 13, color: "#ef5350",
          }}>
            {error}
          </div>
        )}

        <button
          type="submit" disabled={loading || !username || !password}
          style={{
            width: "100%", padding: "11px", borderRadius: 8, border: "none",
            background: loading ? "#1a7a5e" : "#22c997", color: "#fff",
            fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit", transition: "background .15s",
          }}
        >
          {loading ? "Вход..." : "Войти"}
        </button>
      </form>
    </div>
  );
}
