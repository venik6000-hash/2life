const express    = require("express");
const bcrypt     = require("bcryptjs");
const rateLimit  = require("express-rate-limit");
const router     = express.Router();
const { ipKeyGenerator } = rateLimit;

const { getUser, listUsers, createUser, pool } = require("../services/db");
const { syncUserChatAccessByClientPermissions } = require("../services/chatAccessSync");
const { notifyUserChatAccessChanges } = require("../services/messengerAccessNotifications");
const { isClientRoleName } = require("../services/roleFlags");
const { broadcast: sseBroadcast, closeConnectionsForUser: sseCloseUser, closeConnectionsForJti: sseCloseJti } = require("../services/sse");
const { requireAuth, signToken }   = require("../middleware/auth");
const { blacklistToken }           = require("../services/tokenBlacklist");
const { getPermissionsForRole }    = require("../services/permissions");
const {
  decryptPrivateKeyFromRecovery,
  decryptPrivateKeyFromPassword,
  wrapPrivateKeyForPassword
} = require("../services/messengerRecovery");

const BCRYPT_ROUNDS = 12;
const DUMMY_PASSWORD_HASH = "$2b$12$UjzCKeGbFa7WOf2CBjl/7uN8oNqaBKN9O.n/EflPUKZsYtV97JS1C";
const MAX_USERNAME_LENGTH = 160;
const MAX_PASSWORD_LENGTH = 1024;
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

const ensureCanDemoteAdmin = async (db, targetId, nextRole, nextActive) => {
  await db.query("SELECT pg_advisory_xact_lock(221948731)");
  const targetRes = await db.query("SELECT id, role, active FROM users WHERE id = $1 FOR UPDATE", [targetId]);
  const target = targetRes.rows[0] || null;
  if (!target) return { ok: false, status: 404, error: "Пользователь не найден" };

  const willRemainAdmin = nextRole == null ? target.role === "admin" : nextRole === "admin";
  const willRemainActive = nextActive == null ? !!target.active : !!nextActive;
  const removesActiveAdmin = target.role === "admin" && target.active && (!willRemainAdmin || !willRemainActive);
  if (!removesActiveAdmin) return { ok: true, target };

  const activeAdminsLeftRes = await db.query(
    "SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND active = true AND id <> $1",
    [targetId]
  );
  const activeAdminsLeft = Number(activeAdminsLeftRes.rows[0]?.n || 0);
  if (activeAdminsLeft < 1) {
    return { ok: false, status: 400, error: "Нельзя убрать последнего активного администратора" };
  }
  return { ok: true, target };
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

// Coarse per-IP cap layered on top of the per-username limiter above: the latter
// only throttles 5/min *per username*, so an attacker rotating usernames from one
// IP (credential stuffing) would otherwise get 5 free attempts per account with no
// aggregate ceiling. This bounds total login attempts per IP across all usernames.
const loginIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток входа. Попробуйте через минуту." },
  keyGenerator: (req) => ipKeyGenerator(req.ip),
});

// POST /api/auth/login
router.post("/auth/login", loginIpLimiter, loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (
      typeof username !== "string"
      || typeof password !== "string"
      || !username.trim()
      || !password
      || username.length > MAX_USERNAME_LENGTH
      || password.length > MAX_PASSWORD_LENGTH
    ) {
      return res.status(400).json({ error: "Введите логин и пароль" });
    }
    const user = await getUser(username.trim().toLowerCase());
    const passwordOk = await bcrypt.compare(password, user?.password_hash || DUMMY_PASSWORD_HASH);
    if (!user || !passwordOk) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    const token = signToken({ id: user.id, username: user.username, role: user.role, token_version: Number(user.token_version || 0) });
    const permissions = await getPermissionsForRole(user.role);
    res.json({
      ok: true,
      token,
      user: { id: user.id, username: user.username, role: user.role, all_clients_access: !!user.all_clients_access, display_name: user.display_name || "", is_client: permissions?.isClient === true },
      permissions,
    });
  } catch (e) {
    console.error("[auth] login error:", e);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// POST /api/auth/logout — серверная инвалидация токена
router.post("/auth/logout", requireAuth(), async (req, res) => {
  try {
    if (req.user?.jti) {
      try {
        await blacklistToken(req.user.jti, req.user.exp);
      } catch (e) {
        // blacklistToken records the jti in-memory BEFORE its DB write, so
        // same-process revocation already took effect; the persisted row is
        // best-effort (cross-process/restart). A DB blip must not fail the
        // logout or skip tearing down the user's live WS/SSE sessions.
        console.error("[auth] logout persistence error (in-memory revocation applied):", e);
      }
      try { require("../services/ws").forceLogoutJti(req.user.jti); } catch (_) {}
      try { sseCloseJti(req.user.jti); } catch (_) {}
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("[auth] logout revocation error:", e);
    res.status(500).json({ error: "Не удалось отозвать сессию" });
  }
});

// GET /api/auth/me — кто я
router.get("/auth/me", requireAuth(), async (req, res) => {
  try {
    const userRes = await pool.query(
      "SELECT id, username, role, all_clients_access, display_name, token_version FROM users WHERE id = $1 AND active = true LIMIT 1",
      [req.user.id]
    );
    const row = userRes.rows[0] || null;
    if (!row) return res.status(401).json({ error: "Пользователь отключён или удалён" });
    const currentUser = {
      ...req.user,
      all_clients_access: !!row.all_clients_access,
      username: row.username,
      role: row.role,
      display_name: row.display_name || "",
      token_version: Number(row.token_version || 0),
    };
    const permissions = await getPermissionsForRole(currentUser.role);
    currentUser.is_client = permissions?.isClient === true;
    res.json({ ok: true, user: currentUser, permissions });
  } catch (e) {
    console.error("[auth] /me error:", e);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// PATCH /api/auth/me — self-update display_name (only)
router.patch("/auth/me", requireAuth(), async (req, res) => {
  try {
    const raw = req.body?.displayName;
    if (typeof raw !== "string") return res.status(400).json({ error: "displayName обязателен" });
    const next = raw.trim().slice(0, 80);
    await pool.query("UPDATE users SET display_name = $1 WHERE id = $2", [next, req.user.id]);
    res.json({ ok: true, displayName: next });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
  const deviceId = (req.headers["x-messenger-device-id"] && String(req.headers["x-messenger-device-id"]).slice(0, 160))
    || (req.body && typeof req.body.deviceId === "string" ? req.body.deviceId.slice(0, 160) : null);
  const ticket = createWsTicket(req.user, deviceId);
  res.json({ ok: true, ticket });
});

// POST /api/auth/change-password — смена своего пароля
router.post("/auth/change-password", requireAuth(), async (req, res) => {
  const client = await pool.connect();
  try {
    const { currentPassword, newPassword, messengerKeys, forceResetMessenger } = req.body || {};
    const safeCurrentPassword = hasText(currentPassword) ? String(currentPassword) : null;
    if (!newPassword) {
      return res.status(400).json({ error: "Укажите новый пароль" });
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
    let messengerReset = !!forceResetMessenger;
    const userRes = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
    const user = userRes.rows[0] ?? null;
    if (!user) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    if (req.user.role !== "admin" && safeCurrentPassword == null) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Укажите текущий пароль" });
    }

    if (safeCurrentPassword != null) {
      const passwordOk = await bcrypt.compare(safeCurrentPassword, user.password_hash);
      if (!passwordOk) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Неверный текущий пароль" });
      }
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

    await client.query("UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2", [
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
        if (safeCurrentPassword != null) {
          try {
            await rewrapMessengerFromCurrentPassword(client, keyRow, req.user.id, safeCurrentPassword, newPassword);
          } catch (_) {
            await client.query("ROLLBACK");
            return res.status(409).json({
              error: "Не удалось синхронизировать ключи мессенджера. Выполните повторный вход и повторите смену пароля."
            });
          }
        } else {
          await resetMessengerCredentials(client, req.user.id);
          messengerReset = true;
        }
      }
    }

    const nextUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      all_clients_access: !!user.all_clients_access,
      display_name: user.display_name || "",
    };
    const permissions = await getPermissionsForRole(nextUser.role);
    nextUser.is_client = permissions?.isClient === true;
    const nextToken = signToken({ id: nextUser.id, username: nextUser.username, role: nextUser.role, token_version: Number(user.token_version || 0) + 1 });
    await client.query("COMMIT");
    if (req.user?.jti) {
      blacklistToken(req.user.jti, req.user.exp).catch((e) => {
        console.error("[auth] password-change token persistence error:", e);
      });
    }
    try { require("../services/ws").forceLogoutUser(req.user.id, "password_changed"); } catch (_) {}
    try { sseCloseUser(req.user.id); } catch (_) {}
    res.json({ ok: true, messengerReset, token: nextToken, user: nextUser, permissions });
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
  let committed = false;
  try {
    const id = Number(req.params.id);
    const { password, role, active, all_clients_access, display_name } = req.body || {};
    let shouldSyncChatAccess = false;
    let syncResult = null;
    let forceLogoutReason = null;
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Некорректный id пользователя" });
    }

    await client.query("BEGIN");

    const adminGuard = await ensureCanDemoteAdmin(
      client,
      id,
      role == null ? null : role,
      active == null ? null : !!active
    );
    if (!adminGuard.ok) {
      await client.query("ROLLBACK");
      return res.status(adminGuard.status).json({ error: adminGuard.error });
    }

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

      await client.query("UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2", [
        await bcrypt.hash(password, BCRYPT_ROUNDS),
        id
      ]);
      forceLogoutReason = "password_reset";

      if (hasMessengerKey) {
        if (!hasRecoveryBundle(keyRow)) {
          await resetMessengerCredentials(client, id);
        } else {
          await rewrapMessengerFromRecovery(client, keyRow, id, password);
        }
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
      const newRoleIsClient = await isClientRoleName(role);
      // Switching a user onto a client role must not let them inherit
      // all-clients access from their staff days.
      await client.query(
        "UPDATE users SET role = $1, all_clients_access = CASE WHEN $3 THEN false ELSE all_clients_access END WHERE id = $2",
        [role, id, newRoleIsClient]
      );
      shouldSyncChatAccess = true;
      forceLogoutReason = "role_changed";
    }
    if (active != null) {
      if (active) {
        await client.query("UPDATE users SET active = true WHERE id = $1", [id]);
      } else {
        await client.query("UPDATE users SET active = false, token_version = token_version + 1 WHERE id = $1", [id]);
      }
      shouldSyncChatAccess = true;
      if (!active) forceLogoutReason = "user_inactive";
    }
    if (all_clients_access != null) {
      if (all_clients_access) {
        const effRoleRow = await client.query("SELECT role FROM users WHERE id = $1", [id]);
        const effectiveRole = role != null ? role : effRoleRow.rows[0]?.role;
        if (await isClientRoleName(effectiveRole)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: "Клиентской роли нельзя выдать доступ ко всем клиентам",
            code: "CLIENT_ROLE_RESTRICTED",
          });
        }
      }
      await client.query("UPDATE users SET all_clients_access = $1 WHERE id = $2", [all_clients_access ? true : false, id]);
      shouldSyncChatAccess = true;
    }
    if (display_name != null) {
      await client.query("UPDATE users SET display_name = $1 WHERE id = $2", [String(display_name).trim(), id]);
    }

    if (shouldSyncChatAccess) {
      syncResult = await syncUserChatAccessByClientPermissions(client, id);
    }

    await client.query("COMMIT");
    committed = true;
    if (forceLogoutReason) {
      try { require("../services/ws").forceLogoutUser(id, forceLogoutReason); } catch (_) {}
      // Tear down the user's open SSE stream too: a role downgrade or deactivation
      // must stop live client-update events immediately, not after the token TTL.
      // The client's EventSource auto-reconnects and re-authorizes under the new role.
      try { sseCloseUser(id); } catch (_) {}
    }
    if (shouldSyncChatAccess) {
      // Live revocation: open tabs of this user re-read their permissions.
      try { sseBroadcast("permissions-updated", { userId: id }); } catch (_) {}
    }
    try {
      await notifyUserChatAccessChanges(pool, id, syncResult);
    } catch (e) {
      console.error("[auth] post-commit access notification error:", e);
    }
    res.json({ ok: true });
  } catch (e) {
    if (!committed) {
      try { await client.query("ROLLBACK"); } catch (_) {}
    }
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
    const adminGuard = await ensureCanDemoteAdmin(client, id, null, false);
    if (!adminGuard.ok) {
      await client.query("ROLLBACK");
      return res.status(adminGuard.status).json({ error: adminGuard.error });
    }
    await client.query("UPDATE users SET active = false, token_version = token_version + 1 WHERE id = $1", [id]);
    const syncResult = await syncUserChatAccessByClientPermissions(client, id);
    await client.query("COMMIT");
    try { require("../services/ws").forceLogoutUser(id, "user_inactive"); } catch (_) {}
    try { sseCloseUser(id); } catch (_) {}
    try { sseBroadcast("permissions-updated", { userId: id }); } catch (_) {}
    try {
      await notifyUserChatAccessChanges(pool, id, syncResult);
    } catch (e) {
      console.error("[auth] post-commit delete notification error:", e);
    }
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
