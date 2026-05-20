const express = require("express");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { v4: uuidv4 } = require("uuid");
const { requireAuth, requireSectionRead, requireSectionWrite } = require("../middleware/auth");
const {
  hasAllClientsAccess, getAssignmentsByUser,
  insertAnalyticsFile, getAnalyticsFilesByClient, getAnalyticsFileById,
  updateAnalyticsFile, deleteAnalyticsFile,
} = require("../services/db");
const { ensureDir } = require("../services/storage");

const router = express.Router();

const ANALYTICS_UPLOADS_DIR = path.join(__dirname, "../uploads/analytics");
ensureDir(ANALYTICS_UPLOADS_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ANALYTICS_UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Разрешены только PDF и изображения"));
    }
  },
});

const canAccessClient = async (user, clientId) => {
  if (user.role === "admin") return true;
  const all = await hasAllClientsAccess(user.id);
  if (all) return true;
  const assignments = await getAssignmentsByUser(user.id);
  return assignments.some((a) => a.client_id === clientId);
};

// GET /api/clients/:clientId/analytics-files
router.get("/clients/:clientId/analytics-files",
  requireAuth(), requireSectionRead("analytics"),
  async (req, res) => {
    try {
      const { clientId } = req.params;
      if (!(await canAccessClient(req.user, clientId))) {
        return res.status(403).json({ error: "Нет доступа" });
      }
      const files = await getAnalyticsFilesByClient(clientId);
      res.json(files);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// POST /api/clients/:clientId/analytics-files
router.post("/clients/:clientId/analytics-files",
  requireAuth(), requireSectionWrite("analytics"),
  upload.single("file"),
  async (req, res) => {
    try {
      const { clientId } = req.params;
      if (!(await canAccessClient(req.user, clientId))) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        return res.status(403).json({ error: "Нет доступа" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Файл не передан" });
      }
      // Multer decodes multipart filenames as latin1 by default — fix for Cyrillic names
      const originalName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
      const { display_name = "", analysis_date = "", comment = "" } = req.body || {};
      const record = await insertAnalyticsFile(
        clientId,
        display_name || originalName,
        analysis_date,
        comment,
        originalName,
        req.file.mimetype,
        req.file.size,
        req.file.filename,
        req.user.id
      );
      res.json(record);
    } catch (e) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      res.status(500).json({ error: e.message });
    }
  }
);

// PATCH /api/clients/:clientId/analytics-files/:id
router.patch("/clients/:clientId/analytics-files/:id",
  requireAuth(), requireSectionWrite("analytics"),
  async (req, res) => {
    try {
      const { clientId, id } = req.params;
      if (!(await canAccessClient(req.user, clientId))) {
        return res.status(403).json({ error: "Нет доступа" });
      }
      const existing = await getAnalyticsFileById(+id);
      if (!existing || existing.client_id !== clientId) {
        return res.status(404).json({ error: "Файл не найден" });
      }
      const { display_name, analysis_date, comment } = req.body || {};
      const updated = await updateAnalyticsFile(
        +id,
        display_name ?? existing.display_name,
        analysis_date ?? existing.analysis_date,
        comment ?? existing.comment
      );
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// DELETE /api/clients/:clientId/analytics-files/:id
router.delete("/clients/:clientId/analytics-files/:id",
  requireAuth(), requireSectionWrite("analytics"),
  async (req, res) => {
    try {
      const { clientId, id } = req.params;
      if (!(await canAccessClient(req.user, clientId))) {
        return res.status(403).json({ error: "Нет доступа" });
      }
      const existing = await getAnalyticsFileById(+id);
      if (!existing || existing.client_id !== clientId) {
        return res.status(404).json({ error: "Файл не найден" });
      }
      await deleteAnalyticsFile(+id);
      const filePath = path.join(ANALYTICS_UPLOADS_DIR, existing.storage_path);
      try { fs.unlinkSync(filePath); } catch (_) {}
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// GET /api/clients/:clientId/analytics-files/:id/download
router.get("/clients/:clientId/analytics-files/:id/download",
  requireAuth(), requireSectionRead("analytics"),
  async (req, res) => {
    try {
      const { clientId, id } = req.params;
      if (!(await canAccessClient(req.user, clientId))) {
        return res.status(403).json({ error: "Нет доступа" });
      }
      const file = await getAnalyticsFileById(+id);
      if (!file || file.client_id !== clientId) {
        return res.status(404).json({ error: "Файл не найден" });
      }
      const filePath = path.join(ANALYTICS_UPLOADS_DIR, file.storage_path);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Файл не найден на диске" });
      }
      const downloadName = file.display_name || file.original_name;
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
      res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
      res.sendFile(filePath);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

module.exports = router;
