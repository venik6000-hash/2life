const DB_NAME = "2life-messenger";
const DB_VERSION = 1;
const STORES = ["messages", "files", "pending"];
const CACHE_PREFIX = "dash_messenger_cache_";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const writeChains = new Map();

function scopePart(scope) {
  const normalized = String(scope || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "_");
  return normalized || "anonymous";
}

function legacyKeyPrefix(scope) {
  return scope ? `${CACHE_PREFIX}${scopePart(scope)}_` : CACHE_PREFIX;
}

function removeLegacyLocalStorage(scope) {
  try {
    const prefix = legacyKeyPrefix(scope);
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const itemKey = localStorage.key(i);
      if (itemKey?.startsWith(prefix)) localStorage.removeItem(itemKey);
    }
  } catch {}
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("messages")) {
        db.createObjectStore("messages", { keyPath: "cacheKey" });
      }
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "cacheKey" });
      }
      if (!db.objectStoreNames.contains("pending")) {
        db.createObjectStore("pending", { keyPath: "cacheKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode, callback) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    let result;
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const setResult = (value) => { result = value; };

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error("IndexedDB transaction aborted"));
    };

    try {
      const callbackResult = callback(store, setResult);
      if (callbackResult !== undefined) result = callbackResult;
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  }));
}

function rowMatches(row, scope, fields = {}) {
  if (row?.scope !== scopePart(scope)) return false;
  return Object.entries(fields).every(([field, value]) => String(row?.[field]) === String(value));
}

function readRows(storeName, scope, fields = {}) {
  return tx(storeName, "readonly", (store, setResult) => {
    const rows = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        setResult(rows);
        return;
      }
      if (rowMatches(cursor.value, scope, fields)) rows.push(cursor.value);
      cursor.continue();
    };
  });
}

function replaceScopedRows(storeName, scope, fields, rows) {
  return tx(storeName, "readwrite", (store) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        for (const row of rows) store.put(row);
        return;
      }
      if (rowMatches(cursor.value, scope, fields)) cursor.delete();
      cursor.continue();
    };
  });
}

function enqueueScopedWrite(scope, operation) {
  const key = `scope:${scopePart(scope)}`;
  const previous = writeChains.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  const settled = next.catch(() => {});
  writeChains.set(key, settled);
  return next.finally(() => {
    if (writeChains.get(key) === settled) writeChains.delete(key);
  });
}

function stripCacheFields(row) {
  if (!row || typeof row !== "object") return row;
  const {
    cacheKey: _cacheKey,
    scope: _scope,
    cacheChatId: _cacheChatId,
    originalFileId: _originalFileId,
    ...value
  } = row;
  return value;
}

function messageKey(scope, chatId, message) {
  const id = message?.client_message_id || message?.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${scopePart(scope)}:message:${chatId}:${id}`;
}

function fileKey(scope, fileId) {
  return `${scopePart(scope)}:file:${fileId}`;
}

function pendingKey(scope, item) {
  return `${scopePart(scope)}:pending:${item?.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

function pruneRecentMessages(messages, now = Date.now()) {
  const minTime = now - THIRTY_DAYS_MS;
  return Array.from(messages || []).filter((message) => {
    const time = Date.parse(message?.created_at || "");
    return Number.isFinite(time) && time >= minTime;
  });
}

async function putCachedMessages(chatId, messages, scope) {
  const scoped = scopePart(scope);
  const rows = pruneRecentMessages(messages).map((message) => ({
    ...message,
    cacheKey: messageKey(scoped, chatId, message),
    scope: scoped,
    cacheChatId: String(chatId),
  }));
  await enqueueScopedWrite(scoped, async () => {
    await replaceScopedRows("messages", scoped, { cacheChatId: chatId }, rows);
    removeLegacyLocalStorage(scoped);
  });
}

export const saveCachedMessages = putCachedMessages;

export async function loadCachedMessages(chatId, scope) {
  const rows = await readRows("messages", scope, { cacheChatId: chatId });
  return rows.map(stripCacheFields);
}

export async function savePendingQueue(items, scope) {
  const scoped = scopePart(scope);
  const rows = Array.from(items || []).map((item) => ({
    ...item,
    cacheKey: pendingKey(scoped, item),
    scope: scoped,
  }));
  await enqueueScopedWrite(scoped, async () => {
    await replaceScopedRows("pending", scoped, {}, rows);
    removeLegacyLocalStorage(scoped);
  });
}

export async function loadPendingQueue(scope) {
  const rows = await readRows("pending", scope);
  return rows
    .map(stripCacheFields)
    .sort((a, b) => (Date.parse(a?.createdAt || "") || 0) - (Date.parse(b?.createdAt || "") || 0));
}

export async function saveCachedFile(fileId, blob, meta = {}, scope) {
  if (!fileId || !blob) return;
  const scoped = scopePart(scope);
  await enqueueScopedWrite(scoped, async () => {
    await tx("files", "readwrite", (store) => {
      store.put({
        cacheKey: fileKey(scoped, fileId),
        scope: scoped,
        originalFileId: String(fileId),
        blob,
        meta: meta && typeof meta === "object" ? meta : {},
        cachedAt: new Date().toISOString(),
      });
    });
  });
}

export async function loadCachedFile(fileId, scope) {
  const row = await tx("files", "readonly", (store, setResult) => {
    const req = store.get(fileKey(scope, fileId));
    req.onsuccess = () => setResult(req.result || null);
  });
  return row ? stripCacheFields(row) : null;
}

export async function clearMessengerCache(scope) {
  if (!scope) {
    for (const storeName of STORES) {
      await tx(storeName, "readwrite", (store) => store.clear());
    }
    removeLegacyLocalStorage();
    return;
  }

  const scoped = scopePart(scope);
  await enqueueScopedWrite(scoped, async () => {
    for (const storeName of STORES) {
      await replaceScopedRows(storeName, scoped, {}, []);
    }
    removeLegacyLocalStorage(scoped);
  });
}
