// In-memory JWT blacklist for server-side logout.
// Entries auto-expire after TOKEN_TTL_MS so memory doesn't grow unboundedly.

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // должен совпадать с TOKEN_TTL в auth.js

/** @type {Map<string, NodeJS.Timeout>} jti -> таймер удаления */
const blacklist = new Map();

/**
 * Добавить jti (JWT ID) в чёрный список.
 * @param {string} jti
 */
const blacklistToken = (jti) => {
  if (blacklist.has(jti)) return;
  const timer = setTimeout(() => blacklist.delete(jti), TOKEN_TTL_MS);
  // Не блокируем выход Node.js из-за этого таймера
  if (timer.unref) timer.unref();
  blacklist.set(jti, timer);
};

/**
 * Проверить, отозван ли токен.
 * @param {string} jti
 * @returns {boolean}
 */
const isBlacklisted = (jti) => blacklist.has(jti);

module.exports = { blacklistToken, isBlacklisted };
