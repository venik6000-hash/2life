const jwt  = require("jsonwebtoken");
const crypto = require("crypto");
const { getPermissionsForRole } = require("../services/permissions");
const { isBlacklisted } = require("../services/tokenBlacklist");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("[auth] FATAL: JWT_SECRET не задан. Установите переменную окружения JWT_SECRET и перезапустите сервер.");
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

// requireAuth(...roles) — middleware. Без roles: любой авторизованный.
// requireAuth("admin") — только admin. requireAuth("admin","doctor") — admin или doctor.
const requireAuth = (...roles) => (req, res, next) => {
  const header = req.headers["authorization"] || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  // EventSource не поддерживает заголовки — для SSE принимаем одноразовый тикет из query-параметра
  if (!token && req.query.ticket) {
    const { consumeTicket } = require("../services/sseTickets");
    const user = consumeTicket(req.query.ticket);
    if (!user) return res.status(401).json({ error: "Недействительный или просроченный SSE-тикет" });
    if (roles.length && !roles.includes(user.role)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    req.user = user;
    return next();
  }

  if (!token) return res.status(401).json({ error: "Требуется авторизация" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Проверяем, не был ли токен отозван (logout)
    if (payload.jti && isBlacklisted(payload.jti)) {
      return res.status(401).json({ error: "Токен отозван" });
    }

    if (roles.length && !roles.includes(payload.role)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    req.user = payload;

    // Fire-and-forget: записываем (user_id, device_id) → jti для возможности отзыва сессии устройства.
    const deviceId = req.headers["x-messenger-device-id"];
    if (deviceId && typeof deviceId === "string" && deviceId.length > 0 && deviceId.length <= 160 && payload.jti) {
      try {
        const { recordDeviceSession } = require("../services/messengerStore");
        recordDeviceSession(payload.id, deviceId, payload.jti, req.headers["user-agent"] || "").catch(() => {});
      } catch (_) { /* best-effort */ }
    }

    next();
  } catch (_) {
    res.status(401).json({ error: "Токен недействителен или истёк" });
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
  const perms = await getPermissionsForRole(req.user?.role);
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
  signToken,
  TOKEN_TTL,
};
