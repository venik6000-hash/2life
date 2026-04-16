const express    = require("express");
const bcrypt     = require("bcryptjs");
const rateLimit  = require("express-rate-limit");
const router     = express.Router();
const { ipKeyGenerator } = rateLimit;

const { getUser, listUsers, createUser, pool } = require("../services/db");
const { requireAuth, signToken }   = require("../middleware/auth");
const { blacklistToken }           = require("../services/tokenBlacklist");
const { getPermissionsForRole }    = require("../services/permissions");
const {
  decryptPrivateKeyFromRecovery,
  decryptPrivateKeyFromPassword,
  wrapPrivateKeyForPassword
} = require("../services/messengerRecovery");

const BCRYPT_ROUNDS = 12;
const hasText = (value) => String(value || "").trim() !== "";
const hasMessengerBundle = (row) => (
  !!row &&
  hasText(row.encrypted_private_key_jwk) &&
  hasText(row.key_derivation_salt) &&
  hasText(row.key_derivation_iv)
);
const hasRecoveryBundle = (row) => (
  !!row &&
  hasText(row.recovery_encrypted_private_key_jwk) &&
  hasText(row.recovery_key_iv)
);

const resetMessengerCredentials = async (db, userId) => {
  await db.query(
    `UPDATE user_public_keys
     SET public_key_jwk = '',
         encrypted_private_key_jwk = '',
         key_derivation_salt = '',
         key_derivation_iv = ''
     WHERE user_id = $1`,
    [userId]
  );
  await db.query("UPDATE chat_participants SET encrypted_chat_key = '' WHERE user_id = $1", [userId]);
};

const rewrapMessengerFromRecovery = async (db, keyRow, userId, nextPassword) => {
  const privateKeyJwk = decryptPrivateKeyFromRecovery(
    keyRow.recovery_encrypted_private_key_jwk,
    keyRow.recovery_key_iv
  );
  const rewrapped = wrapPrivateKeyForPassword(privateKeyJwk, nextPassword);
  await db.query(
    `UPDATE user_public_keys
     SET encrypted_private_key_jwk = $1,
         key_derivation_salt = $2,
         key_derivation_iv = $3
     WHERE user_id = $4`,
    [rewrapped.encryptedPrivateKeyJwk, rewrapped.keyDerivationSalt, rewrapped.keyDerivationIv, userId]
  );
};

const rewrapMessengerFromCurrentPassword = async (db, keyRow, userId, currentPassword, nextPassword) => {
  const privateKeyJwk = decryptPrivateKeyFromPassword(
    keyRow.encrypted_private_key_jwk,
    keyRow.key_derivation_salt,
    keyRow.key_derivation_iv,
    currentPassword
  );
  const rewrapped = wrapPrivateKeyForPassword(privateKeyJwk, nextPassword);
  await db.query(
    `UPDATE user_public_keys
     SET encrypted_private_key_jwk = $1,
         key_derivation_salt = $2,
         key_derivation_iv = $3
     WHERE user_id = $4`,
    [rewrapped.encryptedPrivateKeyJwk, rewrapped.keyDerivationSalt, rewrapped.keyDerivationIv, userId]
  );
};

// Rate limiter: макс. 5 попыток входа в минуту с одного IP+логина
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток входа. Попробуйте через минуту." },
  keyGenerator: (req) => {
    const username = String(req.body?.username || "").toLowerCase().trim();
    return `${ipKeyGenerator(req.ip)}:${username}`;
  },
});

// POST /api/auth/login
router.post("/auth/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Введите логин и пароль" });
    }
    const user = await getUser(String(username).trim().toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    const token = signToken({ id: user.id, username: user.username, role: user.role });
    const permissions = await getPermissionsForRole(user.role);
    res.json({
      ok: true,
      token,
      user: { id: user.id, username: user.username, role: user.role, all_clients_access: !!user.all_clients_access },
      permissions,
    });
  } catch (e) {
    console.error("[auth] login error:", e);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// POST /api/auth/logout — серверная инвалидация токена
router.post("/auth/logout", requireAuth(), (req, res) => {
  if (req.user?.jti) blacklistToken(req.user.jti);
  res.json({ ok: true });
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
    console.error("[auth] /me error:", e);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// POST /api/auth/sse-ticket — одноразовый тикет для SSE-соединения (30 сек TTL)
router.post("/auth/sse-ticket", requireAuth(), (req, res) => {
  const { createTicket } = require("../services/sseTickets");
  const ticket = createTicket(req.user);
  res.json({ ok: true, ticket });
});

// POST /api/auth/ws-ticket — одноразовый тикет для WebSocket-соединения (30 сек TTL)
router.post("/auth/ws-ticket", requireAuth(), (req, res) => {
  const { createWsTicket } = require("../services/wsTickets");
  const ticket = createWsTicket(req.user);
  res.json({ ok: true, ticket });
});

// POST /api/auth/change-password — смена своего пароля
router.post("/auth/change-password", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const { currentPassword, newPassword, messengerKeys, forceResetMessenger } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Укажите текущий и новый пароль" });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: "Новый пароль должен быть не короче 8 символов" });
    }
    if (messengerKeys != null && forceResetMessenger) {
      return res.status(400).json({ error: "Используйте только один режим: обновление ключей или сброс мессенджера" });
    }

    if (messengerKeys != null) {
      const { encryptedPrivateKeyJwk, keyDerivationSalt, keyDerivationIv } = messengerKeys || {};
      if (!encryptedPrivateKeyJwk || !keyDerivationSalt || !keyDerivationIv) {
        return res.status(400).json({ error: "Для мессенджера передайте полный набор ключей" });
      }
    }

    await client.query("BEGIN");
    const userRes = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
    const user = userRes.rows[0] ?? null;
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      await client.query("ROLLBACK");
      return res.status(401).json({ error: "Неверный текущий пароль" });
    }

    const keyRes = await client.query(
      `SELECT public_key_jwk, encrypted_private_key_jwk, key_derivation_salt, key_derivation_iv,
              recovery_encrypted_private_key_jwk, recovery_key_iv
       FROM user_public_keys
       WHERE user_id = $1
       FOR UPDATE`,
      [req.user.id]
    );
    const keyRow = keyRes.rows[0] ?? null;
    const hasMessengerKey = hasMessengerBundle(keyRow);

    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
      req.user.id
    ]);

    if (messengerKeys != null) {
      const { encryptedPrivateKeyJwk, keyDerivationSalt, keyDerivationIv } = messengerKeys;
      const upd = await client.query(
        `UPDATE user_public_keys
         SET encrypted_private_key_jwk = $1,
             key_derivation_salt = $2,
             key_derivation_iv = $3
         WHERE user_id = $4`,
        [encryptedPrivateKeyJwk, keyDerivationSalt, keyDerivationIv, req.user.id]
      );
      if (upd.rowCount < 1) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Ключи мессенджера не инициализированы" });
      }
    } else if (forceResetMessenger) {
      await resetMessengerCredentials(client, req.user.id);
    } else if (hasMessengerKey) {
      if (hasRecoveryBundle(keyRow)) {
        await rewrapMessengerFromRecovery(client, keyRow, req.user.id, newPassword);
      } else {
        try {
          await rewrapMessengerFromCurrentPassword(client, keyRow, req.user.id, currentPassword, newPassword);
        } catch (_) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "Не удалось синхронизировать ключи мессенджера. Выполните повторный вход и повторите смену пароля."
          });
        }
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true, messengerReset: !!forceResetMessenger });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("[auth] change-password error:", e);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  } finally {
    client.release();
  }
});

// ----- Admin: управление пользователями -----

// GET /api/admin/users
router.get("/admin/users", requireAuth("admin"), async (_req, res) => {
  try {
    const users = await listUsers();
    res.json({ ok: true, users });
  } catch (e) {
    console.error("[auth] list users error:", e);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
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
    const allValidRoles = validRoles.length > 0 ? validRoles : ["admin", "doctor", "nutritionist", "viewer", "client"];
    if (!allValidRoles.includes(role)) {
      return res.status(400).json({ error: `Недопустимая роль. Допустимые: ${allValidRoles.join(", ")}` });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: "Пароль должен быть не короче 8 символов" });
    }
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await createUser(String(username).trim().toLowerCase(), hash, role);
    res.json({ ok: true, id: result.id, username, role });
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Пользователь с таким логином уже существует" });
    }
    console.error("[auth] create user error:", e);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// PATCH /api/admin/users/:id — смена пароля / роли / активности / доступа ко всем клиентам
router.patch("/admin/users/:id", requireAuth("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const { password, role, active, all_clients_access } = req.body || {};
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Некорректный id пользователя" });
    }

    await client.query("BEGIN");

    if (password != null) {
      if (String(password).length < 8) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Пароль должен быть не короче 8 символов" });
      }

      if (id === req.user.id) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Для своего аккаунта используйте смену пароля через /api/auth/change-password"
        });
      }

      const keyRes = await client.query(
        `SELECT public_key_jwk, encrypted_private_key_jwk, key_derivation_salt, key_derivation_iv,
                recovery_encrypted_private_key_jwk, recovery_key_iv
         FROM user_public_keys
         WHERE user_id = $1
         FOR UPDATE`,
        [id]
      );
      const keyRow = keyRes.rows[0] ?? null;
      const hasMessengerKey = hasMessengerBundle(keyRow);

      await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        await bcrypt.hash(password, BCRYPT_ROUNDS),
        id
      ]);

      if (hasMessengerKey) {
        if (!hasRecoveryBundle(keyRow)) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "Нельзя безопасно синхронизировать мессенджер для этого пользователя: отсутствует recovery-ключ."
          });
        }
        await rewrapMessengerFromRecovery(client, keyRow, id, password);
      }
    }

    if (role != null) {
      const validRolesRes = await client.query("SELECT name FROM roles");
      const validRoles = validRolesRes.rows.map(r => r.name);
      const allValidRoles = validRoles.length > 0 ? validRoles : ["admin", "doctor", "nutritionist", "viewer", "client"];
      if (!allValidRoles.includes(role)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Недопустимая роль" });
      }
      await client.query("UPDATE users SET role = $1 WHERE id = $2", [role, id]);
    }
    if (active != null) {
      await client.query("UPDATE users SET active = $1 WHERE id = $2", [active ? true : false, id]);
    }
    if (all_clients_access != null) {
      await client.query("UPDATE users SET all_clients_access = $1 WHERE id = $2", [all_clients_access ? true : false, id]);
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("[auth] patch user error:", e);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  } finally {
    client.release();
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
    console.error("[auth] delete user error:", e);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  } finally {
    client.release();
  }
});

module.exports = router;
