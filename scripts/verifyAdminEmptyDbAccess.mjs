/**
 * verifyAdminEmptyDbAccess.mjs — iteration-4 item 6 (static source checks)
 *
 * On an empty DB (0 clients) dashboard.jsx early-returned <NoClientsScreen/>
 * before rendering the shell/sidebar, so an admin could never open the admin
 * panel to create the first users/roles/doctors. These static assertions pin
 * the fix: the early return is bypassed for an admin in the admin section, the
 * empty screen offers an "open admin" entry point, and the shell's sidebar is
 * null-client safe so it doesn't crash when rendered without a current client.
 *
 * Usage: node scripts/verifyAdminEmptyDbAccess.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(dir, "..", rel), "utf8");

// 1. dashboard.jsx: admin in the admin section bypasses the no-clients early return.
const dash = read("src/dashboard.jsx");
assert.match(dash, /const\s+isAdmin\s*=\s*user\?\.role\s*===\s*"admin"/, "dashboard computes isAdmin");
assert.match(
  dash,
  /!\(isAdmin\s*&&\s*activeSectionId\s*===\s*"admin"\)/,
  "no-clients early return is skipped for an admin viewing the admin section",
);
assert.match(dash, /canOpenAdmin=\{isAdmin\}/, "NoClientsScreen gets canOpenAdmin");
assert.match(dash, /onOpenAdmin=\{\(\)\s*=>\s*setActiveSectionId\("admin"\)\}/, "NoClientsScreen opens the admin section");

// 2. NoClientsScreen renders the admin entry button when allowed.
const noClients = read("src/components/NoClientsScreen.jsx");
assert.match(noClients, /canOpenAdmin/, "NoClientsScreen accepts canOpenAdmin");
assert.match(noClients, /onOpenAdmin/, "NoClientsScreen accepts onOpenAdmin");
assert.match(noClients, /canOpenAdmin\s*&&[\s\S]*Открыть админку/, "admin button is gated by canOpenAdmin");

// 3. Sidebar is null-client safe (stage list only renders with a client).
const sidebar = read("src/sections/Sidebar.jsx");
assert.match(sidebar, /stages=\{so\s*&&\s*cl\s*\?/, "Sidebar guards the stage list against a null client");

// 4. SidebarClientPicker's HEADER (the selected client, which can be null)
//    tolerates a null client. The menu items below map over the clients array
//    (always real items), so their client.* derefs are intentionally untouched.
const picker = read("src/components/SidebarClientPicker.jsx");
assert.match(picker, /<ClientAvatar color=\{client\?\.color\} avatar=\{client\?\.avatar\} \/>/, "picker header reads client?.color/avatar (null-safe)");
assert.match(picker, /client\s*\?\s*client\.shortName\s*:/, "picker header shows a placeholder when no client");

console.log("✓ dashboard bypasses no-clients screen for admin in admin section");
console.log("✓ NoClientsScreen offers an admin entry point");
console.log("✓ sidebar shell is null-client safe");
console.log("\nALL ADMIN-EMPTY-DB-ACCESS STATIC CHECKS PASSED");
