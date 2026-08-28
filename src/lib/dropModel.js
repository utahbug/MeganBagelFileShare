import { humanBytes } from "../utils/crypto.js";

export function createDropEnvelope(name, passwordSaltBase64, files) {
  const createdAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    name,
    createdAt,
    salt: passwordSaltBase64,
    files,
    status: "active",
  };
}

export function formatDropAge(createdAt) {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - created) / 1000));
  if (seconds < 60) return "created just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minute${Math.floor(seconds / 60) === 1 ? "" : "s"} old`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hour${Math.floor(seconds / 3600) === 1 ? "" : "s"} old`;
  if (seconds < 172800) return "1 day old";
  return `${Math.floor(seconds / 86400)} days old`;
}

export function totalsFromFiles(files) {
  const fileCount = files.length;
  const bytes = files.reduce((acc, file) => acc + (Number(file.size) || 0), 0);
  return {
    fileCount,
    bytes,
    human: humanBytes(bytes),
  };
}

