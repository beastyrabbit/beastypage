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
};

/** Fetch a same-origin JSON API and turn the server error contract into ApiError. */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: JsonFetchInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown;
  if (contentType.includes("application/json")) {
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
  } else {
    payload = await response.text().catch(() => undefined);
  }

  if (!response.ok) {
    const body = payload && typeof payload === "object" ? payload : null;
    const message =
      body && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed with status ${response.status}`;
    const code =
      body && "code" in body && typeof body.code === "string"
        ? body.code
        : "unknown_error";
    throw new ApiError(response.status, code, message);
  }

  return payload as T;
}
