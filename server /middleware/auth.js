const jwt = require("jsonwebtoken");
const { getPermissionsForRole } = require("../services/permissions");

const JWT_SECRET = process.env.JWT_SECRET || "2life-dev-secret-change-in-production";
const TOKEN_TTL  = "8h";

if (!process.env.JWT_SECRET) {
  console.warn("[auth] JWT_SECRET не задан — используется дефолтный секрет. Установите JWT_SECRET в продакшене.");
}

// requireAuth(...roles) — middleware. Без roles: любой авторизованный.
// requireAuth("admin") — только admin. requireAuth("admin","doctor") — admin или doctor.
const requireAuth = (...roles) => (req, res, next) => {
  const header = req.headers["authorization"] || "";
  // EventSource не поддерживает заголовки — для SSE-соединений принимаем токен из query-параметра
  const token  = header.startsWith("Bearer ") ? header.slice(7) : (req.query.token || null);
  if (!token) return res.status(401).json({ error: "Требуется авторизация" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (roles.length && !roles.includes(payload.role)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    req.user = payload;
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
  JWT_SECRET,
  TOKEN_TTL
};
