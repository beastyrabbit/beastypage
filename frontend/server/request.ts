import "server-only";

import { z, type ZodType } from "zod";
import { ServiceError } from "./errors";

function invalidInput(message = "Invalid request input"): ServiceError {
  return new ServiceError("invalid_input", message);
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
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

export const parseRequestJson = parseJsonBody;
export const parseRequestSearchParams = parseSearchParams;

export { z };
