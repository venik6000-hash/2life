import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:3001";
const TOKEN = process.env.JOURNAL_TEST_TOKEN;
const CLIENT_ID = process.env.JOURNAL_TEST_CLIENT_ID;
const STAGE_ID = Number(process.env.JOURNAL_TEST_STAGE_ID || 0);

if (!TOKEN || !CLIENT_ID || !STAGE_ID) {
  console.log("set JOURNAL_TEST_TOKEN, JOURNAL_TEST_CLIENT_ID, JOURNAL_TEST_STAGE_ID");
  process.exit(1);
}

const call = async (path, method = "GET", body = null) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};

const list0 = await call(`/api/clients/${CLIENT_ID}/journal`);
assert.equal(list0.status, 200);
assert.ok(Array.isArray(list0.data.items));

const created = await call(`/api/clients/${CLIENT_ID}/journal/items`, "POST", {
  type: "task",
  stageId: STAGE_ID,
  title: "API smoke task",
  description: "Created by verifyJournalApi",
  status: "open",
  dueDate: "2026-05-27",
  dueTime: "",
  isTeamTask: true,
});
assert.equal(created.status, 200);
assert.equal(created.data.item.title, "API smoke task");

const updated = await call(`/api/clients/${CLIENT_ID}/journal/items/${created.data.item.id}`, "PATCH", {
  status: "waiting_client",
});
assert.equal(updated.status, 200);
assert.equal(updated.data.item.status, "waiting_client");

const comment = await call(`/api/clients/${CLIENT_ID}/journal/items/${created.data.item.id}/comments`, "POST", {
  body: "Комментарий врача",
});
assert.equal(comment.status, 200);
assert.equal(comment.data.comment.body, "Комментарий врача");

const badges = await call("/api/journal/badges");
assert.equal(badges.status, 200);
assert.ok(Number(badges.data.badges[CLIENT_ID]) >= 1);

const deleted = await call(`/api/clients/${CLIENT_ID}/journal/items/${created.data.item.id}`, "DELETE", {
  reason: "api smoke cleanup",
});
assert.equal(deleted.status, 200);

console.log("journal api ok");
