import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const mustContain = (source, needle, label) => {
  assert.ok(source.includes(needle), label);
};
const mustNotContain = (source, needle, label) => {
  assert.ok(!source.includes(needle), label);
};

const db = read("server/services/db.js");
const setup = read("server/services/setup.js");

// Regression guard for: admin-configured client/viewer role permissions getting
// wiped on every server restart. initSchema() runs on every boot (server/index.js),
// so it must NOT force-reset the client role's sections/permissions — otherwise the
// Roles-tab checkboxes "fall off" after each redeploy. Admin edits must persist and
// only change when the admin changes them.
mustNotContain(
  db,
  "UPDATE role_sections SET can_read = false, can_write = false WHERE role_id = $1 AND section_id <> 'messenger'",
  "initSchema must NOT force-disable client/viewer role sections on startup (would wipe admin edits)",
);
mustNotContain(
  db,
  "UPDATE role_permissions SET granted = false WHERE role_id = $1",
  "initSchema must NOT force-reset client/viewer role permissions on startup (would wipe admin edits)",
);
mustNotContain(
  db,
  "SELECT id FROM roles WHERE name IN ('viewer', 'client')",
  "initSchema must NOT single out the client/viewer role for an unconditional reset",
);

// Messenger access must stay open by default for every role, applied idempotently
// (insert-if-missing) so it never clobbers settings an admin has changed.
mustContain(
  db,
  "SELECT r.id, 'messenger', true, true",
  "initSchema must keep ensuring messenger access via an idempotent insert-if-missing",
);
mustContain(
  db,
  "WHERE NOT EXISTS",
  "messenger/menu role-section backfills must remain guarded by WHERE NOT EXISTS (non-clobbering)",
);

// Fresh installs must still get the messenger-only default for the client role,
// seeded exactly once (initDefaultRoles is guarded by an empty-roles check).
mustContain(
  setup,
  'const isMessenger = sec === "messenger";',
  "initDefaultRoles must still seed the client (viewer) role as messenger-only on first setup",
);
mustContain(
  setup,
  "await upsertRoleSection(roleId, sec, isMessenger, isMessenger);",
  "initDefaultRoles must seed messenger-only sections for the client role on first setup",
);

console.log("client role permissions persistence static ok");
