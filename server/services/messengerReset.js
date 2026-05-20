const path = require("path");
const fs = require("fs");
const { withTransaction } = require("./db");

const MESSENGER_TABLES = Object.freeze([
  "message_hidden_for_users",
  "message_receipts",
  "messages",
  "chat_files",
  "chat_participants",
  "chats",
  "user_public_keys",
  "messenger_devices",
  "messenger_sync_events",
]);

const FORBIDDEN_TABLE_PREFIXES = Object.freeze([
  "users",
  "roles",
  "role_",
  "clients",
  "stages",
  "doctors",
  "client_assignments",
  "analytics",
  "journal",
  "protocol",
  "nutrition",
  "menu",
  "dishes",
]);

function assertMessengerTableAllowlist(tables = MESSENGER_TABLES) {
  for (const table of tables) {
    const normalized = String(table || "").trim();
    if (FORBIDDEN_TABLE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(prefix))) {
      throw new Error(`Refusing protected table: ${normalized}`);
    }
    if (!MESSENGER_TABLES.includes(normalized)) {
      throw new Error(`Refusing to reset non-messenger table: ${normalized}`);
    }
  }
  return true;
}

function getChatUploadsDir() {
  return path.join(__dirname, "../uploads/chat");
}

function assertChatUploadPath(targetPath) {
  const base = path.resolve(getChatUploadsDir());
  const target = path.resolve(targetPath);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Refusing to remove non-chat upload path: ${target}`);
  }
  assertNoSymlinkPath(base);
  assertNoSymlinkPath(target);
  if (fs.existsSync(base) && fs.existsSync(target)) {
    const realBase = fs.realpathSync(base);
    const realTarget = fs.realpathSync(target);
    if (realTarget !== realBase && !realTarget.startsWith(`${realBase}${path.sep}`)) {
      throw new Error(`Refusing to remove non-chat upload path: ${realTarget}`);
    }
  }
  return true;
}

function assertNoSymlinkPath(targetPath) {
  const target = path.resolve(targetPath);
  const { root } = path.parse(target);
  const parts = path.relative(root, target).split(path.sep).filter(Boolean);
  let current = root;

  for (const part of parts) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Refusing symlinked chat upload path: ${current}`);
    }
  }

  return true;
}

function assertNoSymlinksUnder(targetPath) {
  assertChatUploadPath(targetPath);
  if (!fs.existsSync(targetPath)) {
    return true;
  }

  const stack = [targetPath];
  while (stack.length > 0) {
    const current = stack.pop();
    assertChatUploadPath(current);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing symlinked chat upload path: ${current}`);
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
    }
  }

  return true;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

async function getExistingMessengerTables(client) {
  const result = await client.query(
    `
      WITH allowed(table_name, sort_order) AS (
        SELECT * FROM unnest($1::text[]) WITH ORDINALITY
      )
      SELECT allowed.table_name
      FROM allowed
      JOIN information_schema.tables existing
        ON existing.table_schema = current_schema()
       AND existing.table_name = allowed.table_name
       AND existing.table_type = 'BASE TABLE'
      ORDER BY allowed.sort_order
    `,
    [MESSENGER_TABLES]
  );
  const tables = result.rows.map((row) => row.table_name);
  assertMessengerTableAllowlist(tables);
  return tables;
}

async function resetMessengerData({ removeFiles = false } = {}) {
  assertMessengerTableAllowlist();
  if (removeFiles) {
    assertNoSymlinksUnder(getChatUploadsDir());
  }

  await withTransaction(async (client) => {
    const existingTables = await getExistingMessengerTables(client);
    if (existingTables.length > 0) {
      await client.query(`TRUNCATE TABLE ${existingTables.map(quoteIdentifier).join(", ")} RESTART IDENTITY`);
    }
  });

  if (removeFiles) {
    const chatDir = getChatUploadsDir();
    assertNoSymlinksUnder(chatDir);
    if (fs.existsSync(chatDir)) {
      for (const entry of fs.readdirSync(chatDir)) {
        const fullPath = path.join(chatDir, entry);
        assertNoSymlinksUnder(fullPath);
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    }
  }
}

module.exports = {
  MESSENGER_TABLES,
  assertMessengerTableAllowlist,
  assertChatUploadPath,
  getChatUploadsDir,
  resetMessengerData,
};
