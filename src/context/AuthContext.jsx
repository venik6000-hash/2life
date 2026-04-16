import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { clearPendingPassword } from "../utils/cryptoSession";

const AuthContext = createContext(null);
const TOKEN_KEY = "dash_token";
const USER_KEY  = "dash_user";

export function AuthProvider({ children }) {
  const [token,       setToken]       = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [user,        setUser]        = useState(() => { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } });
  const [permissions, setPermissions] = useState(null);
  const [checking,    setChecking]    = useState(true);

  const clearSessionCache = useCallback(() => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (!key.startsWith("dash_")) continue;
        // Keep user theme preference across sessions.
        if (key === "dash_theme") continue;
        localStorage.removeItem(key);
      }
    } catch (_) {}
    try { clearPendingPassword(); } catch (_) {}
  }, []);

  const applySession = useCallback((nextToken, nextUser, nextPermissions = null) => {
    if (!nextToken || !nextUser) return false;
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
    setPermissions(nextPermissions || null);
    return true;
  }, []);

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setUser(data.user); setPermissions(data.permissions); })
      .catch(() => {
        setToken(null);
        setUser(null);
        setPermissions(null);
        clearSessionCache();
      })
      .finally(() => setChecking(false));
  }, [token, clearSessionCache]);

  const login = useCallback(async (username, password) => {
    const res  = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка входа");
    applySession(data.token, data.user, data.permissions);
    return data.user;
  }, [applySession]);

  const logout = useCallback(async () => {
    // Инвалидируем токен на сервере (jti-blacklist), затем чистим локальное состояние
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (currentToken) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${currentToken}` },
      }).catch(() => {}); // silent — клиент всё равно разлогинится
    }
    clearSessionCache();
    setToken(null); setUser(null); setPermissions(null);
  }, [clearSessionCache]);

  const authFetch = useCallback((url, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { ...opts, headers });
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, permissions, checking, login, logout, authFetch, applySession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
