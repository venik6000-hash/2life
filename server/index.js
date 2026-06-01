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

app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));

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
  await waitForDb();          // self-heal transient DB-not-ready; throws (→ fail loud) only if still unreachable after retries
  await initSchema();
  ensureDir(BACKUP_DIR);
  await initDefaultAdmin();
  await initDefaultRoles();
  await initDefaultDeficitPresets();
  const { initWebSocket } = require("./services/ws");
  const httpServer = app.listen(PORT, () => {
    console.log(`2life API запущен: http://localhost:${PORT}`);
    startAutoBackup();
  });
  initWebSocket(httpServer);
  startJournalNotificationScheduler();
}

start().catch((err) => {
  console.error("[startup] FATAL — server failed to initialize:", err);
  process.exit(1); // non-zero exit → Docker `restart: unless-stopped` relaunches the container
});
