/**
 * E2E encryption utilities using Web Crypto API (browser-native).
 *
 * Identity private key wrapping: AES-GCM 256 (derived via PBKDF2 from password).
 * Chat key wrapping (ECDH-based): AES-KW — works reliably for fixed-size AES keys.
 * Message/file encryption: AES-GCM 256.
 */

const subtle = window.crypto.subtle;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// ─── PBKDF2: password → AES-GCM wrapping key ─────────────────────────────────

/**
 * Derive a 256-bit AES-GCM key from password + salt.
 * Used to encrypt/decrypt the ECDH identity private key at rest.
 */
export const deriveWrappingKey = async (password, salt /* Uint8Array */) => {
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// ─── ECDH identity key pair ───────────────────────────────────────────────────

export const generateIdentityKeyPair = () =>
  subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);

export const exportPublicKeyJwk = async (publicKey) =>
  JSON.stringify(await subtle.exportKey("jwk", publicKey));

/**
 * Encrypt the ECDH private key as JWK, then AES-GCM encrypt the JSON bytes.
 * Returns base64(ciphertext). The IV is generated internally and returned separately.
 */
export const wrapPrivateKey = async (privateKey, wrappingKey) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const jwk = await subtle.exportKey("jwk", privateKey);
  const plaintext = new TextEncoder().encode(JSON.stringify(jwk));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, plaintext);
  return { wrapped: b64(ciphertext), iv: b64(iv) };
};

/**
 * Decrypt an AES-GCM-encrypted ECDH private key.
 * wrappedB64: base64 ciphertext; ivB64: base64 IV.
 */
export const unwrapPrivateKey = async (wrappedB64, wrappingKey, ivB64) => {
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: unb64(ivB64) },
    wrappingKey,
    unb64(wrappedB64)
  );
  const jwk = JSON.parse(new TextDecoder().decode(plaintext));
  return subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
};

export const importPublicKeyJwk = (jwkStr) =>
  subtle.importKey(
    "jwk",
    typeof jwkStr === "string" ? JSON.parse(jwkStr) : jwkStr,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

// ─── Chat key (AES-GCM 256) ───────────────────────────────────────────────────

export const generateChatKey = () =>
  subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

/**
 * Wrap a chat's AES-GCM key for a recipient using ECDH shared secret + AES-KW.
 * AES keys have fixed 32-byte size — reliable for AES-KW.
 */
export const wrapChatKeyForParticipant = async (myPrivateKey, theirPublicKey, chatKey) => {
  const sharedKey = await subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey"]
  );
  const wrapped = await subtle.wrapKey("raw", chatKey, sharedKey, { name: "AES-KW" });
  return b64(wrapped);
};

export const unwrapChatKey = async (myPrivateKey, senderPublicKey, wrappedB64) => {
  const sharedKey = await subtle.deriveKey(
    { name: "ECDH", public: senderPublicKey },
    myPrivateKey,
    { name: "AES-KW", length: 256 },
    false,
    ["unwrapKey"]
  );
  return subtle.unwrapKey(
    "raw",
    unb64(wrappedB64),
    sharedKey,
    { name: "AES-KW" },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

// ─── Message encrypt / decrypt ────────────────────────────────────────────────

export const encryptMessage = async (chatKey, plaintext) => {
  const iv  = window.crypto.getRandomValues(new Uint8Array(12));
  const buf = await subtle.encrypt({ name: "AES-GCM", iv }, chatKey, new TextEncoder().encode(plaintext));
  return { ciphertext: b64(buf), iv: b64(iv) };
};

export const decryptMessage = async (chatKey, ciphertextB64, ivB64) => {
  try {
    const buf = await subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB64) }, chatKey, unb64(ciphertextB64));
    return new TextDecoder().decode(buf);
  } catch {
    return null;
  }
};

// ─── File encrypt / decrypt ───────────────────────────────────────────────────

export const encryptFile = async (chatKey, arrayBuffer) => {
  const iv  = window.crypto.getRandomValues(new Uint8Array(12));
  const buf = await subtle.encrypt({ name: "AES-GCM", iv }, chatKey, arrayBuffer);
  return { encrypted: buf, iv: b64(iv) };
};

export const decryptFile = async (chatKey, encryptedBuffer, ivB64) => {
  try {
    return await subtle.decrypt({ name: "AES-GCM", iv: unb64(ivB64) }, chatKey, encryptedBuffer);
  } catch {
    return null;
  }
};

// ─── Full key setup flow ──────────────────────────────────────────────────────

/**
 * Generate a new identity key pair and wrap the private key with the user's password.
 * Stores everything needed on the server + returns raw keys for in-memory use.
 */
export const setupIdentityKeys = async (password) => {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const wrappingKey = await deriveWrappingKey(password, salt);
  const keyPair = await generateIdentityKeyPair();
  const publicKeyJwk = await exportPublicKeyJwk(keyPair.publicKey);
  const { wrapped: encryptedPrivateKeyJwk, iv: keyDerivationIv } = await wrapPrivateKey(keyPair.privateKey, wrappingKey);

  return {
    keyPair,
    publicKeyJwk,
    encryptedPrivateKeyJwk,
    keyDerivationSalt: b64(salt),
    keyDerivationIv,
  };
};

/**
 * Recover identity key pair from server-stored encrypted bundle using password.
 * Throws on wrong password (AES-GCM decrypt will fail with OperationError).
 */
export const recoverIdentityKeys = async (password, bundle) => {
  const { public_key_jwk, encrypted_private_key_jwk, key_derivation_salt, key_derivation_iv } = bundle;
  const salt = unb64(key_derivation_salt);
  const wrappingKey = await deriveWrappingKey(password, salt);
  const privateKey = await unwrapPrivateKey(encrypted_private_key_jwk, wrappingKey, key_derivation_iv);
  const publicKey  = await importPublicKeyJwk(public_key_jwk);
  return { keyPair: { privateKey, publicKey } };
};

export const rewrapPrivateKey = async (privateKey, newPassword) => {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const wrappingKey = await deriveWrappingKey(newPassword, salt);
  const { wrapped: encryptedPrivateKeyJwk, iv: keyDerivationIv } = await wrapPrivateKey(privateKey, wrappingKey);
  return { encryptedPrivateKeyJwk, keyDerivationSalt: b64(salt), keyDerivationIv };
};
