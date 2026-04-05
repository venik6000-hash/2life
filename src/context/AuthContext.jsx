import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);
const TOKEN_KEY = "dash_token";
const USER_KEY  = "dash_user";

export function AuthProvider({ children }) {
  const [token,       setToken]       = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [user,        setUser]        = useState(() => { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } });
  const [permissions, setPermissions] = useState(null);
  const [checking,    setChecking]    = useState(true);

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setUser(data.user); setPermissions(data.permissions); })
      .catch(() => { setToken(null); setUser(null); setPermissions(null); localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); })
      .finally(() => setChecking(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (username, password) => {
    const res  = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка входа");
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY,  JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setPermissions(data.permissions || null);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
    setToken(null); setUser(null); setPermissions(null);
  }, []);

  const authFetch = useCallback((url, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { ...opts, headers });
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, permissions, checking, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
