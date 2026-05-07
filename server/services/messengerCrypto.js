const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey() {
  const secret = process.env.MESSENGER_ENCRYPTION_SECRET || "";
  if (secret.length < 32) {
    throw new Error("MESSENGER_ENCRYPTION_SECRET must be at least 32 characters");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptBuffer(buffer) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(Buffer.from(buffer)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptBuffer(payload) {
  const raw = Buffer.from(String(payload || ""), "base64");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new Error("Invalid encrypted payload");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function encryptJson(value) {
  return encryptBuffer(Buffer.from(JSON.stringify(value ?? null), "utf8"));
}

function decryptJson(payload) {
  return JSON.parse(decryptBuffer(payload).toString("utf8"));
}

function encryptText(value) {
  return encryptBuffer(Buffer.from(String(value ?? ""), "utf8"));
}

function decryptText(payload) {
  return decryptBuffer(payload).toString("utf8");
}

module.exports = { encryptBuffer, decryptBuffer, encryptJson, decryptJson, encryptText, decryptText };
