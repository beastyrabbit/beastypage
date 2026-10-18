import "server-only";

import type { ZodType } from "zod";
import {
  RequestBodyTooLargeError,
  readRequestBody,
} from "@/app/api/_lib/request-body";
import { ServiceError } from "./errors";

function invalidInput(message = "Invalid request input"): ServiceError {
  return new ServiceError("invalid_input", message);
}

/**
 * Largest JSON body a route accepts unless it passes its own `maxBytes`.
 * PostgreSQL capped every stored document at 1 MiB, so no request that writes one
 * legitimately comes close; the largest stored JSON value is about 10 KB.
 */
export const DEFAULT_JSON_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Parse a JSON body through `schema`, reading at most `maxBytes` first;
 * `emptyBody` is used for an empty body.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  options: { maxBytes?: number; emptyBody?: unknown } = {},
): Promise<T> {
  let body: unknown;
  try {
    const raw = await readRequestBody(
      request,
      options.maxBytes ?? DEFAULT_JSON_BODY_BYTES,
    );
    body =
      options.emptyBody !== undefined && !raw.trim()
        ? options.emptyBody
        : JSON.parse(raw);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      throw new ServiceError("payload_too_large", "Request body is too large");
    if (error instanceof DOMException && error.name === "AbortError")
      throw new ServiceError("aborted", "Request aborted");
    throw invalidInput("Invalid JSON body");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw invalidInput("Invalid request body");
  return parsed.data;
}

export function parseSearchParams<T>(
  params: Pick<URLSearchParams, "keys" | "getAll">,
  schema: ZodType<T>,
): T {
  const values: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    values[key] = all.length > 1 ? all : (all[0] ?? "");
  }
  const parsed = schema.safeParse(values);
  if (!parsed.success) throw invalidInput("Invalid query parameters");
  return parsed.data;
}
