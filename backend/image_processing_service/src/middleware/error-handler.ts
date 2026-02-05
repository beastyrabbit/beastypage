import type { Context, Next } from "hono";
import { ZodError } from "zod";
import { ProcessingError } from "../utils/image.ts";

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
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
      return c.json({ error: "Request timed out" }, 504);
    }

    console.error("[error-handler] unhandled error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
