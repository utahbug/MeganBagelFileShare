import { mkdir, copyFile, rm, readdir } from "node:fs/promises";
import path from "node:path";

const sourceRoot = process.cwd();
const dist = path.join(sourceRoot, "dist");

async function copyRecursive(source, destination) {
  await mkdir(destination, { recursive: true });
  const items = await readdir(source, { withFileTypes: true });
  for (const item of items) {
    if (
      item.name === ".git" ||
      item.name === "node_modules" ||
      item.name === "dist" ||
      item.name === ".github" ||
      item.name === "tests"
    ) {
      continue;
    }
    const sourcePath = path.join(source, item.name);
    const destinationPath = path.join(destination, item.name);
    if (item.isDirectory()) {
      await copyRecursive(sourcePath, destinationPath);
    } else {
      await copyFile(sourcePath, destinationPath);
    }
  }
}

await rm(dist, { force: true, recursive: true });
await mkdir(dist, { recursive: true });
await copyRecursive(sourceRoot, dist);
console.log("build complete -> dist");
