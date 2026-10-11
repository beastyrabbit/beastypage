import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as detectGrid } from "./detect-grid/route";
import { POST as processImage } from "./route";

const originalFetch = globalThis.fetch;

function request(url: string, signal?: AbortSignal) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: "data:image/png;base64,AA==" }),
    signal,
  });
}

function abortingFetch(onSignal: (signal: AbortSignal) => void) {
  return vi.fn((_input: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal | undefined;
    if (!signal) {
      throw new Error("pixelator proxy did not pass an abort signal");
    }
    onSignal(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () =>
          reject(new DOMException("The operation was aborted", "AbortError")),
        { once: true },
      );
    });
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each([
  {
    name: "pixel processing",
    path: "/api/pixelator",
    post: processImage,
    timeout: 60_000,
    timeoutMessage: "Processing timed out",
  },
  {
    name: "grid detection",
    path: "/api/pixelator/detect-grid",
    post: detectGrid,
    timeout: 30_000,
    timeoutMessage: "Detection timed out",
  },
])("$name proxy abort handling", ({ path, post, timeout, timeoutMessage }) => {
  it("returns 499 when the client disconnects while the backend is running", async () => {
    let backendStarted!: (signal: AbortSignal) => void;
    const backendStartedPromise = new Promise<AbortSignal>((resolve) => {
      backendStarted = resolve;
    });
    globalThis.fetch = abortingFetch((signal) => backendStarted(signal));

    const clientController = new AbortController();
    const pending = post(request(path, clientController.signal));
    const backendSignal = await backendStartedPromise;
    clientController.abort();

    const response = await pending;

    expect(backendSignal.aborted).toBe(true);
    expect(response.status).toBe(499);
    await expect(response.json()).resolves.toEqual({
      error: "Request aborted",
    });
  });

  it("returns 504 when the backend exceeds the proxy timeout", async () => {
    vi.useFakeTimers();
    globalThis.fetch = abortingFetch(() => undefined);

    const pending = post(request(path));
    await vi.advanceTimersByTimeAsync(timeout);
    const response = await pending;

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ error: timeoutMessage });
  });
});
