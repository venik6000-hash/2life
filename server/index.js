require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const express = require("express");
const cors    = require("cors");

const { initSchema } = require("./services/db");
const { startAutoBackup } = require("./services/backup");
const { ensureDir, BACKUP_DIR } = require("./services/storage");
const { initDefaultAdmin, initDefaultRoles, initDefaultDeficitPresets } = require("./services/setup");

const { startJournalNotificationScheduler } = require("./services/journalNotifications");
const { waitForDb } = require("./services/waitForDb");

// Intentional asymmetry — do NOT unify these:
//  - unhandledRejection logs only: one orphaned request/WS/scheduler promise must
//    not take the whole server down.
//  - uncaughtException exits(1): the process may be in an unknown state, so let
//    Docker `restart: unless-stopped` relaunch a clean one.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});

const authRouter      = require("./routes/auth");
const clientsRouter   = require("./routes/clients");
const doctorsRouter   = require("./routes/doctors");
const importRouter    = require("./routes/import");
const adminRouter     = require("./routes/admin");
const messengerRouter = require("./routes/messenger");
const menuRouter           = require("./routes/menu");
const analyticsFilesRouter = require("./routes/analyticsFiles");
const journalRouter        = require("./routes/journal");

const app  = express();
const PORT = 3001;

// Behind the nginx reverse proxy (see nginx.conf — it sets X-Forwarded-For), so
// req.ip must come from the forwarded header, not the proxy's socket address.
// Without this, every client collapses to one req.ip and the per-IP login rate
// limiter would throttle all users together (a global login lockout). The repo
// topology is a single proxy hop; deployments with extra hops set TRUST_PROXY.
app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

let appReady = false;

app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));

// Health endpoint — always reachable, even before init completes
app.get("/api/health", (req, res) => res.json({ ready: appReady, ts: Date.now() }));
// Readiness gate — 503 until init done; placed before router mounts so it intercepts all /api/*
app.use("/api", (req, res, next) => {
  if (appReady) return next();
  res.status(503).json({ error: "starting", message: "Сервис запускается, повторите запрос" });
});

app.use("/api", authRouter);
app.use("/api", clientsRouter);
app.use("/api", doctorsRouter);
app.use("/api", importRouter);
app.use("/api", adminRouter);
app.use("/api", messengerRouter);
app.use("/api", menuRouter);
app.use("/api", analyticsFilesRouter);
app.use("/api", journalRouter);

async function start() {
  // Bind listen early so the port is open during DB-wait/init (returns 503 until appReady flips)
  const httpServer = app.listen(PORT, () => {
    console.log(`2life API слушает (инициализация...): http://localhost:${PORT}`);
  });
  await waitForDb();          // self-heal transient DB-not-ready; throws (→ fail loud) only if still unreachable after retries
  await initSchema();
  ensureDir(BACKUP_DIR);
  await initDefaultAdmin();
  await initDefaultRoles();
  await initDefaultDeficitPresets();
  // All schema/seed work is done — drop runtime queries to the DML-only DB
  // role (non-fatal: falls back to the admin connection on failure).
  const { ensureAppDbRole } = require("./services/db");
  await ensureAppDbRole();
  appReady = true;
  console.log(`2life API готов: http://localhost:${PORT}`);
  const { initWebSocket, startRevocationSweep: startWsRevocationSweep } = require("./services/ws");
  initWebSocket(httpServer);
  // Backstop for revoking long-lived real-time sessions after token expiry /
  // token_version bumps (explicit closes handle the same-process case). SSE has no
  // inbound frames and WS sockets can sit idle, so a timer drives the freshness check.
  const { startRevocationSweep } = require("./services/sse");
  startRevocationSweep();
  startWsRevocationSweep();
  startAutoBackup();
  startJournalNotificationScheduler();
}

start().catch((err) => {
  console.error("[startup] FATAL — server failed to initialize:", err);
  process.exit(1); // non-zero exit → Docker `restart: unless-stopped` relaunches the container
});
