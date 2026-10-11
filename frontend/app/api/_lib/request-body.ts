/**
 * Read a request body with an explicit byte limit.
 *
 * Next's proxy body limit only bounds the cloned request and may expose a
 * truncated body to a route. Public JSON routes therefore need their own
 * limit before calling `request.text()` or `request.json()`.
 */
export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readRequestBody(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new RequestBodyTooLargeError();
    }
  }

  if (request.signal.aborted) {
    throw new DOMException("Request aborted", "AbortError");
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(new DOMException("Request aborted", "AbortError"));
      void reader.cancel().catch(() => undefined);
    };
    request.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    if (request.signal.aborted) onAbort?.();
    while (true) {
      const { done, value } = await Promise.race([reader.read(), abortPromise]);
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    if (onAbort) request.signal.removeEventListener("abort", onAbort);
    abortPromise.catch(() => undefined);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
