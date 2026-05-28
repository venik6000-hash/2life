import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const ADMIN_TOKEN = process.env.JOURNAL_ADMIN_TOKEN;
const TOKEN = process.env.JOURNAL_TEST_TOKEN;
const CLIENT_ID = process.env.JOURNAL_TEST_CLIENT_ID;
const STAGE_ID = Number(process.env.JOURNAL_TEST_STAGE_ID || 0);

if (!ADMIN_TOKEN || !TOKEN || !CLIENT_ID || !STAGE_ID) {
  console.log("set JOURNAL_ADMIN_TOKEN, JOURNAL_TEST_TOKEN, JOURNAL_TEST_CLIENT_ID, JOURNAL_TEST_STAGE_ID");
  process.exit(1);
}

const call = async (token, path, method = "GET", body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};

const template = await call(ADMIN_TOKEN, "/api/admin/journal/checklist-template");
assert.equal(template.status, 200);
assert.ok(template.data.items.length >= 11);

const init = await call(TOKEN, `/api/clients/${CLIENT_ID}/journal/stages/${STAGE_ID}/checklist/initialize`, "POST");
assert.equal(init.status, 200);
assert.ok(init.data.created >= 0);

const second = await call(TOKEN, `/api/clients/${CLIENT_ID}/journal/stages/${STAGE_ID}/checklist/initialize`, "POST");
assert.equal(second.status, 200);
assert.equal(second.data.created, 0, "checklist initialization is idempotent");

console.log("journal checklist ok");
