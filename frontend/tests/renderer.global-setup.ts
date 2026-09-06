import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    rendererBaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const root = resolve(import.meta.dirname, "../../backend/renderer_service");
  const child = spawn(
    "uv",
    [
      "run",
      "--project",
      root,
      "--frozen",
      "--extra",
      "dev",
      "uvicorn",
      "renderer_service.app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      "0",
    ],
    {
      cwd: tmpdir(),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "test",
        LANG: "en_US.UTF-8",
        SDL_VIDEODRIVER: "dummy",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  async function stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
    try {
      await exited;
    } finally {
      clearTimeout(timeout);
    }
  }
  try {
    const baseUrl = await new Promise<string>((resolveUrl, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Owned renderer did not start")),
        60_000,
      );
      let output = "";
      const read = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-8192);
        const url = output.match(
          /Uvicorn running on (http:\/\/127\.0\.0\.1:\d+)/,
        )?.[1];
        if (url) {
          clearTimeout(timeout);
          resolveUrl(url);
        }
      };
      child.stderr.on("data", read);
      child.stdout.on("data", read);
      child.once("error", () => {
        clearTimeout(timeout);
        reject(new Error("Cannot start owned renderer"));
      });
      child.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error("Owned renderer exited before startup"));
      });
    });
    const health = await (
      await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) })
    ).json();
    const catalog = (
      await readFile(
        resolve(root, "renderer_service/generated/catalog-hash.txt"),
        "utf8",
      )
    ).trim();
    const manifest = JSON.parse(
      await readFile(
        resolve(root, "renderer_service/generated/render-plan.json"),
        "utf8",
      ),
    );
    if (
      health.catalogHash !== catalog ||
      health.manifestHash !== manifest.manifestHash
    )
      throw new Error("Owned renderer contract mismatch");
    project.provide("rendererBaseUrl", baseUrl);
    return stop;
  } catch (error) {
    await stop();
    throw error;
  }
}
