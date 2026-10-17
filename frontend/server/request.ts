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
 * Parse a JSON body through `schema`. Public routes pass `maxBytes`, which
 * reads the body with that limit first; `emptyBody` is used for an empty body.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  options: { maxBytes?: number; emptyBody?: unknown } = {},
): Promise<T> {
  let body: unknown;
  try {
    const raw =
      options.maxBytes === undefined
        ? await request.text()
        : await readRequestBody(request, options.maxBytes);
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
