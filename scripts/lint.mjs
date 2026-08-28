import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";

async function collectJsFiles(root, collector = []) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
      continue;
    }
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await collectJsFiles(candidate, collector);
      continue;
    }
    if (candidate.endsWith(".js")) {
      collector.push(candidate);
    }
  }
  return collector;
}

const files = await collectJsFiles(".");
const candidates = files.filter((candidate) => candidate.endsWith(".js"));

let issueCount = 0;

for (const file of candidates) {
  const source = await readFile(file, "utf8");
  if (/var\s+/.test(source)) {
    console.warn(`${file}: Avoid var in modern code style`);
    issueCount += 1;
  }
}

if (issueCount > 0) {
  process.exitCode = 1;
} else {
  console.log("lint: ok");
}
