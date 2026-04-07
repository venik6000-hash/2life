const bcrypt = require("bcryptjs");
const { pool, createUser } = require("./db");

// При первом старте создаёт admin, если пользователей нет вообще
const initDefaultAdmin = async () => {
  const r = await pool.query("SELECT COUNT(*) as n FROM users");
  const count = parseInt(r.rows[0].n, 10);
  if (count > 0) return;

  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error("[setup] FATAL: ADMIN_PASSWORD не задан. Установите переменную окружения ADMIN_PASSWORD и перезапустите сервер.");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);

  await createUser(username, hash, "admin");
  console.log(`[setup] Создан первый admin: логин="${username}". Смените пароль после входа через /api/auth/change-password`);
};

const ALL_SECTIONS = ['overview','questionnaire','nutrition','protocol','injections','analytics','lab','journal'];
const ALL_PERMISSIONS = ['delete_client','create_client','import_data'];
const DEFAULT_DEFICIT_PRESETS = [
  { id: "iron",      label: "Железодефицит",        markerKey: "нутриенты::ферритин",                            triggerMode: "auto", priority: 100 },
  { id: "vitd",      label: "Дефицит витамина D",   markerKey: "нутриенты::витамин д",                           triggerMode: "auto", priority: 95  },
  { id: "b12",       label: "Дефицит B12",          markerKey: "нутриенты::в12 (голотранскобаламин)",           triggerMode: "auto", priority: 90  },
  { id: "folate",    label: "Дефицит фолатов",      markerKey: "нутриенты::фолиевая кислота в эритроцитах (в9)",triggerMode: "auto", priority: 85  },
  { id: "magnesium", label: "Дефицит магния",       markerKey: "нутриенты::магний в эритроцитах",                triggerMode: "auto", priority: 80  },
  { id: "zinc",      label: "Дефицит цинка",        markerKey: "нутриенты::цинк сыворотка",                      triggerMode: "auto", priority: 75  },
  { id: "selenium",  label: "Дефицит селена",       markerKey: "нутриенты::селен волосы",                        triggerMode: "auto", priority: 70  },
  { id: "protein",   label: "Белковый дефицит",     markerKey: "метаболизм::общий белок",                        triggerMode: "auto", priority: 65  },
  { id: "omega3",    label: "Дефицит омега-3",      markerKey: "эли висцеро тест 24::омега-3 индекс",            triggerMode: "auto", priority: 60  },
];

const initDefaultRoles = async () => {
  const { insertRole, upsertRoleSection, upsertRolePermission } = require('./db');
  const r = await pool.query("SELECT COUNT(*) as n FROM roles");
  const count = parseInt(r.rows[0].n, 10);
  if (count > 0) return;

  const roles = [
    { name: 'admin',        display_name: 'Администратор', is_system: true,  write: true,  permissions: { delete_client: true,  create_client: true,  import_data: true } },
    { name: 'doctor',       display_name: 'Врач',           is_system: true,  write: true,  permissions: { delete_client: false, create_client: true,  import_data: true } },
    { name: 'nutritionist', display_name: 'Нутрициолог',    is_system: false, write: true,  permissions: { delete_client: false, create_client: false, import_data: true } },
    { name: 'viewer',       display_name: 'Наблюдатель',    is_system: false, write: false, permissions: { delete_client: false, create_client: false, import_data: false } },
  ];

  for (const r of roles) {
    const res = await insertRole(r.name, r.display_name, r.is_system);
    const roleId = res.id;
    for (const sec of ALL_SECTIONS) {
      await upsertRoleSection(roleId, sec, true, r.write);
    }
    for (const perm of ALL_PERMISSIONS) {
      await upsertRolePermission(roleId, perm, r.permissions[perm]);
    }
  }
  console.log('[setup] Созданы роли по умолчанию: admin, doctor, nutritionist, viewer');
};

const initDefaultDeficitPresets = async () => {
  const { listRefData, insertRefData } = require("./db");
  const existing = await listRefData("deficit_preset");
  if (existing.length > 0) return;

  const legacy = await listRefData("syndrome_preset");
  if (legacy.length > 0) {
    for (let idx = 0; idx < legacy.length; idx++) {
      const item = legacy[idx];
      const v = String(item.value || "").trim();
      if (!v) continue;
      const payload = { id: `legacy-${idx + 1}`, label: v, markerRegex: v, markerRegexFlags: "i", triggerMode: "auto", priority: Math.max(1, 100 - idx) };
      await insertRefData("deficit_preset", JSON.stringify(payload), idx);
    }
    console.log("[setup] Сконвертированы legacy syndrome_preset -> deficit_preset");
    return;
  }

  for (let idx = 0; idx < DEFAULT_DEFICIT_PRESETS.length; idx++) {
    await insertRefData("deficit_preset", JSON.stringify(DEFAULT_DEFICIT_PRESETS[idx]), idx);
  }
  console.log("[setup] Созданы дефолтные пресеты дефицитов");
};

module.exports = { initDefaultAdmin, initDefaultRoles, initDefaultDeficitPresets };
