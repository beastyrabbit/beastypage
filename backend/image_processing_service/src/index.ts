import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
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
const server = serve({
  fetch: app.fetch,
  port: config.port,
});

console.log(`[image-processing] listening on http://localhost:${config.port}`);

// Graceful shutdown
function shutdown() {
  console.log("[image-processing] shutting down...");
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
