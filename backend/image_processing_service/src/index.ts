import { Hono } from "hono";
import { captureException, flush } from "@sentry/node";
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
app.onError(errorHandler);

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
let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[image-processing] shutting down...");
  // Stop accepting new requests, then let in-flight worker requests finish
  // before terminating. Calling process.exit immediately here aborts worker
  // threads and can leave clients with truncated responses.
  server.close(async (error) => {
    if (error) {
      captureException(error);
      console.error("[image-processing] failed to close server", error);
      process.exitCode = 1;
    }
    await flush(2000);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
