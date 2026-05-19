const path = require("path");
const fs   = require("fs");

const BACKUP_DIR            = path.join(__dirname, "..", "data", "backups");
const BACKUP_INTERVAL_MINUTES = Math.max(1, +(process.env.BACKUP_INTERVAL_MINUTES || 60));
const BACKUP_KEEP_FILES     = Math.max(10, +(process.env.BACKUP_KEEP_FILES || 168));
const UPLOADS_BACKUP_INTERVAL_MINUTES = Math.max(60, +(process.env.UPLOADS_BACKUP_INTERVAL_MINUTES || 1440));
const UPLOADS_BACKUP_KEEP_FILES = Math.max(2, +(process.env.UPLOADS_BACKUP_KEEP_FILES || 14));
const UPLOADS_DIR           = path.join(__dirname, "..", "uploads");

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

module.exports = {
  BACKUP_DIR,
  BACKUP_INTERVAL_MINUTES,
  BACKUP_KEEP_FILES,
  UPLOADS_BACKUP_INTERVAL_MINUTES,
  UPLOADS_BACKUP_KEEP_FILES,
  UPLOADS_DIR,
  ensureDir,
  sameJson
};
