const express = require("express");
const router = express.Router();
const { requireAuth, requireSectionRead, requireSectionWrite } = require("../middleware/auth");
const { canAccessClient } = require("../services/clientAccess");
const { encryptText, decryptText } = require("../services/messengerCrypto");
const whoop = require("../services/whoopClient");
const store = require("../services/whoopStore");
const { sendPushToUsers } = require("../services/messengerPush");
const { sendTo } = require("../services/ws");
const { wasJournalNotificationDelivered, recordJournalNotificationDelivery } = require("../services/journalStore");

const CLIENT_ID = process.env.WHOOP_CLIENT_ID || "";
const CLIENT_SECRET = process.env.WHOOP_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.WHOOP_REDIRECT_URI || "";
const todayIso = () => new Date().toISOString().slice(0, 10);

// state = encrypted {clientId,userId,ts}; integrity-protected by AES-GCM, expires in 10 min.
const makeState = (clientId, userId) => encryptText(JSON.stringify({ clientId, userId, ts: Date.now() }));
const readState = (state) => { try { const s = JSON.parse(decryptText(state)); return Date.now() - s.ts < 600000 ? s : null; } catch { return null; } };

router.get("/wave/whoop/status", requireAuth(), requireSectionRead("wave"), async (req, res) => {
  try {
    const clientId = String(req.query.cid || "");
    if (!clientId) return res.status(400).json({ error: "Не указан клиент" });
    if (!(await canAccessClient(req.user, clientId))) return res.status(403).json({ error: "Нет доступа" });
    const conn = await store.getConnectionByClient(clientId);
    res.json({ ok: true, connected: !!(conn && conn.status === "active") });
  } catch (e) { console.error(e); res.status(500).json({ error: "Внутренняя ошибка сервера" }); }
});

router.get("/wave/whoop/connect", requireAuth(), requireSectionWrite("wave"), async (req, res) => {
  try {
    const clientId = String(req.query.cid || "");
    if (!clientId) return res.status(400).json({ error: "Не указан клиент" });
    if (!CLIENT_ID || !REDIRECT_URI) return res.status(500).json({ error: "WHOOP не сконфигурирован" });
    if (!(await canAccessClient(req.user, clientId))) return res.status(403).json({ error: "Нет доступа" });
    res.redirect(whoop.buildAuthorizeUrl({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, state: makeState(clientId, req.user.id) }));
  } catch (e) { console.error(e); res.status(500).json({ error: "Внутренняя ошибка сервера" }); }
});

router.get("/wave/whoop/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const st = readState(String(state || ""));
    if (!code || !st) return res.status(400).send("Ссылка устарела. Попробуйте подключить WHOOP заново.");
    const tok = await whoop.exchangeCode({ code: String(code), redirectUri: REDIRECT_URI, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    let providerUserId = null;
    try { const prof = await whoop.getJson("/v2/user/profile/basic", tok.access_token); providerUserId = String(prof.user_id ?? prof.id ?? ""); } catch { /* profile path may differ; provider_user_id also learned from webhook */ }
    await store.upsertConnection({ clientId: st.clientId, userId: st.userId, providerUserId,
      accessToken: tok.access_token, refreshToken: tok.refresh_token, expiresIn: tok.expires_in, scopes: String(tok.scope || "").split(" ").filter(Boolean) });
    const conn = await store.getConnectionByClient(st.clientId);
    store.syncConnection(conn, { days: 30 }).then(() => store.scanObjectiveInflections(st.clientId, todayIso())).catch((e) => console.warn("[whoop] backfill failed", e?.message || e));
    res.redirect(`/?cid=${encodeURIComponent(st.clientId)}&sec=wave&whoop=connected`);
  } catch (e) { console.error(e); res.status(500).send("Не удалось подключить WHOOP."); }
});

// Public endpoint — authenticated by signature, NOT by session.
router.post("/wave/whoop/webhook", async (req, res) => {
  try {
    const ok = whoop.verifyWebhookSignature({ timestamp: req.get("X-WHOOP-Signature-Timestamp"), rawBody: req.rawBody, signature: req.get("X-WHOOP-Signature"), secret: CLIENT_SECRET });
    if (!ok) return res.status(401).end();
    const tsMs = Number(req.get("X-WHOOP-Signature-Timestamp") || 0);
    if (!tsMs || Math.abs(Date.now() - tsMs) > 300000) return res.status(401).end(); // reject replays / stale (>5 min)
    res.status(200).end(); // ack fast; process async
    const evt = req.body || {};
    if (!/^(recovery|sleep|workout)\./.test(String(evt.type || ""))) return;
    const conn = await store.getConnectionByProviderUserId(evt.user_id);
    if (!conn) return;
    await store.syncConnection(conn, { days: 3 });
    await store.scanObjectiveInflections(conn.clientId, todayIso());
    const key = todayIso();
    if (!(await wasJournalNotificationDelivered({ userId: conn.userId, kind: "wave_whoop_update", deliveryKey: key }))) {
      await sendPushToUsers({ userIds: [conn.userId], title: "2life", body: "🌊 Твоя волна обновилась", url: `/?cid=${encodeURIComponent(conn.clientId)}&sec=wave` });
      await recordJournalNotificationDelivery({ userId: conn.userId, kind: "wave_whoop_update", deliveryKey: key });
    }
    sendTo(conn.userId, { type: "wave_updated", clientId: conn.clientId });
  } catch (e) { console.error("[whoop] webhook", e?.message || e); }
});

router.post("/wave/whoop/disconnect", requireAuth(), requireSectionWrite("wave"), async (req, res) => {
  try {
    const clientId = String(req.body?.cid || "");
    if (!clientId) return res.status(400).json({ error: "Не указан клиент" });
    if (!(await canAccessClient(req.user, clientId))) return res.status(403).json({ error: "Нет доступа" });
    await store.deleteConnection(clientId);
    if (req.body?.purge) await store.purgeObjective(clientId);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Внутренняя ошибка сервера" }); }
});

module.exports = router;
