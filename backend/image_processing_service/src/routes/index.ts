import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ProcessRequest,
  DetectGridRequest,
  HealthResponse,
} from "../models.ts";
import { executePipeline } from "../pipeline/executor.ts";
import { detectGrid } from "../detection/grid-detector.ts";
import {
  parseDataUrl,
  bufferToDataUrl,
  validateDimensions,
  downscaleForPreview,
} from "../utils/image.ts";
import { config } from "../config.ts";
import { generateOpenAPISpec } from "../openapi.ts";

const startTime = Date.now();

export const routes = new Hono();

// ---------------------------------------------------------------------------
// GET /openapi.json
// ---------------------------------------------------------------------------
routes.get("/openapi.json", (c) => {
  return c.json(generateOpenAPISpec());
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
    const start = performance.now();
    const req = c.req.valid("json");

    const { buffer: rawBuffer } = parseDataUrl(req.image);
    await validateDimensions(rawBuffer);

    // Preview mode: downscale before processing
    let imageBuffer = rawBuffer;
    if (req.mode === "preview") {
      const result = await downscaleForPreview(rawBuffer, config.previewMaxDimension);
      imageBuffer = result.buffer;
    }

    const { result, stepsProcessed, width, height } = await executePipeline(
      imageBuffer,
      req.pipeline.steps,
      req.outputFormat,
      req.outputQuality,
    );

    const dataUrl = bufferToDataUrl(result, req.outputFormat);
    const duration = Math.round(performance.now() - start);

    return c.json({
      image: dataUrl,
      meta: {
        duration_ms: duration,
        width,
        height,
        steps_processed: stepsProcessed,
      },
    });
  },
);

// ---------------------------------------------------------------------------
// POST /detect-grid
// ---------------------------------------------------------------------------
routes.post(
  "/detect-grid",
  zValidator("json", DetectGridRequest),
  async (c) => {
    const req = c.req.valid("json");
    const { buffer } = parseDataUrl(req.image);
    await validateDimensions(buffer);

    const result = await detectGrid(buffer);
    return c.json(result);
  },
);
