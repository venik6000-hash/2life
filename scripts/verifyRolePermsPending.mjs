/**
 * verifyRolePermsPending.mjs — iteration-4 item 5 (frontend side)
 *
 * handleSaveRolePerms used to `delete pendingRoleChanges[roleId]` after the save
 * resolved, dropping any checkbox clicks the admin made WHILE the save was in
 * flight (a local lost update). subtractSavedRoleChanges removes only the fields
 * that were actually saved, preserving mid-save edits.
 *
 * Usage: node scripts/verifyRolePermsPending.mjs
 */
import assert from "node:assert/strict";
import { subtractSavedRoleChanges } from "../src/utils/rolePermsPending.js";

// 1. Everything saved → entry removed entirely.
{
  const pending = { 7: { sections: { journal: { read: true } }, permissions: { delete_client: true } } };
  const saved = { sections: { journal: { read: true } }, permissions: { delete_client: true } };
  const next = subtractSavedRoleChanges(pending, 7, saved);
  assert.equal(next[7], undefined, "fully-saved role entry is removed");
  console.log("✓ fully-saved entry removed");
}

// 2. A field re-toggled DURING the save is preserved (the lost-update fix).
{
  const saved = { sections: { journal: { read: true } } };
  // While saving read:true, the admin also ticked write (and the live pending now
  // holds read:true + write:true). Only read was saved; write must survive.
  const pending = { 7: { sections: { journal: { read: true, write: true } } } };
  const next = subtractSavedRoleChanges(pending, 7, saved);
  assert.deepEqual(next[7], { sections: { journal: { write: true } } }, "mid-save write click preserved");
  console.log("✓ field changed during save is preserved");
}

// 3. A field changed to a DIFFERENT value during the save is kept (not dropped).
{
  const saved = { sections: { analytics: { read: true } } };
  const pending = { 3: { sections: { analytics: { read: false } } } }; // admin un-ticked during save
  const next = subtractSavedRoleChanges(pending, 3, saved);
  assert.deepEqual(next[3], { sections: { analytics: { read: false } } }, "re-toggled value kept");
  console.log("✓ value re-toggled during save is kept");
}

// 4. A whole new section/permission added during the save survives.
{
  const saved = { sections: { journal: { read: true } } };
  const pending = { 9: { sections: { journal: { read: true }, menu: { read: true } }, permissions: { import_data: true } } };
  const next = subtractSavedRoleChanges(pending, 9, saved);
  assert.deepEqual(
    next[9],
    { sections: { menu: { read: true } }, permissions: { import_data: true } },
    "untouched-by-save section + permission survive",
  );
  console.log("✓ sections/permissions not part of the save survive");
}

// 5. No pending entry → unchanged (no throw).
{
  const pending = { 1: { sections: { journal: { read: true } } } };
  assert.equal(subtractSavedRoleChanges(pending, 42, { sections: {} }), pending, "missing roleId is a no-op");
  console.log("✓ missing roleId is a no-op");
}

console.log("\nALL ROLE-PERMS-PENDING TESTS PASSED");
