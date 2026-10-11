import { describe, expect, it } from "vitest";
import { RequestBodyTooLargeError, readRequestBody } from "./request-body";

describe("readRequestBody", () => {
  it("reads a body under the byte cap", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });

    await expect(readRequestBody(request, 1024)).resolves.toBe('{"ok":true}');
  });

  it("rejects a declared body over the cap before reading it", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "content-length": "2048" },
      body: "x",
    });

    await expect(readRequestBody(request, 1024)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("rejects chunked bodies once the cap is exceeded", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "0123456789",
    });

    await expect(readRequestBody(request, 5)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("stops reading when the request is aborted", async () => {
    const controller = new AbortController();
    const request = {
      headers: new Headers(),
      body: new ReadableStream<Uint8Array>({
        pull() {
          return new Promise<void>(() => {
            // Keep the body open until the caller aborts.
          });
        },
      }),
      signal: controller.signal,
    } as unknown as Request;

    const pending = readRequestBody(request, 1024);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects an already-aborted request without a body", async () => {
    const controller = new AbortController();
    controller.abort();
    const request = new Request("http://localhost", {
      method: "POST",
      signal: controller.signal,
    });

    await expect(readRequestBody(request, 1024)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
