import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const tests = [];
const entries = await readdir("./tests", { withFileTypes: true });
for (const entry of entries) {
  if (entry.isFile() && entry.name.endsWith(".js")) {
    tests.push(`./tests/${entry.name}`);
  }
}

let failed = 0;

for (const file of tests) {
  const suite = await import(pathToFileURL(path.resolve(file)).href);
  if (typeof suite.default === "function") {
    try {
      await suite.default();
    } catch (error) {
      failed += 1;
      console.error(`[FAIL] ${file}`, error.message);
    }
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log("all tests passed");

