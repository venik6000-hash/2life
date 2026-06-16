const express = require("express");
const router = express.Router();
const { requireAuth, requireSectionRead, requireSectionWrite } = require("../middleware/auth");
const { canAccessClient } = require("../services/clientAccess");
const { METRIC_KEYS } = require("../services/waveMath");
const store = require("../services/waveStore");
const { sendPushToUsers } = require("../services/messengerPush");
const { sendTo } = require("../services/ws");

const todayIso = () => { const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };
const guard = async (req, res) => {
  if (!(await canAccessClient(req.user, req.params.clientId))) { res.status(403).json({ error: "Нет доступа к этому клиенту" }); return false; }
  return true;
};

router.get("/clients/:clientId/wave/today", requireAuth(), requireSectionRead("wave"), async (req, res) => {
  try { if (!(await guard(req, res))) return;
    const today = todayIso();
    res.json({ ok: true, date: today, metrics: METRIC_KEYS, checkin: await store.getCheckin(req.params.clientId, today) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Внутренняя ошибка сервера" }); }
});

router.get("/clients/:clientId/wave/series", requireAuth(), requireSectionRead("wave"), async (req, res) => {
  try { if (!(await guard(req, res))) return;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || "") ? req.query.to : todayIso();
    let from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || "") ? req.query.from : null;
    if (!from) { const d = new Date(to); d.setDate(d.getDate() - 90); from = d.toISOString().slice(0, 10); }
    const [series, reactions] = await Promise.all([store.getSeries(req.params.clientId, from, to), store.listReactions(req.params.clientId)]);
    res.json({ ok: true, from, to, series, reactions });
  } catch (e) { console.error(e); res.status(500).json({ error: "Внутренняя ошибка сервера" }); }
});

router.post("/clients/:clientId/wave/checkin", requireAuth(), requireSectionWrite("wave"), async (req, res) => {
  try { if (!(await guard(req, res))) return;
    const { scores, contextTags, weight, restingHr, note } = req.body || {};
    const checkin = await store.upsertCheckin({ clientId: req.params.clientId, userId: req.user.id, date: todayIso(), scores, contextTags, weight, restingHr, note });
    res.json({ ok: true, checkin });
  } catch (e) { console.error(e); res.status(400).json({ error: e.message || "Некорректный чек-ин" }); }
});

router.get("/wave/flags", requireAuth(), async (req, res) => {
  try { res.json({ ok: true, flags: await store.listOpenFlagsForUser(req.user) }); }
  catch (e) { console.error(e); res.status(500).json({ error: "Внутренняя ошибка сервера" }); }
});

router.post("/clients/:clientId/wave/reaction", requireAuth(), requireSectionWrite("wave"), async (req, res) => {
  try { if (!(await guard(req, res))) return;
    const { pinnedDate, kind, text } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pinnedDate || "")) return res.status(400).json({ error: "Некорректная дата" });
    const safeText = String(text || "").slice(0, 2000);
    const reaction = await store.addReaction({ clientId: req.params.clientId, authorUserId: req.user.id, pinnedDate, kind, text: safeText });
    const clientUserIds = await store.listClientUserIdsForClient(req.params.clientId);
    if (clientUserIds.length) {
      sendPushToUsers({ userIds: clientUserIds, title: "2life", body: "Ваш врач отметил вашу волну", url: `/?cid=${encodeURIComponent(req.params.clientId)}&sec=wave` }).catch(() => {});
      for (const uid of clientUserIds) sendTo(uid, { type: "wave_reaction", clientId: req.params.clientId, reaction });
    }
    res.json({ ok: true, reaction });
  } catch (e) { console.error(e); res.status(400).json({ error: e.message || "Не удалось сохранить" }); }
});

module.exports = router;
