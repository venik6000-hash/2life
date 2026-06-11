import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { clearPendingPassword } from "../utils/cryptoSession";
import { withNoStoreCache, TimeoutError } from "../utils/fetchOptions";
import { deepEqual } from "../utils/deepEqual";
import { shouldClearSessionAfterAuthCheck } from "../utils/authSession";

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
    const requestToken = token;
    const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;
    fetch("/api/auth/me", withNoStoreCache({ headers: { Authorization: `Bearer ${requestToken}`, "X-Messenger-Device-Id": getOrCreateDeviceId() }, signal: controller?.signal }))
      .then(async (res) => {
        if (shouldClearSessionAfterAuthCheck(res.status)) {
          if (localStorage.getItem(TOKEN_KEY) !== requestToken) return null;
          setToken(null); setUser(null); setPermissions(null); clearSessionCache();
          return null;
        }
        if (!res.ok) return null;
        return res.json();
      })
      .then(data => {
        if (!data?.user) return;
        if (localStorage.getItem(TOKEN_KEY) !== requestToken) return;
        // Preserve referential identity when the content is unchanged. The token
        // re-validation that fires right after login returns byte-identical
        // permissions; handing back a NEW object reference would needlessly rebuild
        // permission-derived callbacks (canReadSection, …) and re-fire the dashboard
        // bootstrap — the root cause of the "no clients until refresh" race. Security
        // is unaffected: any real change still replaces the value.
        setUser(prev => deepEqual(prev, data.user) ? prev : data.user);
        try { localStorage.setItem(USER_KEY, JSON.stringify(data.user)); } catch (_) {}
        setPermissions(prev => deepEqual(prev, data.permissions) ? prev : data.permissions);
      })
      .catch((err) => {
        // Network, timeout, malformed response, and 5xx failures are transient.
        // Protected requests are still checked by the server once it recovers.
        if (err?.name === "AbortError") return;
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
        if (localStorage.getItem(TOKEN_KEY) === requestToken) setChecking(false);
      });
  }, [token, clearSessionCache]);

  const login = useCallback(async (username, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      cache: "no-store",
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

  const logout = useCallback(() => {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    clearSessionCache();
    setToken(null); setUser(null); setPermissions(null);

    if (currentToken) {
      const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
      fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        headers: { Authorization: `Bearer ${currentToken}` },
        signal: controller?.signal,
      }).catch(() => {}).finally(() => {
        if (timer) clearTimeout(timer);
      });
    }
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
    const { timeoutMs = 10000, headers: optHeaders, signal: optSignal, ...rest } = opts;
    const requestToken = token;
    const headers = { ...(optHeaders || {}) };
    if (requestToken) headers["Authorization"] = `Bearer ${requestToken}`;
    headers["X-Messenger-Device-Id"] = getOrCreateDeviceId();
    const controller = (timeoutMs > 0 && typeof AbortController !== "undefined" && !optSignal) ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetch(url, withNoStoreCache({ ...rest, headers, signal: optSignal || controller?.signal }));
    } catch (err) {
      if (controller && err?.name === "AbortError") throw new TimeoutError(`Запрос превысил ${timeoutMs} мс`);
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
    // 401 от старого запроса не должен стирать уже обновлённую сессию.
    if (res.status === 401 && requestToken && localStorage.getItem(TOKEN_KEY) === requestToken) {
      clearSessionCache();
      setToken(null);
      setUser(null);
      setPermissions(null);
    }
    return res;
  }, [token, clearSessionCache]);

  // Re-fetch the current user + permissions without reload (used when the
  // server pushes a "permissions-updated" event). A 401 is handled inside
  // authFetch (session cleared → login screen).
  const refreshAuth = useCallback(async () => {
    const res = await authFetch("/api/auth/me");
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    if (!data?.user) return false;
    // Same identity-preserving guard as the /me effect: a no-op refresh (server
    // pushed "permissions-updated" but nothing actually changed for this role)
    // must not churn references and re-fire permission-keyed effects.
    setUser(prev => deepEqual(prev, data.user) ? prev : data.user);
    try { localStorage.setItem(USER_KEY, JSON.stringify(data.user)); } catch (_) {}
    const nextPermissions = data.permissions || null;
    setPermissions(prev => deepEqual(prev, nextPermissions) ? prev : nextPermissions);
    return true;
  }, [authFetch]);

  return (
    <AuthContext.Provider value={{ token, user, permissions, checking, login, logout, authFetch, applySession, updateUser, refreshAuth, getOrCreateDeviceId }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
