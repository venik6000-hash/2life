"use strict";

const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-only-admin-stats-secret-32-chars";
process.env.NODE_ENV = "test";

const { pool } = require("../services/db");
const router = require("../routes/admin");

const routeLayer = router.stack.find((layer) => layer.route?.path === "/admin/stats");
assert.ok(routeLayer, "admin stats route must exist");
const handler = routeLayer.route.stack.at(-1).handle;

const originalQuery = pool.query;
const calls = [];
const lastActivityTs = "2026-06-12T10:20:30.000Z";
let statsRow = {
  clients_count: "7",
  stages_count: "12",
  users_count: "4",
  doctors_count: "3",
  last_activity_ts: lastActivityTs,
};

pool.query = async (sql) => {
  const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
  calls.push(normalized);
  assert.match(normalized, /\(select count\(\*\) from clients\) as clients_count/);
  assert.match(normalized, /\(select count\(\*\) from stages\) as stages_count/);
  assert.match(normalized, /\(select count\(\*\) from users where active = true\) as users_count/);
  assert.match(normalized, /\(select count\(\*\) from doctors\) as doctors_count/);
  assert.match(
    normalized,
    /\(select ts from activity_log order by ts desc limit 1\) as last_activity_ts/,
  );
  return { rows: [statsRow] };
};

const invokeHandler = async () => {
  let statusCode = 200;
  let responseBody = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };
  const callCountBefore = calls.length;
  await handler({}, res);
  assert.equal(calls.length - callCountBefore, 1, "admin stats must use one SQL round trip");
  return { statusCode, responseBody };
};

(async () => {
  const populated = await invokeHandler();

  assert.equal(populated.statusCode, 200);
  assert.deepEqual(populated.responseBody, {
    ok: true,
    clientsCount: 7,
    stagesCount: 12,
    usersCount: 4,
    doctorsCount: 3,
    lastActivityTs,
  });

  statsRow = {
    clients_count: "0",
    stages_count: "0",
    users_count: "0",
    doctors_count: "0",
    last_activity_ts: null,
  };
  const empty = await invokeHandler();
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(empty.responseBody, {
    ok: true,
    clientsCount: 0,
    stagesCount: 0,
    usersCount: 0,
    doctorsCount: 0,
    lastActivityTs: null,
  });

  console.log("admin stats query verification ok");
})()
  .finally(async () => {
    pool.query = originalQuery;
    await pool.end().catch(() => {});
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
