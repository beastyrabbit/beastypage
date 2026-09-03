import { describe, expect, it, vi } from "vitest";
import { uploadBlobWithProgress } from "./quick-share-upload";

type Listener = (event: Event) => void;

class FakeEventTarget {
  private listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeRequest extends FakeEventTarget {
  readonly upload = new FakeEventTarget();
  status = 0;
  responseText = "";
  method = "";
  path = "";
  body: Blob | null = null;
  readonly headers = new Map<string, string>();

  open(method: string, path: string) {
    this.method = method;
    this.path = path;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  send(body: Blob) {
    this.body = body;
  }
}

describe("Quick Share uploads", () => {
  it("reports bytes while the request is still uploading", async () => {
    const request = new FakeRequest();
    const onProgress = vi.fn();
    const body = new Blob([new Uint8Array(10)]);
    const result = uploadBlobWithProgress<{ accepted: boolean }>(
      "/i/api/uploads/id/parts/1",
      body,
      {
        headers: { "x-upload-receipt": "receipt" },
        onProgress,
        createRequest: () => request as unknown as XMLHttpRequest,
      },
    );

    request.upload.emit(
      "progress",
      new ProgressEvent("progress", { loaded: 4, total: 10 }),
    );
    expect(onProgress).toHaveBeenCalledWith({ loaded: 4, total: 10 });
    expect(request.method).toBe("PUT");
    expect(request.headers.get("x-upload-receipt")).toBe("receipt");

    request.status = 200;
    request.responseText = JSON.stringify({ accepted: true });
    request.emit("load", new Event("load"));
    await expect(result).resolves.toEqual({ accepted: true });
  });

  it("uses the API error returned for a rejected part", async () => {
    const request = new FakeRequest();
    const result = uploadBlobWithProgress("/upload", new Blob(["data"]), {
      createRequest: () => request as unknown as XMLHttpRequest,
    });

    request.status = 409;
    request.responseText = JSON.stringify({ error: "Part already received" });
    request.emit("load", new Event("load"));

    await expect(result).rejects.toThrow("Part already received");
  });

  it("reports a dropped connection", async () => {
    const request = new FakeRequest();
    const result = uploadBlobWithProgress("/upload", new Blob(["data"]), {
      createRequest: () => request as unknown as XMLHttpRequest,
    });

    request.emit("error", new Event("error"));

    await expect(result).rejects.toThrow(
      "Upload failed because the connection was lost.",
    );
  });
});
