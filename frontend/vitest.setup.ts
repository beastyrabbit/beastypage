import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_BASE_URL = 'http://127.0.0.1:8001';
const baseUrl = process.env.RENDERER_BASE_URL ?? DEFAULT_BASE_URL;
const shouldAutostart = process.env.CG3_SKIP_RENDERER_BOOT !== '1';

process.env.RENDERER_BASE_URL = baseUrl;
process.env.NEXT_PUBLIC_RENDERER_URL ??= baseUrl;

let serverProcess: ReturnType<typeof spawn> | null = null;

async function isServerHealthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/health`, { cache: 'no-store' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function waitForServer(url: string, retries = 60, delayMs = 500): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (await isServerHealthy(url)) {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }
  throw new Error('Renderer service did not become healthy in time');
}

beforeAll(async () => {
  if (!shouldAutostart) {
    return;
  }

  if (await isServerHealthy(baseUrl)) {
    return;
  }

  const parsedUrl = new URL(baseUrl);
  const port = parsedUrl.port || '8001';

  serverProcess = spawn(
    process.execPath,
    ['run', 'backend:test-server'],
    {
      cwd: resolve(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        CG3_RENDERER_PORT: port,
      },
    }
  );

  serverProcess.on('error', (error) => {
    console.error('Failed to start renderer service via uv:', error);
  });

  await waitForServer(baseUrl);
}, 60_000);

afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGINT');
    serverProcess = null;
  }
});

process.on('exit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGINT');
  }
});
