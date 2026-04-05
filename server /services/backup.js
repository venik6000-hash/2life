const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { BACKUP_DIR, BACKUP_INTERVAL_MINUTES, BACKUP_KEEP_FILES, ensureDir } = require("./storage");

const PGDUMP_DIR = path.join(BACKUP_DIR, "pgdump");
const PG_DUMP_BIN = process.env.PG_DUMP_BIN || "pg_dump";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/2life";

const backupStamp = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}-${hh}${mm}${ss}`;
};

const cleanupOldPgDumps = () => {
  ensureDir(PGDUMP_DIR);
  const files = fs
    .readdirSync(PGDUMP_DIR)
    .filter(name => /^2life-\d{8}-\d{6}-.+\.sql$/.test(name))
    .sort();
  const extraCount = files.length - BACKUP_KEEP_FILES;
  if (extraCount <= 0) return;
  files.slice(0, extraCount).forEach(name => {
    try { fs.unlinkSync(path.join(PGDUMP_DIR, name)); } catch (_) {}
  });
};

const createPgDump = (reason = "auto") => new Promise((resolve) => {
  ensureDir(PGDUMP_DIR);
  const stamp = backupStamp();
  const outFile = path.join(PGDUMP_DIR, `2life-${stamp}-${reason}.sql`);
  execFile(PG_DUMP_BIN, ["--no-password", "--clean", "--if-exists", DATABASE_URL], (err, stdout) => {
    if (err) {
      console.error("pg_dump error:", err.message);
      return resolve(false);
    }
    fs.writeFileSync(outFile, stdout);
    cleanupOldPgDumps();
    console.log(`[backup] pg_dump → ${path.basename(outFile)}`);
    resolve(true);
  });
});

const createBackupSnapshot = async (reason = "auto") => {
  await createPgDump(reason);
};

const startAutoBackup = () => {
  const intervalMs = BACKUP_INTERVAL_MINUTES * 60 * 1000;
  console.log(`Auto-backup: every ${BACKUP_INTERVAL_MINUTES} min, keep ${BACKUP_KEEP_FILES} files`);
  const timer = setInterval(() => createBackupSnapshot("auto"), intervalMs);
  if (typeof timer.unref === "function") timer.unref();
};

module.exports = { createPgDump, createBackupSnapshot, startAutoBackup };
