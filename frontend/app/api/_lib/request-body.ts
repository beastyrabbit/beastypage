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

function validateDeclaredLength(request: Request, maxBytes: number): void {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return;

  const declaredLength = Number(contentLength);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }
}

function throwIfAborted(request: Request): void {
  if (request.signal.aborted) {
    throw new DOMException("Request aborted", "AbortError");
  }
}

function createAbortPromise(
  request: Request,
  reader: ReadableStreamDefaultReader<Uint8Array>,
): { promise: Promise<never>; onAbort: () => void } {
  let onAbort!: () => void;
  const promise = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(new DOMException("Request aborted", "AbortError"));
      void reader.cancel().catch(() => undefined);
    };
    request.signal.addEventListener("abort", onAbort, { once: true });
  });
  return { promise, onAbort };
}

async function readChunks(
  request: Request,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const { promise: abortPromise, onAbort } = createAbortPromise(
    request,
    reader,
  );

  try {
    if (request.signal.aborted) onAbort();
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
    request.signal.removeEventListener("abort", onAbort);
    abortPromise.catch(() => undefined);
    reader.releaseLock();
  }

  return chunks;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const totalBytes = chunks.reduce(
    (total, chunk) => total + chunk.byteLength,
    0,
  );
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Read a binary request body, failing once it exceeds `maxBytes`. */
export async function readRequestBytes(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  validateDeclaredLength(request, maxBytes);
  throwIfAborted(request);
  if (!request.body) return new Uint8Array();

  const chunks = await readChunks(request, request.body.getReader(), maxBytes);
  return concatChunks(chunks);
}

export async function readRequestBody(
  request: Request,
  maxBytes: number,
): Promise<string> {
  return new TextDecoder().decode(await readRequestBytes(request, maxBytes));
}
