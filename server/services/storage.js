const path = require("path");
const fs   = require("fs");

const BACKUP_DIR            = path.join(__dirname, "..", "data", "backups");
const BACKUP_INTERVAL_MINUTES = Math.max(1, +(process.env.BACKUP_INTERVAL_MINUTES || 60));
const BACKUP_KEEP_FILES     = Math.max(10, +(process.env.BACKUP_KEEP_FILES || 168));

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

module.exports = {
  BACKUP_DIR,
  BACKUP_INTERVAL_MINUTES,
  BACKUP_KEEP_FILES,
  ensureDir,
  sameJson
};
