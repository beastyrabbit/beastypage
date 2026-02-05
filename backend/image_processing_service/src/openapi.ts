import { z } from "zod";
import {
  ProcessRequest,
  ProcessResponse,
  DetectGridRequest,
  DetectGridResponse,
  HealthResponse,
} from "./models.ts";

function schemaRef(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

function toJsonSchema(schema: z.ZodType) {
  // Strip Zod-specific keys that aren't valid OpenAPI 3.1
  const raw = z.toJSONSchema(schema);
  const { $schema, ...rest } = raw as Record<string, unknown>;
  return rest;
}

export function generateOpenAPISpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Image Processing Service",
      version: "1.0.0",
      description:
        "Pixel-art image processing pipeline — supports block averaging, " +
        "dithering, quantization, edge detection, and automatic grid detection.",
    },
    servers: [
      { url: "http://localhost:8002", description: "Local dev" },
      { url: "/api/pixelator", description: "Frontend proxy" },
    ],
    tags: [
      { name: "processing", description: "Image pipeline execution" },
      { name: "detection", description: "Automatic grid and sprite detection" },
      { name: "diagnostics", description: "Health and operational metrics" },
    ],
    paths: {
      "/health": {
        get: {
          operationId: "getHealth",
          tags: ["diagnostics"],
          summary: "Service health check",
          responses: {
            "200": {
              description: "Service status and uptime",
              content: {
                "application/json": { schema: schemaRef("HealthResponse") },
              },
            },
          },
        },
      },
      "/process": {
        post: {
          operationId: "processImage",
          tags: ["processing"],
          summary: "Run image through processing pipeline",
          description:
            "Accepts a base64 data-URL image and a list of processing steps. " +
            "Returns the processed image as a data-URL with timing metadata.",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: schemaRef("ProcessRequest") },
            },
          },
          responses: {
            "200": {
              description: "Processed image and metadata",
              content: {
                "application/json": { schema: schemaRef("ProcessResponse") },
              },
            },
            "400": { description: "Invalid request (bad image or pipeline)" },
            "422": { description: "Validation error" },
          },
        },
      },
      "/detect-grid": {
        post: {
          operationId: "detectGrid",
          tags: ["detection"],
          summary: "Detect sprite grid in an image",
          description:
            "Analyzes an image to detect if it contains a regular grid of sprites " +
            "and returns the estimated grid size and confidence score.",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: schemaRef("DetectGridRequest") },
            },
          },
          responses: {
            "200": {
              description: "Grid detection results",
              content: {
                "application/json": { schema: schemaRef("DetectGridResponse") },
              },
            },
            "400": { description: "Invalid request" },
            "422": { description: "Validation error" },
          },
        },
      },
    },
    components: {
      schemas: {
        ProcessRequest: toJsonSchema(ProcessRequest),
        ProcessResponse: toJsonSchema(ProcessResponse),
        DetectGridRequest: toJsonSchema(DetectGridRequest),
        DetectGridResponse: toJsonSchema(DetectGridResponse),
        HealthResponse: toJsonSchema(HealthResponse),
      },
    },
  };
}
