export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = globalThis.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

const VALID_PERMISSION_STATES = new Set(["default", "denied", "granted"]);

function withTimeout(promise, timeoutMs, fallbackValue) {
  let timer = null;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
    }),
  ]);
}

export async function requestNotificationPermission(notificationApi = globalThis.Notification, { timeoutMs = 15000 } = {}) {
  if (!notificationApi) return "unsupported";
  if (notificationApi.permission === "granted" || notificationApi.permission === "denied") {
    return notificationApi.permission;
  }
  if (typeof notificationApi.requestPermission !== "function") {
    return VALID_PERMISSION_STATES.has(notificationApi.permission) ? notificationApi.permission : "default";
  }

  const requested = new Promise((resolve) => {
    const finish = (permission) => {
      resolve(VALID_PERMISSION_STATES.has(permission) ? permission : (notificationApi.permission || "default"));
    };

    try {
      const maybePromise = notificationApi.requestPermission(finish);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(finish).catch(() => finish(notificationApi.permission || "default"));
      } else if (typeof maybePromise === "string") {
        finish(maybePromise);
      }
    } catch {
      finish(notificationApi.permission || "default");
    }
  });

  return withTimeout(requested, timeoutMs, "permission_timeout");
}

export async function ensurePushSubscription(registration, publicKey) {
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}
