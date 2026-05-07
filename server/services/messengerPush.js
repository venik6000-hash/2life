const webpush = require("web-push");
const { listPushDevicesForUsers } = require("./messengerStore");

function configureWebPush() {
  const status = getPushConfigStatus();
  if (!status.ready) return false;
  try {
    webpush.setVapidDetails(status.subject, status.publicKey, status.privateKey);
    return true;
  } catch {
    return false;
  }
}

function getPushConfigStatus() {
  const subject = process.env.VAPID_SUBJECT || "";
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  return {
    subject,
    publicKey,
    privateKey,
    hasSubject: !!subject,
    hasPublicKey: !!publicKey,
    hasPrivateKey: !!privateKey,
    ready: !!subject && !!publicKey && !!privateKey,
  };
}

async function sendPrivateMessagePush({ userIds, chatTitle, url = "/app/messenger", exceptDeviceId = "" }) {
  if (!configureWebPush()) return { ok: false, skipped: "missing_vapid" };
  const uniqueUserIds = Array.from(new Set(Array.from(userIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  const devices = await listPushDevicesForUsers(uniqueUserIds);
  const payload = JSON.stringify({
    title: "Новое сообщение",
    body: chatTitle ? `Чат: ${chatTitle}` : "Откройте мессенджер",
    url,
  });
  const results = [];
  for (const device of devices) {
    if (exceptDeviceId && device.device_id === exceptDeviceId) continue;
    const subscription = {
      endpoint: device.endpoint,
      keys: { p256dh: device.p256dh, auth: device.auth },
    };
    try {
      await webpush.sendNotification(subscription, payload);
      results.push({ deviceId: device.device_id, ok: true });
    } catch (error) {
      results.push({ deviceId: device.device_id, ok: false, statusCode: error.statusCode || 0 });
    }
  }
  return { ok: true, results };
}

module.exports = { getPushConfigStatus, sendPrivateMessagePush };
