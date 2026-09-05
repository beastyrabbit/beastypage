import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ProcessRequest,
  DetectGridRequest,
  HealthResponse,
} from "../models.ts";
import { runJob } from "../workers.ts";
import { bodyLimit } from "hono/body-limit";
import { config } from "../config.ts";
import { generateOpenAPISpec } from "../openapi.ts";

const startTime = Date.now();
const openApiSpec = generateOpenAPISpec();

export const routes = new Hono();
routes.use("*", bodyLimit({ maxSize: Math.ceil(config.maxImageSize * 4 / 3) + 65_536 }));

// ---------------------------------------------------------------------------
// GET /openapi.json
// ---------------------------------------------------------------------------
routes.get("/openapi.json", (c) => {
  return c.json(openApiSpec);
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
routes.get("/health", (c) => {
  const body: z.infer<typeof HealthResponse> = {
    status: "ok",
    uptime: Date.now() - startTime,
    version: "1.0.0",
    memory: { used: process.memoryUsage().rss },
  };
  return c.json(body);
});

// ---------------------------------------------------------------------------
// POST /process
// ---------------------------------------------------------------------------
routes.post(
  "/process",
  zValidator("json", ProcessRequest),
  async (c) => {
    return c.json(await runJob("process", c.req.valid("json"), c.req.raw.signal));
  },
);

// ---------------------------------------------------------------------------
// POST /detect-grid
// ---------------------------------------------------------------------------
routes.post(
  "/detect-grid",
  zValidator("json", DetectGridRequest),
  async (c) => {
    return c.json(await runJob("detect", c.req.valid("json"), c.req.raw.signal));
  },
);
