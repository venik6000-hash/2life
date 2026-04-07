require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const express = require("express");
const cors    = require("cors");

const { initSchema } = require("./services/db");
const { startAutoBackup } = require("./services/backup");
const { ensureDir, BACKUP_DIR } = require("./services/storage");
const { initDefaultAdmin, initDefaultRoles, initDefaultDeficitPresets } = require("./services/setup");

const authRouter    = require("./routes/auth");
const clientsRouter = require("./routes/clients");
const doctorsRouter = require("./routes/doctors");
const importRouter  = require("./routes/import");
const adminRouter   = require("./routes/admin");

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

async function start() {
  await initSchema();
  ensureDir(BACKUP_DIR);
  await initDefaultAdmin();
  await initDefaultRoles();
  await initDefaultDeficitPresets();
  app.listen(PORT, () => {
    console.log(`2life API запущен: http://localhost:${PORT}`);
    startAutoBackup();
  });
}

start().catch(console.error);
