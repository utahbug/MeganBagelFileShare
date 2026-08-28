const encoder = new TextEncoder();
const decoder = new TextDecoder();
const btoaFn = typeof btoa === "function" ? btoa : (value) => Buffer.from(value, "binary").toString("base64");
const atobFn = typeof atob === "function" ? atob : (value) => Buffer.from(value, "base64").toString("binary");

const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function randomId(bytes = 16) {
  const values = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (b) => CHARS[b % CHARS.length]).join("");
}

export async function deriveKey(password, saltBase64) {
  const salt = fromBase64(saltBase64);
  const passwordBuffer = encoder.encode(password);
  const baseKey = await globalThis.crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 150000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBuffer(buffer, key, iv = randomBytes(12)) {
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    buffer,
  );
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ct)),
  };
}

export async function decryptBuffer(payload, key) {
  const iv = fromBase64(payload.iv);
  const ciphertext = fromBase64(payload.ciphertext);
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new Uint8Array(plain);
}

export async function encryptTextObject(obj, key) {
  const data = encoder.encode(JSON.stringify(obj));
  const packed = await encryptBuffer(data.buffer, key);
  return packed;
}

export async function decryptTextObject(payload, key) {
  const plain = await decryptBuffer(payload, key);
  return JSON.parse(decoder.decode(plain));
}

export async function readFileAsArrayBuffer(file) {
  return await file.arrayBuffer();
}

export function toBase64(bytes) {
  if (bytes instanceof ArrayBuffer) {
    return toBase64(new Uint8Array(bytes));
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    const slice = bytes.subarray(i, i + 0x8000);
    binary += String.fromCharCode(...slice);
  }
  return btoaFn(binary);
}

export function fromBase64(base64) {
  const binary = atobFn(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function humanBytes(n) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(n);
  if (!Number.isFinite(value)) {
    return "0 B";
  }
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || value < 1 ? 0 : 1)} ${units[i]}`;
}

export function randomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
