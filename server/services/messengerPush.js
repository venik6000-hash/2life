const webpush = require("web-push");
const { listPushDevicesForUsers } = require("./messengerStore");

const PUSH_STATUS = (() => {
  const subject = process.env.VAPID_SUBJECT || "";
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  return {
    subject, publicKey, privateKey,
    hasSubject: !!subject, hasPublicKey: !!publicKey, hasPrivateKey: !!privateKey,
    ready: !!subject && !!publicKey && !!privateKey,
  };
})();

const PUSH_READY = (() => {
  if (!PUSH_STATUS.ready) return false;
  try {
    webpush.setVapidDetails(PUSH_STATUS.subject, PUSH_STATUS.publicKey, PUSH_STATUS.privateKey);
    return true;
  } catch (err) {
    console.warn("[push] failed to configure VAPID:", err?.message || err);
    return false;
  }
})();

function getPushConfigStatus() { return PUSH_STATUS; }

function pickPushBody(msgType, chatTitle) {
  if (msgType === "voice") return chatTitle ? `${chatTitle}: 🎤 Голосовое сообщение` : "🎤 Голосовое сообщение";
  if (msgType === "image") return chatTitle ? `${chatTitle}: 🖼 Фото` : "🖼 Фото";
  if (msgType === "file" || msgType === "files_bundle") return chatTitle ? `${chatTitle}: 📎 Файл` : "📎 Файл";
  return chatTitle ? `Чат: ${chatTitle}` : "Откройте мессенджер";
}

async function sendPrivateMessagePush({ userIds, chatTitle, url = "/app/messenger", exceptDeviceId = "", msgType = "text" }) {
  if (!PUSH_READY) return { ok: false, skipped: "missing_vapid" };
  const uniqueUserIds = Array.from(new Set(Array.from(userIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  const devices = await listPushDevicesForUsers(uniqueUserIds);
  const payload = JSON.stringify({
    title: "Новое сообщение",
    body: pickPushBody(msgType, chatTitle),
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
