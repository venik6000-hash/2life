const crypto = require("crypto");

const PBKDF2_ITERATIONS = 600000;
const GCM_TAG_BYTES = 16;

const getRecoverySecret = () => {
  const secret = process.env.MESSENGER_RECOVERY_SECRET || process.env.JWT_SECRET || "";
  if (!secret) {
    throw new Error("Recovery secret is not configured");
  }
  return secret;
};

const getRecoveryKey = () => (
  crypto.createHash("sha256").update(String(getRecoverySecret())).digest()
);

const encryptAesGcmToB64 = (plaintextUtf8, key, iv) => {
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(String(plaintextUtf8), "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ciphertext, tag]).toString("base64");
};

const decryptAesGcmFromB64 = (combinedB64, key, ivB64) => {
  const combined = Buffer.from(String(combinedB64), "base64");
  if (combined.length <= GCM_TAG_BYTES) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = Buffer.from(String(ivB64), "base64");
  const ciphertext = combined.subarray(0, combined.length - GCM_TAG_BYTES);
  const tag = combined.subarray(combined.length - GCM_TAG_BYTES);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};

const encryptPrivateKeyForRecovery = (privateKeyJwk) => {
  const key = getRecoveryKey();
  const iv = crypto.randomBytes(12);
  return {
    recoveryEncryptedPrivateKeyJwk: encryptAesGcmToB64(privateKeyJwk, key, iv),
    recoveryKeyIv: iv.toString("base64"),
  };
};

const decryptPrivateKeyFromRecovery = (recoveryEncryptedPrivateKeyJwk, recoveryKeyIv) => {
  const key = getRecoveryKey();
  return decryptAesGcmFromB64(recoveryEncryptedPrivateKeyJwk, key, recoveryKeyIv);
};

const wrapPrivateKeyForPassword = (privateKeyJwk, password) => {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const passwordKey = crypto.pbkdf2Sync(
    Buffer.from(String(password), "utf8"),
    salt,
    PBKDF2_ITERATIONS,
    32,
    "sha256"
  );

  return {
    encryptedPrivateKeyJwk: encryptAesGcmToB64(privateKeyJwk, passwordKey, iv),
    keyDerivationSalt: salt.toString("base64"),
    keyDerivationIv: iv.toString("base64"),
  };
};

const decryptPrivateKeyFromPassword = (
  encryptedPrivateKeyJwk,
  keyDerivationSalt,
  keyDerivationIv,
  password
) => {
  const passwordKey = crypto.pbkdf2Sync(
    Buffer.from(String(password), "utf8"),
    Buffer.from(String(keyDerivationSalt), "base64"),
    PBKDF2_ITERATIONS,
    32,
    "sha256"
  );
  return decryptAesGcmFromB64(encryptedPrivateKeyJwk, passwordKey, keyDerivationIv);
};

const publicJwkFromPrivateJwk = (privateKeyJwk) => {
  const jwk = typeof privateKeyJwk === "string" ? JSON.parse(privateKeyJwk) : privateKeyJwk;
  if (!jwk || !jwk.kty || !jwk.crv || !jwk.x || !jwk.y) {
    throw new Error("Invalid private key JWK");
  }
  return JSON.stringify({
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    ext: true,
    key_ops: [],
  });
};

const publicJwkFromRecovery = (recoveryEncryptedPrivateKeyJwk, recoveryKeyIv) => {
  const privateKeyJwk = decryptPrivateKeyFromRecovery(recoveryEncryptedPrivateKeyJwk, recoveryKeyIv);
  return publicJwkFromPrivateJwk(privateKeyJwk);
};

module.exports = {
  encryptPrivateKeyForRecovery,
  decryptPrivateKeyFromRecovery,
  wrapPrivateKeyForPassword,
  decryptPrivateKeyFromPassword,
  publicJwkFromPrivateJwk,
  publicJwkFromRecovery,
};
