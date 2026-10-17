import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type LiveEventSourceFactory,
  type LiveEventSourceLike,
  parseSnapshot,
  useLive,
} from "@/lib/live";

class FakeEventSource implements LiveEventSourceLike {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Set<(event: MessageEvent<string>) => void>();
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ) {
    if (type === "snapshot") this.listeners.add(listener);
  }

  removeEventListener(
    _type: string,
    listener: (event: MessageEvent<string>) => void,
  ) {
    this.listeners.delete(listener);
  }

  emit(data: unknown) {
    const event = new MessageEvent("snapshot", { data: JSON.stringify(data) });
    this.onmessage?.(event);
    for (const listener of this.listeners) listener(event);
  }

  close() {
    this.closed = true;
  }
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.restoreAllMocks();
});

describe("live client", () => {
  it("parses only safe, non-negative revisions", () => {
    expect(parseSnapshot('{"revision":3,"data":{"ok":true}}')).toEqual({
      revision: 3,
      data: { ok: true },
    });
    expect(parseSnapshot('{"revision":2.5,"data":null}')).toBeNull();
    expect(parseSnapshot('{"revision":1}')).toBeNull();
  });

  it("opens an EventSource and ignores stale or duplicate snapshots", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const factory: LiveEventSourceFactory = (url) => new FakeEventSource(url);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    function Viewer() {
      const value = useLive<{ value: string }>("test/a", {
        eventSource: factory,
      });
      return React.createElement("output", null, value?.value ?? "pending");
    }

    try {
      await act(async () => root.render(React.createElement(Viewer)));
      expect(FakeEventSource.instances[0]?.url).toBe("/api/live/test/a");
      const source = FakeEventSource.instances[0];
      if (!source) throw new Error("EventSource was not constructed");

      await act(async () =>
        source.emit({ revision: 4, data: { value: "new" } }),
      );
      expect(container.textContent).toBe("new");
      await act(async () =>
        source.emit({ revision: 4, data: { value: "duplicate" } }),
      );
      await act(async () =>
        source.emit({ revision: 2, data: { value: "old" } }),
      );
      expect(container.textContent).toBe("new");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
