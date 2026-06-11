const assert = require("assert");
const { createOneTimeAuthTicketStore } = require("../services/oneTimeAuthTicketStore");
const { createTicket, consumeTicket } = require("../services/sseTickets");
const { createWsTicket, consumeWsTicket } = require("../services/wsTickets");

const originalDateNow = Date.now;

try {
  Date.now = () => 1_000_000;

  const user = {
    id: "user-1",
    username: "doctor",
    role: "staff",
    jti: "session-1",
    token_version: "4",
  };

  const sseTicket = createTicket(user);
  const sseEntry = consumeTicket(sseTicket);
  assert.deepStrictEqual(sseEntry, {
    id: "user-1",
    username: "doctor",
    role: "staff",
    jti: "session-1",
    token_version: 4,
    expiry: 1_030_000,
  });
  assert.strictEqual(consumeTicket(sseTicket), null, "SSE ticket must be single-use");

  const wsTicket = createWsTicket({ ...user, jti: "", token_version: null }, "device-1");
  const wsEntry = consumeWsTicket(wsTicket);
  assert.deepStrictEqual(wsEntry, {
    id: "user-1",
    username: "doctor",
    role: "staff",
    jti: null,
    token_version: 0,
    deviceId: "device-1",
    expiry: 1_030_000,
  });
  assert.strictEqual(consumeWsTicket(wsTicket), null, "WS ticket must be single-use");

  const isolatedSseTicket = createTicket(user);
  assert.strictEqual(
    consumeWsTicket(isolatedSseTicket),
    null,
    "SSE and WS tickets must use separate stores"
  );
  assert.ok(consumeTicket(isolatedSseTicket), "SSE ticket must remain available in the SSE store");

  const expiredWsTicket = createWsTicket(user);
  Date.now = () => 1_030_001;
  assert.strictEqual(consumeWsTicket(expiredWsTicket), null, "Expired ticket must be rejected");
  assert.strictEqual(consumeWsTicket(expiredWsTicket), null, "Expired ticket must still be consumed");

  Date.now = () => 2_000_000;
  const sharedStore = createOneTimeAuthTicketStore({
    decorateEntry: (_user, context) => ({ deviceId: context.deviceId || null }),
  });
  const sharedTicket = sharedStore.create(user, { deviceId: "device-2" });
  assert.deepStrictEqual(sharedStore.consume(sharedTicket), {
    id: "user-1",
    username: "doctor",
    role: "staff",
    jti: "session-1",
    token_version: 4,
    deviceId: "device-2",
    expiry: 2_030_000,
  });
} finally {
  Date.now = originalDateNow;
}

console.log("realtime ticket contracts ok");
