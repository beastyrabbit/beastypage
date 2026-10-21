import { captureException } from "@sentry/node";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, expect, test, vi } from "vitest";
import { ProcessingError } from "../utils/image.ts";
import { errorHandler } from "./error-handler.ts";

vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test.each([
  [new Error("unexpected failure"), 500, true],
  [new HTTPException(503), 503, true],
  [new DOMException("timed out", "AbortError"), 504, true],
  [new ProcessingError("invalid image"), 422, false],
  [new HTTPException(401), 401, false],
] as const)(
  "reports server errors while preserving HTTP responses: %s",
  async (error, status, reported) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = new Hono();
    app.onError(errorHandler);
    app.get("/test", () => {
      throw error;
    });
    const response = await app.request("/test");
    expect(response.status).toBe(status);
    if (reported) expect(captureException).toHaveBeenCalledWith(error);
    else expect(captureException).not.toHaveBeenCalled();
  },
);
