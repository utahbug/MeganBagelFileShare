import assert from "node:assert/strict";
import { randomId, deriveKey, encryptBuffer, decryptBuffer, toBase64, fromBase64, humanBytes } from "../src/utils/crypto.js";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

export default async function run() {
  const id = randomId();
  assert.match(id, /^[A-Za-z0-9]+$/);
  assert.ok(id.length >= 8);

  const salt = toBase64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
  const key = await deriveKey("secret", salt);
  const payload = new TextEncoder().encode("hello-world").buffer;
  const encrypted = await encryptBuffer(payload, key);
  const decrypted = await decryptBuffer(encrypted, key);
  assert.equal(new TextDecoder().decode(decrypted), "hello-world");

  const decoded = fromBase64(toBase64(new Uint8Array([9, 8, 7])));
  assert.equal(decoded.length, 3);

  const size = humanBytes(3 * 1024 * 1024);
  assert.equal(size.endsWith("MB"), true);

  console.log("crypto.test passed");
}

