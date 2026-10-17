export type ApiErrorCode =
  | "invalid_input"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "unavailable"
  | (string & {});

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type JsonFetchInit = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** Return null for a missing record instead of throwing ApiError. */
  nullable?: boolean;
};

async function parseResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
  return response.text().catch(() => undefined);
}

function payloadField(payload: unknown, field: string): string | undefined {
  if (!payload || typeof payload !== "object" || !(field in payload))
    return undefined;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

/** Fetch a same-origin JSON API and turn the server error contract into ApiError. */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: JsonFetchInit = {},
): Promise<T> {
  const { nullable = false, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  headers.set("Accept", "application/json");
  if (requestInit.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...requestInit,
    headers,
    body:
      requestInit.body === undefined
        ? undefined
        : JSON.stringify(requestInit.body),
  });

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    if (nullable && response.status === 404) return null as T;
    const message =
      payloadField(payload, "error") ??
      `Request failed with status ${response.status}`;
    const code = payloadField(payload, "code") ?? "unknown_error";
    throw new ApiError(response.status, code, message);
  }

  return payload as T;
}
