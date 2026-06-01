import { spawn } from "node:child_process";
import { closeSync, openSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_BASE_URL = "http://127.0.0.1:8001";
const baseUrl = process.env.RENDERER_BASE_URL ?? DEFAULT_BASE_URL;
const shouldAutostart = process.env.CG3_SKIP_RENDERER_BOOT !== "1";

process.env.RENDERER_BASE_URL = baseUrl;
process.env.NEXT_PUBLIC_RENDERER_URL ??= baseUrl;

let serverProcess: ReturnType<typeof spawn> | null = null;
let rendererLockFd: number | null = null;
let rendererLockPath: string | null = null;

function tryAcquireRendererLock(port: string): boolean {
  rendererLockPath = join(tmpdir(), `beastypage-renderer-${port}.lock`);
  try {
    rendererLockFd = openSync(rendererLockPath, "wx");
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      return false;
    }
    throw error;
  }
}

function releaseRendererLock() {
  if (rendererLockFd !== null) {
    closeSync(rendererLockFd);
    rendererLockFd = null;
  }
  if (rendererLockPath) {
    try {
      unlinkSync(rendererLockPath);
    } catch (_error) {
      // Another process may have already cleaned up the lock.
    }
    rendererLockPath = null;
  }
}

async function isServerHealthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/health`, {
      cache: "no-store",
    });
    return response.ok;
  } catch (_error) {
    return false;
  }
}

async function waitForServer(
  url: string,
  retries = 60,
  delayMs = 500,
): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (await isServerHealthy(url)) {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }
  throw new Error("Renderer service did not become healthy in time");
}

beforeAll(async () => {
  if (!shouldAutostart) {
    return;
  }

  if (await isServerHealthy(baseUrl)) {
    return;
  }

  const parsedUrl = new URL(baseUrl);
  const host = parsedUrl.hostname || "127.0.0.1";
  const port = parsedUrl.port || "8001";

  if (!tryAcquireRendererLock(port)) {
    await waitForServer(baseUrl);
    return;
  }

  serverProcess = spawn(
    "uv",
    [
      "run",
      "--extra",
      "dev",
      "uvicorn",
      "renderer_service.app.main:app",
      "--host",
      host,
      "--port",
      port,
    ],
    {
      cwd: resolve(__dirname, "../backend/renderer_service"),
      stdio: "inherit",
      env: {
        ...process.env,
        CG3_RENDERER_PORT: port,
      },
    },
  );

  serverProcess.on("error", (error) => {
    console.error("Failed to start renderer service via uv:", error);
  });
  serverProcess.on("exit", releaseRendererLock);

  await waitForServer(baseUrl);
}, 60_000);

afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill("SIGINT");
    serverProcess = null;
  }
  releaseRendererLock();
});

process.on("exit", () => {
  if (serverProcess) {
    serverProcess.kill("SIGINT");
  }
  releaseRendererLock();
});
