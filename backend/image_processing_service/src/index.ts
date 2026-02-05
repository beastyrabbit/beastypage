import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.ts";
import { errorHandler } from "./middleware/error-handler.ts";
import { routes } from "./routes/index.ts";

const app = new Hono();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use("*", cors({ origin: config.corsOrigins }));
app.use("*", errorHandler);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.route("/", routes);

// ---------------------------------------------------------------------------
// Serve
// ---------------------------------------------------------------------------
const server = Bun.serve({
  port: config.port,
  fetch: app.fetch,
  maxRequestBodySize: config.maxImageSize + 1024 * 1024, // image + overhead
});

console.log(`[image-processing] listening on http://localhost:${server.port}`);

// Graceful shutdown
function shutdown() {
  console.log("[image-processing] shutting down...");
  server.stop(true);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
