import assert from "node:assert/strict";
import { getDropIdFromLocation, shareUrlForId } from "../src/utils/routing.js";

export default async function run() {
  const originalWindow = globalThis.window;
  globalThis.window = { location: { pathname: "/drop/abc123", search: "", origin: "https://example.com" } };
  const id = getDropIdFromLocation();
  assert.equal(id, "abc123");

  globalThis.window.location = { pathname: "/", search: "?d=def456", origin: "https://example.com" };
  const queryId = getDropIdFromLocation();
  assert.equal(queryId, "def456");

  const share = shareUrlForId("abc123");
  assert.ok(share.includes("/share/abc123"));

  globalThis.window = originalWindow;
  console.log("url.test passed");
}
