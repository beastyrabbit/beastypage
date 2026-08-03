import { mkdir } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
await mkdir(config.tempDir, { recursive: true, mode: 0o700 });
const { app, store, worker } = createApp(config);
await store.ensureBucket();

const server = serve({
	fetch: app.fetch,
	port: config.port,
	hostname: "0.0.0.0",
});

console.log(`[quick-share] listening on port ${config.port}`);

function shutdown() {
	worker.stop();
	server.close(() => process.exit(0));
	setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
