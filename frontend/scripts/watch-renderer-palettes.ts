import { spawn } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const paletteDir = path.resolve(__dirname, "../lib/palettes");
const generatorScript = path.resolve(__dirname, "./generate-cat-system.ts");

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight = false;
let syncQueued = false;

async function runSync(reason: string) {
  if (syncInFlight) {
    syncQueued = true;
    return false;
  }

  syncInFlight = true;
  const startedAt = Date.now();
  try {
    // The generator owns both the renderer JSON sync and every catalog-hash
    // artifact. Running it as one unit prevents the watcher from producing a
    // palette/runtime contract combination that can never pass startup.
    const proc = spawn("tsx", [generatorScript], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    const exitCode = await new Promise<number>((resolve, reject) => {
      proc.on("close", (code) => resolve(code ?? 1));
      proc.on("error", (err) => reject(err));
    });
    if (exitCode !== 0) {
      console.error(
        `[palette-watch] sync failed after ${reason} (exit ${exitCode})`,
      );
      return false;
    } else {
      const duration = Date.now() - startedAt;
      console.log(
        `[palette-watch] synced renderer palettes and cat-system contract after ${reason} in ${duration}ms`,
      );
      return true;
    }
  } catch (error) {
    console.error("[palette-watch] sync crashed", error);
    return false;
  } finally {
    syncInFlight = false;
    if (syncQueued) {
      syncQueued = false;
      void runSync("queued change");
    }
  }
}

function scheduleSync(reason: string) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void runSync(reason);
  }, 120);
}

(async () => {
  console.log(`[palette-watch] watching ${paletteDir}`);
  if (!(await runSync("startup"))) {
    throw new Error("Initial renderer palette sync failed");
  }

  const watcher = watch(
    paletteDir,
    { recursive: true },
    (_eventType, filename) => {
      if (!filename) return;
      if (!/\.(ts|tsx|json)$/.test(filename)) return;
      scheduleSync(String(filename));
    },
  );

  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    watcher.close();
    process.exit(0);
  });
})().catch((err) => {
  console.error("[palette-watch] fatal startup error", err);
  process.exit(1);
});
