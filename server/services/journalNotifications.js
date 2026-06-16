const { sendPushToUsers } = require("./messengerPush");
const {
  listDueJournalReminders,
  listUsersForJournalDigest,
  recordJournalNotificationDelivery,
  wasJournalNotificationDelivered,
} = require("./journalStore");
const waveStore = require("./waveStore");

const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

async function runJournalDigest(now = new Date()) {
  const today = todayIso(now);
  const users = await listUsersForJournalDigest(today);
  for (const user of users) {
    const deliveryKey = today;
    if (await wasJournalNotificationDelivered({ userId: user.id, kind: "digest", deliveryKey })) continue;
    await sendPushToUsers({
      userIds: [user.id],
      title: "Журнал 2life",
      body: `На сегодня и просрочено: ${user.due_count}`,
      url: "/",
    });
    await recordJournalNotificationDelivery({ userId: user.id, kind: "digest", deliveryKey });
  }
  return { users: users.length };
}

async function runJournalExactReminders(now = new Date()) {
  const nowIso = now.toISOString().slice(0, 16);
  const rows = await listDueJournalReminders(nowIso);
  let sent = 0;
  for (const row of rows) {
    const deliveryKey = `${row.id}:${String(row.due_date).slice(0, 10)}:${String(row.due_time).slice(0, 5)}`;
    if (await wasJournalNotificationDelivered({ userId: row.user_id, kind: "exact", deliveryKey })) continue;
    await sendPushToUsers({
      userIds: [row.user_id],
      title: row.type === "event" ? "Событие в журнале" : "Задача в журнале",
      body: row.title || "Откройте журнал клиента",
      url: `/?cid=${encodeURIComponent(row.client_id)}&sec=journal`,
    });
    await recordJournalNotificationDelivery({ userId: row.user_id, journalItemId: row.id, kind: "exact", deliveryKey });
    sent += 1;
  }
  return { scanned: rows.length, sent };
}

async function runWaveCheckinReminders(now = new Date()) {
  const today = todayIso(now);
  const due = await waveStore.listDueWaveCheckinReminders(today);
  let sent = 0;
  for (const row of due) {
    if (await wasJournalNotificationDelivered({ userId: row.user_id, kind: "wave_checkin", deliveryKey: today })) continue;
    await sendPushToUsers({ userIds: [row.user_id], title: "2life", body: "Как ты сегодня? Отметь за 60 секунд",
      url: `/?cid=${encodeURIComponent(row.client_id)}&sec=wave` });
    await recordJournalNotificationDelivery({ userId: row.user_id, kind: "wave_checkin", deliveryKey: today });
    sent += 1;
  }
  return { due: due.length, sent };
}

async function runWaveInflectionScan(now = new Date()) {
  return waveStore.scanInflectionsForAllClients(todayIso(now));
}

function startJournalNotificationScheduler() {
  const tick = () => {
    runJournalExactReminders().catch((error) => console.warn("[journal] exact reminder failed", error?.message || error));
    const now = new Date();
    if (now.getHours() === 9 && now.getMinutes() < 5) {
      runJournalDigest(now).catch((error) => console.warn("[journal] digest failed", error?.message || error));
      runWaveInflectionScan(now).catch((e) => console.warn("[wave] inflection scan failed", e?.message || e));
      runWaveCheckinReminders(now).catch((e) => console.warn("[wave] checkin reminder failed", e?.message || e));
    }
  };
  const timer = setInterval(tick, 5 * 60 * 1000);
  tick();
  return timer;
}

module.exports = { runJournalDigest, runJournalExactReminders, startJournalNotificationScheduler, runWaveCheckinReminders, runWaveInflectionScan };
