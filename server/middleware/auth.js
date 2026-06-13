const jwt  = require("jsonwebtoken");
const crypto = require("crypto");
const { getPermissionsForRoleCached } = require("../services/permissions");
const { pool } = require("../services/db");

const JWT_SECRET = process.env.JWT_SECRET;
const weakSecret = !JWT_SECRET
  || JWT_SECRET.length < 32
  || /change-this|your-very-long-random-jwt-secret/i.test(JWT_SECRET);
if (weakSecret) {
  console.error("[auth] FATAL: JWT_SECRET должен содержать минимум 32 случайных символа и не быть шаблонным.");
  process.exit(1);
}
const TOKEN_TTL = "8h";

/**
 * Подписать токен с уникальным jti (для поддержки отзыва при логауте).
 * JWT_SECRET не экспортируется — только через эту функцию.
 * @param {{ id: number, username: string, role: string }} payload
 * @returns {string}
 */
const signToken = (payload) =>
  jwt.sign({ ...payload, jti: crypto.randomUUID() }, JWT_SECRET, { expiresIn: TOKEN_TTL });

const loadCurrentUser = async (userId, jti = null) => {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const r = await pool.query(
    `SELECT u.id, u.username, u.role, u.all_clients_access, u.display_name, u.token_version,
            EXISTS (
              SELECT 1
                FROM revoked_auth_tokens rat
               WHERE rat.jti = $2
                 AND rat.expires_at > NOW()
            ) AS token_revoked
       FROM users u
      WHERE u.id = $1 AND u.active = true
      LIMIT 1`,
    [id, jti]
  );
  const row = r.rows[0] || null;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    all_clients_access: !!row.all_clients_access,
    display_name: row.display_name || "",
    token_version: Number(row.token_version || 0),
    token_revoked: !!row.token_revoked,
  };
};

const mergeTokenContext = (tokenUser, currentUser) => ({
  ...tokenUser,
  id: currentUser.id,
  username: currentUser.username,
  role: currentUser.role,
  all_clients_access: currentUser.all_clients_access,
  display_name: currentUser.display_name,
  token_version: currentUser.token_version,
});

const isSseTicketRequest = (req) => {
  const path = String(req.path || "").split("?")[0];
  const originalPath = String(req.originalUrl || "").split("?")[0];
  return path === "/events" || originalPath === "/api/events";
};

// requireAuth(...roles) — middleware. Без roles: любой авторизованный.
// requireAuth("admin") — только admin. requireAuth("admin","doctor") — admin или doctor.
const requireAuth = (...roles) => async (req, res, next) => {
  const header = req.headers["authorization"] || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  // EventSource не поддерживает заголовки — для SSE принимаем одноразовый тикет только на /events.
  if (!token && req.query.ticket) {
    if (!isSseTicketRequest(req)) {
      return res.status(401).json({ error: "Требуется авторизация" });
    }
    const { consumeTicket } = require("../services/sseTickets");
    const user = consumeTicket(req.query.ticket);
    if (!user) return res.status(401).json({ error: "Недействительный или просроченный SSE-тикет" });
    try {
      const currentUser = await loadCurrentUser(user.id, user.jti);
      if (!currentUser) return res.status(401).json({ error: "Пользователь отключён или удалён" });
      if (currentUser.token_revoked) return res.status(401).json({ error: "Токен отозван" });
      if (Number(user.token_version || 0) !== Number(currentUser.token_version || 0)) {
        return res.status(401).json({ error: "Сессия отозвана" });
      }
      const authUser = mergeTokenContext(user, currentUser);
      if (roles.length && !roles.includes(authUser.role)) {
        return res.status(403).json({ error: "Недостаточно прав" });
      }
      req.user = authUser;
      return next();
    } catch (_) {
      return res.status(500).json({ error: "Ошибка проверки авторизации" });
    }
  }

  if (!token) return res.status(401).json({ error: "Требуется авторизация" });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return res.status(401).json({ error: "Токен недействителен или истёк" });
  }

  try {
    const currentUser = await loadCurrentUser(payload.id, payload.jti);
    if (!currentUser) {
      return res.status(401).json({ error: "Пользователь отключён или удалён" });
    }
    if (currentUser.token_revoked) {
      return res.status(401).json({ error: "Токен отозван" });
    }
    if (Number(payload.token_version || 0) !== Number(currentUser.token_version || 0)) {
      return res.status(401).json({ error: "Сессия отозвана" });
    }
    const authUser = mergeTokenContext(payload, currentUser);
    if (roles.length && !roles.includes(currentUser.role)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    req.user = authUser;

    // Fire-and-forget: записываем (user_id, device_id) → jti для возможности отзыва сессии устройства.
    const deviceId = req.headers["x-messenger-device-id"];
    if (deviceId && typeof deviceId === "string" && deviceId.length > 0 && deviceId.length <= 160 && authUser.jti) {
      try {
        const { recordDeviceSession } = require("../services/messengerStore");
        recordDeviceSession(authUser.id, deviceId, authUser.jti, req.headers["user-agent"] || "").catch(() => {});
      } catch (_) { /* best-effort */ }
    }

    next();
  } catch (_) {
    res.status(500).json({ error: "Ошибка проверки авторизации" });
  }
};

const hasRolePermission = (permissions, permissionId) => {
  if (!permissions) return false;
  if (permissions.isAdmin) return true;
  if (permissionId === "create_client") return !!permissions.canCreateClient;
  if (permissionId === "delete_client") return !!permissions.canDeleteClient;
  if (permissionId === "import_data") return !!permissions.canImportData;
  return false;
};

const hasSectionRead = (permissions, sectionId) => {
  if (!permissions) return false;
  if (permissions.isAdmin) return true;
  const section = permissions.sections?.[sectionId];
  return !!(section?.read || section?.write);
};

const hasSectionWrite = (permissions, sectionId) => {
  if (!permissions) return false;
  if (permissions.isAdmin) return true;
  const section = permissions.sections?.[sectionId];
  return !!section?.write;
};

const attachPermissions = async (req) => {
  if (req.rolePermissions) return req.rolePermissions;
  const perms = await getPermissionsForRoleCached(req.user?.role);
  req.rolePermissions = perms || null;
  return req.rolePermissions;
};

const requirePermission = (permissionId) => async (req, res, next) => {
  try {
    const permissions = await attachPermissions(req);
    if (!hasRolePermission(permissions, permissionId)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    next();
  } catch (_) {
    res.status(500).json({ error: "Ошибка проверки прав доступа" });
  }
};

const requireSectionRead = (sectionId) => async (req, res, next) => {
  try {
    const permissions = await attachPermissions(req);
    if (!hasSectionRead(permissions, sectionId)) {
      return res.status(403).json({ error: "Раздел недоступен" });
    }
    next();
  } catch (_) {
    res.status(500).json({ error: "Ошибка проверки прав доступа" });
  }
};

const requireSectionWrite = (sectionId) => async (req, res, next) => {
  try {
    const permissions = await attachPermissions(req);
    if (!hasSectionWrite(permissions, sectionId)) {
      return res.status(403).json({ error: "Нет прав на изменение раздела" });
    }
    next();
  } catch (_) {
    res.status(500).json({ error: "Ошибка проверки прав доступа" });
  }
};

const requireAnySectionRead = () => async (req, res, next) => {
  try {
    const permissions = await attachPermissions(req);
    if (!permissions) return res.status(403).json({ error: "Недостаточно прав" });
    if (permissions.isAdmin) return next();
    const sections = permissions.sections || {};
    const hasRead = Object.values(sections).some((entry) => !!(entry?.read || entry?.write));
    if (!hasRead) return res.status(403).json({ error: "Нет доступа к разделам" });
    next();
  } catch (_) {
    res.status(500).json({ error: "Ошибка проверки прав доступа" });
  }
};

const requireAnySectionWrite = () => async (req, res, next) => {
  try {
    const permissions = await attachPermissions(req);
    if (!permissions) return res.status(403).json({ error: "Недостаточно прав" });
    if (permissions.isAdmin) return next();
    const sections = permissions.sections || {};
    const hasWrite = Object.values(sections).some((entry) => !!entry?.write);
    if (!hasWrite) return res.status(403).json({ error: "Нет прав на изменение данных" });
    next();
  } catch (_) {
    res.status(500).json({ error: "Ошибка проверки прав доступа" });
  }
};

module.exports = {
  requireAuth,
  requirePermission,
  requireSectionRead,
  requireSectionWrite,
  requireAnySectionRead,
  requireAnySectionWrite,
  hasSectionWrite,
  attachPermissions,
  signToken,
};
