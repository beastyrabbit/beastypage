#!/usr/bin/env node
import { promises as fs } from "fs";
import path from "path";

async function main() {
  const source = path.resolve(process.argv[2] ?? "../backend/catdex-export-20251022-142634/images");
  const destination = path.resolve(process.argv[3] ?? "../backend/catdex-runtime/images");

  console.log(`Copying images from ${source} -> ${destination}`);
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true });
  console.log("Image sync complete.");
}

main().catch((error) => {
  console.error("Failed to sync images", error);
  process.exit(1);
});
