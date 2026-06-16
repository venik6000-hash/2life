const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { buildAuthorizeUrl, mapWhoopToObjective, whoopDayKey, verifyWebhookSignature } = require("../services/whoopClient");

// authorize URL
const url = buildAuthorizeUrl({ clientId: "abc", redirectUri: "https://x/cb", state: "s1", scopes: ["read:recovery", "offline"] });
assert.ok(url.startsWith("https://api.prod.whoop.com/oauth/oauth2/auth?"), "authorize base");
const q = new URL(url).searchParams;
assert.equal(q.get("client_id"), "abc");
assert.equal(q.get("response_type"), "code");
assert.equal(q.get("redirect_uri"), "https://x/cb");
assert.equal(q.get("scope"), "read:recovery offline");
assert.equal(q.get("state"), "s1");

// payload -> objective (verified v2 field names)
const obj = mapWhoopToObjective({
  recovery: { score: { recovery_score: 66, resting_heart_rate: 54, hrv_rmssd_milli: 87.3 } },
  sleep: { score: { sleep_performance_percentage: 91, respiratory_rate: 15.2 } },
  cycle: { score: { strain: 12.4 } },
});
assert.equal(obj.recovery, 66);
assert.equal(obj.rhr_bpm, 54);
assert.equal(obj.hrv_ms, 87.3);
assert.equal(obj.sleep_perf, 91);
assert.equal(obj.respiratory_rate, 15.2);
assert.equal(obj.strain, 12.4);
assert.deepEqual(mapWhoopToObjective({}), {});

// day key
assert.equal(whoopDayKey({ created_at: "2026-06-15T07:32:00.000Z" }), "2026-06-15");

// webhook signature (matches WHOOP scheme: base64(HMAC_SHA256(ts + rawBody, secret)))
const secret = "shh", ts = "1700000000000", body = '{"user_id":42,"type":"recovery.updated"}';
const good = crypto.createHmac("sha256", secret).update(Buffer.concat([Buffer.from(ts), Buffer.from(body)])).digest("base64");
assert.equal(verifyWebhookSignature({ timestamp: ts, rawBody: Buffer.from(body), signature: good, secret }), true);
assert.equal(verifyWebhookSignature({ timestamp: ts, rawBody: Buffer.from(body), signature: "wrong", secret }), false);

console.log("whoop client ok");
