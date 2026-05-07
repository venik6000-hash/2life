import assert from "node:assert/strict";
import { ensurePushSubscription, requestNotificationPermission } from "../src/utils/pushSubscription.js";

let subscribeCalls = 0;
const existingSubscription = {
  toJSON: () => ({
    endpoint: "https://push.example/existing",
    keys: { p256dh: "existing-p256dh", auth: "existing-auth" },
  }),
};
const nextSubscription = {
  toJSON: () => ({
    endpoint: "https://push.example/device",
    keys: { p256dh: "p256dh", auth: "auth" },
  }),
};

const registration = {
  pushManager: {
    getSubscription: async () => existingSubscription,
    subscribe: async (options) => {
      subscribeCalls += 1;
      assert.equal(options.userVisibleOnly, true);
      assert.ok(options.applicationServerKey instanceof Uint8Array);
      return nextSubscription;
    },
  },
};

const result = await ensurePushSubscription(registration, "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

assert.equal(result, existingSubscription);
assert.equal(subscribeCalls, 0);

const newResult = await ensurePushSubscription({
  pushManager: {
    getSubscription: async () => null,
    subscribe: registration.pushManager.subscribe,
  },
}, "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

assert.equal(newResult, nextSubscription);
assert.equal(subscribeCalls, 1);

assert.equal(await requestNotificationPermission({ permission: "granted" }), "granted");

let callbackRequested = false;
const callbackPermission = await requestNotificationPermission({
  permission: "default",
  requestPermission: (callback) => {
    callbackRequested = true;
    callback("granted");
  },
});
assert.equal(callbackPermission, "granted");
assert.equal(callbackRequested, true);

const timeoutPermission = await requestNotificationPermission({
  permission: "default",
  requestPermission: () => new Promise(() => {}),
}, { timeoutMs: 5 });
assert.equal(timeoutPermission, "permission_timeout");

console.log("messenger push client ok");
