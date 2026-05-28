import assert from "node:assert/strict";
import { shouldSyncMessengerInSurface } from "../src/utils/messengerRealtime.js";

assert.equal(
  shouldSyncMessengerInSurface({ pathname: "/", activeSection: "overview" }),
  false,
  "dashboard overview must not replay messenger sync"
);

assert.equal(
  shouldSyncMessengerInSurface({ pathname: "/app/messenger", activeSection: "overview" }),
  true,
  "mobile messenger path should sync"
);

assert.equal(
  shouldSyncMessengerInSurface({ pathname: "/messenger", activeSection: "overview" }),
  true,
  "desktop messenger path should sync"
);

assert.equal(
  shouldSyncMessengerInSurface({ pathname: "/", activeSection: "messenger" }),
  true,
  "dashboard messenger section should sync"
);

console.log("messenger realtime surface ok");
