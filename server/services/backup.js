const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const {
  BACKUP_DIR,
  BACKUP_INTERVAL_MINUTES,
  BACKUP_KEEP_FILES,
  UPLOADS_BACKUP_INTERVAL_MINUTES,
  UPLOADS_BACKUP_KEEP_FILES,
  UPLOADS_DIR,
  ensureDir,
} = require("./storage");

const PGDUMP_DIR = path.join(BACKUP_DIR, "pgdump");
const UPLOADS_BACKUP_DIR = path.join(BACKUP_DIR, "uploads");
const PG_DUMP_BIN = process.env.PG_DUMP_BIN || "pg_dump";
const TAR_BIN = process.env.TAR_BIN || "tar";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/2life";

// Build a pg env from DATABASE_URL so the password is passed via PGPASSWORD
// instead of on the pg_dump argv (argv is world-readable via ps / /proc).
const buildPgEnv = () => {
  const env = { ...process.env };
  try {
    const u = new URL(DATABASE_URL);
    if (u.hostname) env.PGHOST = decodeURIComponent(u.hostname);
    if (u.port) env.PGPORT = u.port;
    if (u.username) env.PGUSER = decodeURIComponent(u.username);
    if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
    const db = u.pathname.replace(/^\//, "");
    if (db) env.PGDATABASE = decodeURIComponent(db);
  } catch (_) { /* leave any pre-existing PG* env in place */ }
  return env;
};

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
  execFile(PG_DUMP_BIN, ["--no-password", "--clean", "--if-exists"], { env: buildPgEnv(), maxBuffer: 512 * 1024 * 1024 }, (err, stdout) => {
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

const cleanupOldUploadsBackups = () => {
  ensureDir(UPLOADS_BACKUP_DIR);
  const files = fs
    .readdirSync(UPLOADS_BACKUP_DIR)
    .filter(name => /^uploads-\d{8}-\d{6}-.+\.tar\.gz$/.test(name))
    .sort();
  const extraCount = files.length - UPLOADS_BACKUP_KEEP_FILES;
  if (extraCount <= 0) return;
  files.slice(0, extraCount).forEach(name => {
    try { fs.unlinkSync(path.join(UPLOADS_BACKUP_DIR, name)); } catch (_) {}
  });
};

const createUploadsBackup = (reason = "auto") => new Promise((resolve) => {
  if (!fs.existsSync(UPLOADS_DIR)) {
    console.warn(`[backup] uploads dir missing, skip: ${UPLOADS_DIR}`);
    return resolve(false);
  }
  ensureDir(UPLOADS_BACKUP_DIR);
  const stamp = backupStamp();
  const outFile = path.join(UPLOADS_BACKUP_DIR, `uploads-${stamp}-${reason}.tar.gz`);
  // -C parent of UPLOADS_DIR so archive contains relative "uploads/..." paths
  const parent = path.dirname(UPLOADS_DIR);
  const base = path.basename(UPLOADS_DIR);
  execFile(TAR_BIN, ["-czf", outFile, "-C", parent, base], (err) => {
    if (err) {
      console.error("uploads tar error:", err.message);
      try { fs.unlinkSync(outFile); } catch (_) {}
      return resolve(false);
    }
    cleanupOldUploadsBackups();
    let size = 0;
    try { size = fs.statSync(outFile).size; } catch (_) {}
    console.log(`[backup] uploads → ${path.basename(outFile)} (${Math.round(size / 1024)} KB)`);
    resolve(true);
  });
});

const createBackupSnapshot = async (reason = "auto") => {
  await createPgDump(reason);
};

const startAutoBackup = () => {
  const intervalMs = BACKUP_INTERVAL_MINUTES * 60 * 1000;
  console.log(`Auto-backup (pg_dump): every ${BACKUP_INTERVAL_MINUTES} min, keep ${BACKUP_KEEP_FILES} files`);
  const timer = setInterval(() => createBackupSnapshot("auto"), intervalMs);
  if (typeof timer.unref === "function") timer.unref();

  const uploadsIntervalMs = UPLOADS_BACKUP_INTERVAL_MINUTES * 60 * 1000;
  console.log(`Auto-backup (uploads): every ${UPLOADS_BACKUP_INTERVAL_MINUTES} min, keep ${UPLOADS_BACKUP_KEEP_FILES} archives`);
  // Run once at boot so we get an immediate baseline (in case it's been a while), then on interval.
  setTimeout(() => createUploadsBackup("auto").catch(() => {}), 30 * 1000);
  const uploadsTimer = setInterval(() => createUploadsBackup("auto"), uploadsIntervalMs);
  if (typeof uploadsTimer.unref === "function") uploadsTimer.unref();
};

module.exports = { createPgDump, createUploadsBackup, createBackupSnapshot, startAutoBackup };
