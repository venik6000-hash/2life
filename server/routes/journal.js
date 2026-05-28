const express = require("express");
const router = express.Router();
const { requireAuth, requireSectionRead, requireSectionWrite } = require("../middleware/auth");
const { pool } = require("../services/db");
const {
  listJournalItems,
  createJournalItem,
  getJournalItemById,
  updateJournalItem,
  softDeleteJournalItem,
  createJournalComment,
  countJournalBadgesForUser,
} = require("../services/journalStore");
const { canAccessClient } = require("../services/clientAccess");

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

async function assertClientAccess(req, res) {
  if (await canAccessClient(req.user, req.params.clientId)) return true;
  res.status(403).json({ error: "Нет доступа к этому клиенту" });
  return false;
}

async function assertItemBelongsToClient(req, res) {
  const item = await getJournalItemById(Number(req.params.itemId));
  if (!item) {
    res.status(404).json({ error: "Запись журнала не найдена" });
    return null;
  }
  if (String(item.clientId) !== req.params.clientId) {
    res.status(404).json({ error: "Запись журнала не найдена" });
    return null;
  }
  return item;
}

router.get("/clients/:clientId/journal", requireAuth(), requireSectionRead("journal"), async (req, res) => {
  try {
    if (!(await assertClientAccess(req, res))) return;
    const items = await listJournalItems(req.params.clientId);
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

router.post("/clients/:clientId/journal/items", requireAuth(), requireSectionWrite("journal"), async (req, res) => {
  try {
    if (!(await assertClientAccess(req, res))) return;
    const item = await createJournalItem({ ...req.body, clientId: req.params.clientId, createdBy: req.user.id });
    res.json({ ok: true, item });
  } catch (e) {
    res.status(400).json({ error: e.message || "Некорректная запись журнала" });
  }
});

router.patch("/clients/:clientId/journal/items/:itemId", requireAuth(), requireSectionWrite("journal"), async (req, res) => {
  try {
    if (!(await assertClientAccess(req, res))) return;
    if (!(await assertItemBelongsToClient(req, res))) return;
    const item = await updateJournalItem(Number(req.params.itemId), req.body || {});
    res.json({ ok: true, item });
  } catch (e) {
    res.status(400).json({ error: e.message || "Некорректная запись журнала" });
  }
});

router.delete("/clients/:clientId/journal/items/:itemId", requireAuth(), requireSectionWrite("journal"), async (req, res) => {
  try {
    if (!(await assertClientAccess(req, res))) return;
    if (!(await assertItemBelongsToClient(req, res))) return;
    await softDeleteJournalItem(Number(req.params.itemId), { deletedBy: req.user.id, reason: req.body?.reason || "" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

router.post("/clients/:clientId/journal/items/:itemId/comments", requireAuth(), requireSectionWrite("journal"), async (req, res) => {
  try {
    if (!(await assertClientAccess(req, res))) return;
    if (!(await assertItemBelongsToClient(req, res))) return;
    const comment = await createJournalComment({ journalItemId: Number(req.params.itemId), authorUserId: req.user.id, body: req.body?.body });
    res.json({ ok: true, comment });
  } catch (e) {
    res.status(400).json({ error: e.message || "Некорректный комментарий" });
  }
});

router.get("/journal/badges", requireAuth(), requireSectionRead("journal"), async (req, res) => {
  try {
    const badges = await countJournalBadgesForUser({ userId: req.user.id, role: req.user.role, today: todayIso() });
    res.json({ ok: true, badges });
  } catch (e) {
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

module.exports = router;
