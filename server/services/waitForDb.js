const { pool } = require("./db");

// Resolves once SELECT 1 succeeds; retries with linear backoff. Throws after maxAttempts.
async function waitForDb({ maxAttempts = 30, delayMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      if (attempt > 1) console.log(`[startup] DB reachable after ${attempt} attempts`);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[startup] DB not ready (attempt ${attempt}/${maxAttempts}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`DB unreachable after ${maxAttempts} attempts: ${lastErr?.message}`);
}

module.exports = { waitForDb };
