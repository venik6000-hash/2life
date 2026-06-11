const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();

const IMPORT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const IMPORT_UPLOAD_EXTENSIONS = new Set([".xls", ".xlsx", ".xlsm", ".csv"]);
const IMPORT_UPLOAD_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "text/csv",
  "application/csv",
  "application/octet-stream",
]);

const safeUnlink = (filePath) => {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
};

const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: IMPORT_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (IMPORT_UPLOAD_EXTENSIONS.has(ext) && IMPORT_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Разрешены только Excel/CSV файлы"));
  },
});
const { parseQuestionnaireWorkbook } = require('../parsers/questionnaire');
const { detectAnalyticsSheet, parseAnalyticsWorksheet } = require('../parsers/analytics');
const { requireAuth, requirePermission, requireSectionWrite } = require('../middleware/auth');

const importUploadError = (err, _req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Файл слишком большой" });
  }
  return res.status(400).json({ error: err.message || "Файл не принят" });
};

// ---------- Questionnaire Excel Parser ----------
router.post(
  "/import-questionnaire",
  requireAuth(),
  requirePermission("import_data"),
  requireSectionWrite("questionnaire"),
  upload.single("file"),
  importUploadError,
  (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });

    const wb = XLSX.readFile(req.file.path);
    const questionnaire = parseQuestionnaireWorkbook(wb);

    safeUnlink(req.file.path);

    res.json({
      ok: true,
      kind: "questionnaire",
      gender: questionnaire.gender,
      sectionsCount: questionnaire.sections.length,
      answersCount: questionnaire.rawAnswers.length,
      questionnaire
    });
  } catch (e) {
    console.error("Questionnaire parse error:", e);
    if (req.file) safeUnlink(req.file.path);
    res.status(500).json({ error: e.message });
  }
  }
);

// ---------- Analytics Excel Parser ----------
router.post(
  "/import-analytics",
  requireAuth(),
  requirePermission("import_data"),
  requireSectionWrite("analytics"),
  upload.single("file"),
  importUploadError,
  (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });

    const wb = XLSX.readFile(req.file.path);

    // Find analytics sheet by content, not by sheet name
    let sheetName = detectAnalyticsSheet(wb);
    if (!sheetName) {
      safeUnlink(req.file.path);
      return res.status(400).json({ error: "Лист с анализами не найден по структуре данных", sheets: wb.SheetNames });
    }

    const ws = wb.Sheets[sheetName];
    const parsed = parseAnalyticsWorksheet(ws);
    if (!parsed) {
      safeUnlink(req.file.path);
      return res.status(400).json({ error: "Не найдена строка с датами анализов" });
    }

    // Clean up temp file
    safeUnlink(req.file.path);

    console.log(`Parsed: ${parsed.categoriesCount} categories, ${parsed.markersCount} markers, ${parsed.dates.length} dates`);

    res.json({
      ok: true,
      dates: parsed.dates,
      categoriesCount: parsed.categoriesCount,
      markersCount: parsed.markersCount,
      analyticsCategories: parsed.analyticsCategories
    });

  } catch (e) {
    console.error("Parse error:", e);
    if (req.file) safeUnlink(req.file.path);
    res.status(500).json({ error: e.message });
  }
  }
);

module.exports = router;
