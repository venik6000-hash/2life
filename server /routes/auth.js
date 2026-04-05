const express  = require("express");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const router   = express.Router();

const { getUser, listUsers, createUser, updatePass, setActive, setAllClientsAccess, pool } = require("../services/db");
const { requireAuth, JWT_SECRET, TOKEN_TTL } = require("../middleware/auth");
const { getPermissionsForRole } = require("../services/permissions");

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Введите логин и пароль" });
    }
    const user = await getUser(String(username).trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );
    const permissions = await getPermissionsForRole(user.role);
    res.json({
      ok: true,
      token,
      user: { id: user.id, username: user.username, role: user.role, all_clients_access: !!user.all_clients_access },
      permissions
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/me — кто я
router.get("/auth/me", requireAuth(), async (req, res) => {
  try {
    const userRes = await pool.query(
      "SELECT id, username, role, all_clients_access FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );
    const currentUser = userRes.rows[0]
      ? { ...req.user, all_clients_access: !!userRes.rows[0].all_clients_access, username: userRes.rows[0].username, role: userRes.rows[0].role }
      : req.user;
    const permissions = await getPermissionsForRole(currentUser.role);
    res.json({ ok: true, user: currentUser, permissions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/change-password — смена своего пароля
router.post("/auth/change-password", requireAuth(), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Укажите текущий и новый пароль" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: "Новый пароль должен быть не короче 6 символов" });
    }
    const r = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = r.rows[0] ?? null;
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: "Неверный текущий пароль" });
    }
    await updatePass(bcrypt.hashSync(newPassword, 10), req.user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----- Admin: управление пользователями -----

// GET /api/admin/users
router.get("/admin/users", requireAuth("admin"), async (req, res) => {
  try {
    const users = await listUsers();
    res.json({ ok: true, users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/users — создать пользователя
router.post("/admin/users", requireAuth("admin"), async (req, res) => {
  try {
    const { username, password, role = "doctor" } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Введите логин и пароль" });
    }
    const validRolesRes = await pool.query("SELECT name FROM roles");
    const validRoles = validRolesRes.rows.map(r => r.name);
    const allValidRoles = validRoles.length > 0 ? validRoles : ["admin", "doctor", "nutritionist", "viewer"];
    if (!allValidRoles.includes(role)) {
      return res.status(400).json({ error: `Недопустимая роль. Допустимые: ${allValidRoles.join(", ")}` });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "Пароль должен быть не короче 6 символов" });
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = await createUser(String(username).trim().toLowerCase(), hash, role);
    res.json({ ok: true, id: result.id, username, role });
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Пользователь с таким логином уже существует" });
    }
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/users/:id — смена пароля / роли / активности / доступа ко всем клиентам
router.patch("/admin/users/:id", requireAuth("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { password, role, active, all_clients_access } = req.body || {};

    if (password != null) {
      if (String(password).length < 6) {
        return res.status(400).json({ error: "Пароль должен быть не короче 6 символов" });
      }
      await updatePass(bcrypt.hashSync(password, 10), id);
    }
    if (role != null) {
      const validRolesRes = await pool.query("SELECT name FROM roles");
      const validRoles = validRolesRes.rows.map(r => r.name);
      const allValidRoles = validRoles.length > 0 ? validRoles : ["admin", "doctor", "nutritionist", "viewer"];
      if (!allValidRoles.includes(role)) {
        return res.status(400).json({ error: "Недопустимая роль" });
      }
      await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, id]);
    }
    if (active != null) {
      await setActive(active ? true : false, id);
    }
    if (all_clients_access != null) {
      await setAllClientsAccess(all_clients_access ? true : false, id);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/users/:id — удаление пользователя
router.delete("/admin/users/:id", requireAuth("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Некорректный id пользователя" });
    }
    if (id === req.user.id) {
      return res.status(400).json({ error: "Нельзя удалить себя" });
    }

    await client.query("BEGIN");
    const targetRes = await client.query("SELECT id, role, active FROM users WHERE id = $1", [id]);
    const target = targetRes.rows[0] || null;
    if (!target) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    if (target.role === "admin" && target.active) {
      const activeAdminsLeftRes = await client.query(
        "SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND active = true AND id <> $1",
        [id]
      );
      const activeAdminsLeft = Number(activeAdminsLeftRes.rows[0]?.n || 0);
      if (activeAdminsLeft < 1) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Нельзя удалить последнего активного администратора" });
      }
    }

    await client.query("DELETE FROM users WHERE id = $1", [id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
