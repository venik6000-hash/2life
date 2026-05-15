import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { clearPendingPassword } from "../utils/cryptoSession";

const AuthContext = createContext(null);
const TOKEN_KEY = "dash_token";
const USER_KEY  = "dash_user";
const DEVICE_ID_KEY = "dash_messenger_device_id";

function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (id) return id;
    id = globalThis.crypto?.randomUUID?.() || `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return "anon";
  }
}

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
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}`, "X-Messenger-Device-Id": getOrCreateDeviceId() } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setUser(data.user);
        try { localStorage.setItem(USER_KEY, JSON.stringify(data.user)); } catch (_) {}
        setPermissions(data.permissions);
      })
      .catch(() => {
        setToken(null);
        setUser(null);
        setPermissions(null);
        clearSessionCache();
      })
      .finally(() => setChecking(false));
  }, [token, clearSessionCache]);

  const login = useCallback(async (username, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const fallback = res.status >= 500 ? "Сервер недоступен. Попробуйте позже." : "Ошибка входа";
      throw new Error(data?.error || fallback);
    }
    if (!data?.token || !data?.user) {
      throw new Error("Сервер API недоступен или прокси /api настроен неверно.");
    }

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

  const updateUser = useCallback((patch) => {
    if (!patch || typeof patch !== "object") return;
    setUser((prev) => {
      const next = { ...(prev || {}), ...patch };
      try { localStorage.setItem(USER_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);

  const authFetch = useCallback(async (url, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    headers["X-Messenger-Device-Id"] = getOrCreateDeviceId();
    const res = await fetch(url, { ...opts, headers });
    // Если сервер сообщает, что наш токен отозван — мгновенно разлогиниваемся.
    if (res.status === 401 && token) {
      try {
        const cloned = res.clone();
        const data = await cloned.json().catch(() => null);
        const msg = String(data?.error || "");
        if (/отозван|revoked|устарел|истёк|истек|invalid/i.test(msg)) {
          clearSessionCache();
          setToken(null);
          setUser(null);
          setPermissions(null);
        }
      } catch (_) {}
    }
    return res;
  }, [token, clearSessionCache]);

  return (
    <AuthContext.Provider value={{ token, user, permissions, checking, login, logout, authFetch, applySession, updateUser, getOrCreateDeviceId }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
