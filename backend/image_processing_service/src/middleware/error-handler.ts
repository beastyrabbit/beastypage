import { captureException } from "@sentry/node";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { ProcessingError } from "../utils/image.ts";

export function errorHandler(error: Error, c: Context) {
  if (error instanceof ZodError) {
    return c.json(
      { error: "Validation failed", details: error.issues },
      400,
    );
  }

  if (error instanceof ProcessingError) {
    return c.json({ error: error.message }, 422);
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    captureException(error);
    return c.json({ error: "Request timed out" }, 504);
  }

  if (error instanceof HTTPException) {
    if (error.status >= 500) captureException(error);
    return error.getResponse();
  }

  captureException(error);
  console.error("[error-handler] unhandled error:", error);
  return c.json({ error: "Internal server error" }, 500);
}
