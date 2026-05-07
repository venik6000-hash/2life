process.env.MESSENGER_ENCRYPTION_SECRET =
  process.env.MESSENGER_ENCRYPTION_SECRET || "dev-secret-for-messenger-tests-32chars";

const assert = require("assert");
const { encryptText, decryptText, encryptJson, decryptJson, encryptBuffer, decryptBuffer } = require("../services/messengerCrypto");

const encryptedText = encryptText("Привет");
assert.notStrictEqual(encryptedText, "Привет");
assert.strictEqual(decryptText(encryptedText), "Привет");

const encryptedEmptyText = encryptText("");
assert.strictEqual(decryptText(encryptedEmptyText), "");

const encryptedJson = encryptJson({ files: [{ name: "a.pdf", size: 12 }] });
assert.deepStrictEqual(decryptJson(encryptedJson), { files: [{ name: "a.pdf", size: 12 }] });

const encryptedBuffer = encryptBuffer(Buffer.from([1, 2, 3]));
assert.deepStrictEqual(Array.from(decryptBuffer(encryptedBuffer)), [1, 2, 3]);

console.log("messenger crypto ok");
