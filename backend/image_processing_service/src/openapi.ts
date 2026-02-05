import { z } from "zod";

import {
  DetectGridRequest,
  DetectGridResponse,
  HealthResponse,
  ProcessRequest,
  ProcessResponse,
} from "./models.ts";

function schemaRef(name: string): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonContent(schemaName: string) {
  return { content: { "application/json": { schema: schemaRef(schemaName) } } };
}

function jsonRequestBody(schemaName: string) {
  return { required: true as const, ...jsonContent(schemaName) };
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(schema) as Record<
    string,
    unknown
  >;
  return rest;
}

const VALIDATION_ERRORS = {
  "400": { description: "Invalid request" },
  "422": { description: "Validation error" },
} as const;

export function generateOpenAPISpec(): Record<string, unknown> {
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
              ...jsonContent("HealthResponse"),
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
          requestBody: jsonRequestBody("ProcessRequest"),
          responses: {
            "200": {
              description: "Processed image and metadata",
              ...jsonContent("ProcessResponse"),
            },
            ...VALIDATION_ERRORS,
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
          requestBody: jsonRequestBody("DetectGridRequest"),
          responses: {
            "200": {
              description: "Grid detection results",
              ...jsonContent("DetectGridResponse"),
            },
            ...VALIDATION_ERRORS,
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
