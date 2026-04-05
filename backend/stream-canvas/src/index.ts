import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import { config } from "./config.ts";
import { api } from "./routes.ts";
import { closeAllRooms, handleWebSocketUpgrade } from "./ws-handler.ts";

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono();

app.use("*", cors({ origin: config.corsOrigins }));
app.route("/", api);

// ---------------------------------------------------------------------------
// HTTP server + WebSocket upgrade
// ---------------------------------------------------------------------------

const server = serve({ fetch: app.fetch, port: config.port });

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);

  // Only upgrade requests to /ws
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    handleWebSocketUpgrade(ws, req);
  });
});

console.log(`[stream-canvas] listening on http://localhost:${config.port}`);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown() {
  console.log("[stream-canvas] shutting down...");
  closeAllRooms();
  wss.close();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
