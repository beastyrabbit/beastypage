import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "@/lib/analytics";
import { scrubTelemetry as scrubBot } from "../../../backend/discord-bot/src/privacy";
import { scrubTelemetry as scrubImage } from "../../../backend/image_processing_service/src/privacy";
import { scrubTelemetry as scrubMedia } from "../../../backend/media_service/src/privacy";
import { hasAnalyticsConsent, setAnalyticsConsent } from "./consent-state";
import { outboundHost } from "./outbound";
import { isOverlayRoute } from "./overlay";
import { scrubEvent, scrubText, scrubUrl } from "./scrub";
import { createUmamiLoader, REPLAY_BLOCK_SELECTOR } from "./umami";

vi.mock("./config", () => ({ telemetryEnabled: true }));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  setAnalyticsConsent(false);
  delete window.umami;
  document.head.innerHTML = "";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ cache: "test" })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function replayWithAttributes(attributes: Record<string, unknown>) {
  return {
    payload: {
      events: [
        { type: 2, data: { node: { type: 2, tagName: "img", attributes } } },
        { type: 3, data: { source: 0, attributes: [{ id: 1, attributes }] } },
      ],
    },
  };
}

describe("consent-gated Umami", () => {
  const config = {
    enabled: true,
    host: "https://analytics.test",
    websiteId: "test",
    domains: "localhost",
  };
  it("loads nothing before consent, loads both scripts after consent, and tears down on withdrawal", () => {
    const reload = vi.fn();
    const update = createUmamiLoader(config, reload);
    update(false);
    expect(document.scripts).toHaveLength(0);
    update(true);
    const script = document.scripts[0];
    expect(script.src).toBe("https://analytics.test/script.js");
    expect(script.dataset.excludeSearch).toBe("true");
    expect(script.dataset.excludeHash).toBe("true");
    expect(script.dataset.domains).toBe("localhost");
    script.dispatchEvent(new Event("load"));
    expect(document.scripts[1].src).toBe("https://analytics.test/recorder.js");
    update(true);
    expect(document.scripts).toHaveLength(2);
    update(false);
    expect(document.scripts).toHaveLength(0);
    expect(hasAnalyticsConsent()).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    expect(window.beastypageBeforeSend?.("event", {})).toBe(false);
  });
  it("never loads in CI, with missing config, or outside the allowed domains", () => {
    for (const invalid of [
      { ...config, enabled: false },
      { ...config, host: undefined },
      { ...config, host: "not a URL" },
      { ...config, domains: "example.com" },
    ]) {
      createUmamiLoader(invalid)(true);
      expect(document.scripts).toHaveLength(0);
    }
  });
  it("drops non-string page addresses without invoking object stringification", () => {
    createUmamiLoader(config)(true);
    const stringify = vi.fn(() => "private-address");
    expect(
      window.beastypageBeforeSend?.("event", {
        url: { toString: stringify },
        referrer: ["private-address"],
      }),
    ).toMatchObject({ url: "/", referrer: "/" });
    expect(stringify).not.toHaveBeenCalled();
  });
  it("never loads on browser sources or preview routes, even with consent", () => {
    for (const path of [
      "/single-cat-stream/obs",
      "/single-cat-stream/obs/",
      "/dev/obs-theme-preview",
      "/dev/obs-batch-preview",
      "/dev/obs-look-preview",
    ]) {
      expect(isOverlayRoute(path)).toBe(true);
      window.history.replaceState(null, "", `${path}?key=sk_live_FAKE123`);
      createUmamiLoader(config)(true);
      expect(document.scripts).toHaveLength(0);
      expect(window.beastypageBeforeSend?.("event", {})).toBe(false);
    }
    expect(isOverlayRoute("/single-cat-stream")).toBe(false);
    expect(isOverlayRoute("/single-cat-stream/observer")).toBe(false);
    expect(isOverlayRoute("/projects")).toBe(false);
  });
  it("blocks loaded trackers, product events and recorder transport immediately on overlay navigation", async () => {
    const transport = vi.mocked(window.fetch);
    const reload = vi.fn();
    const update = createUmamiLoader(config, reload);
    update(true);
    const tracker = document.scripts[0];
    tracker.dispatchEvent(new Event("load"));
    const send = vi.fn();
    window.umami = { track: send };
    window.history.pushState(
      null,
      "",
      "/single-cat-stream/obs?key=sk_live_FAKE123",
    );
    expect(
      window.beastypageBeforeSend?.("event", { url: window.location.href }),
    ).toBe(false);
    track("wheel_spin_started", {});
    expect(send).not.toHaveBeenCalled();
    await window.fetch("https://analytics.test/api/record", {
      method: "POST",
      body: JSON.stringify({ url: window.location.href }),
    });
    expect(transport).not.toHaveBeenCalled();
    update(false);
    expect(document.scripts).toHaveLength(0);
    expect(reload).toHaveBeenCalledOnce();
  });
  it("scrubs overlay and SSE capabilities from before-send and recorder payloads", async () => {
    const transport = vi.mocked(window.fetch);
    createUmamiLoader(config)(true);
    const url = "/single-cat-stream/obs?key=sk_live_FAKE123";
    const sse = "/api/live/cat-stream/fixture?key=sk_live_FAKE123";
    const event = window.beastypageBeforeSend?.("event", {
      url,
      data: { source: sse },
    });
    expect(JSON.stringify(event)).not.toContain("sk_live_FAKE123");
    expect(event).toMatchObject({ url: "/single-cat-stream/obs" });
    await window.fetch("https://analytics.test/api/record", {
      method: "POST",
      body: JSON.stringify({
        events: [
          { type: 4, data: { href: url } },
          {
            type: 3,
            data: { attributes: { src: sse }, textContent: `SSE ${sse}` },
          },
        ],
      }),
    });
    const options = transport.mock.calls[0][1];
    expect(options?.body).not.toContain("sk_live_FAKE123");
    expect(options?.body).toContain("/api/live/cat-stream/fixture");
  });
  it("does not start the recorder if consent is withdrawn before the tracker loads", () => {
    const update = createUmamiLoader(config, vi.fn());
    update(true);
    const script = document.scripts[0];
    update(false);
    script.dispatchEvent(new Event("load"));
    expect(document.scripts).toHaveLength(0);
  });
  it("preserves a 40-level rrweb snapshot through the recorder transport", async () => {
    const transport = vi.mocked(window.fetch);
    createUmamiLoader(config)(true);
    type SnapshotNode = {
      type: number;
      childNodes?: SnapshotNode[];
      textContent?: string;
    };
    let node: SnapshotNode = { type: 3, textContent: "masked leaf" };
    for (let level = 0; level < 40; level++)
      node = { type: 2, childNodes: [node] };
    await window.fetch("https://analytics.test/api/record", {
      method: "POST",
      body: JSON.stringify({
        payload: { events: [{ type: 2, data: { node } }] },
      }),
    });
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
    let result = body.payload.events[0].data.node;
    for (let level = 0; level < 40; level++) result = result.childNodes[0];
    expect(result).toEqual({ type: 3, textContent: "masked leaf" });
  });
  it.each([
    ["src", "data:image/png;base64,private-image"],
    ["poster", "blob:https://site.test/private-blob"],
    ["href", "DATA:image/svg+xml,private-image"],
    ["srcset", "/safe.png 1x, data:image/png;base64,private-image 2x"],
    ["srcset", "blob:https://site.test/private-blob 1x, /safe.png 2x"],
    ["style", 'background-image: url("data:image/png;base64,private-image")'],
    [
      "_cssText",
      "body { background: url(blob:https://site.test/private-blob) }",
    ],
    ["rr_dataURL", "data:image/png;base64,private-image"],
  ])(
    "filters %s data/blob URLs in snapshot and mutation attributes",
    async (attribute, value) => {
      const transport = vi.mocked(window.fetch);
      createUmamiLoader(config)(true);
      const attributes = {
        [attribute]: value,
        class: "public-preview",
        width: 100,
      };
      await window.fetch("https://analytics.test/api/record", {
        method: "POST",
        body: JSON.stringify(replayWithAttributes(attributes)),
      });
      const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
      const expected = { ...attributes, [attribute]: "[Filtered]" };
      expect(body.payload.events[0].data.node.attributes).toEqual(expected);
      expect(body.payload.events[1].data.attributes[0].attributes).toEqual(
        expected,
      );
      expect(JSON.stringify(body)).not.toContain("private-image");
      expect(JSON.stringify(body)).not.toContain("private-blob");
    },
  );
  it.each(["/i/private-share", "https://site.test/i/private-share/0"])(
    "scrubs Quick Share capabilities in rrweb attributes: %s",
    async (path) => {
      const transport = vi.mocked(window.fetch);
      createUmamiLoader(config)(true);
      const attributes = {
        src: path,
        srcset: `${path} 1x, /safe.png 2x`,
        poster: path,
        href: path,
        style: `background: url('${path}')`,
      };
      await window.fetch("https://analytics.test/api/record", {
        method: "POST",
        body: JSON.stringify(replayWithAttributes(attributes)),
      });
      const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
      for (const result of [
        body.payload.events[0].data.node.attributes,
        body.payload.events[1].data.attributes[0].attributes,
      ]) {
        for (const value of Object.values(result))
          expect(value).toContain("/i/[Filtered]");
      }
      expect(JSON.stringify(body)).not.toContain("private-share");
      expect(body.payload.events[0].data.node.attributes.srcset).toContain(
        "/safe.png 2x",
      );
    },
  );
  it("forces strict recorder settings and blocks recorder unload requests after withdrawal", async () => {
    const transport = vi.fn().mockResolvedValue(
      Response.json({
        enabled: true,
        sampleRate: 1,
        heatmapSampleRate: 1,
        maskLevel: "moderate",
      }),
    );
    vi.stubGlobal("fetch", transport);
    const update = createUmamiLoader(config, vi.fn());
    update(true);
    const response = await window.fetch(
      "https://analytics.test/api/websites/test/recorder",
    );
    expect(await response.json()).toMatchObject({
      maskLevel: "strict",
      sampleRate: 0.15,
      heatmapSampleRate: 0.15,
      blockSelector: REPLAY_BLOCK_SELECTOR,
    });
    update(false);
    await window.fetch("https://analytics.test/api/record", {
      method: "POST",
      body: "{}",
    });
    expect(transport).toHaveBeenCalledTimes(1);
    await window.fetch("https://unrelated.test/api/record");
    expect(transport).toHaveBeenCalledTimes(2);
  });
});

describe("typed track", () => {
  it("drops events before consent and before script readiness, without queuing", () => {
    const send = vi.fn();
    window.umami = { track: send };
    track("wheel_spin_started", {});
    expect(send).not.toHaveBeenCalled();
    setAnalyticsConsent(true);
    delete window.umami;
    expect(() => track("wheel_spin_started", {})).not.toThrow();
    window.umami = { track: send };
    expect(send).not.toHaveBeenCalled();
    track("wheel_spin_started", {});
    expect(send).toHaveBeenCalledExactlyOnceWith("wheel_spin_started", {});
  });
  it("removes free text and never throws, including rejected transports", async () => {
    setAnalyticsConsent(true);
    const send = vi.fn();
    window.umami = { track: send };
    track("perfect_cat_matchup_load_failed", {
      message: "email@example.com token=private",
    });
    expect(send).toHaveBeenCalledWith("perfect_cat_matchup_load_failed", {});
    send.mockImplementation(() => {
      throw new Error("offline");
    });
    expect(() => track("wheel_spin_started", {})).not.toThrow();
    send.mockImplementation(() => Promise.reject(new Error("offline")));
    track("wheel_spin_started", {});
    await Promise.resolve();
  });
});

describe("event scrubber", () => {
  it.each([scrubText, scrubBot, scrubImage, scrubMedia])(
    "preserves email and bearer matching across scrubbers, including long invalid addresses",
    (scrub) => {
      for (const [input, expected] of [
        ["a+b%tag@sub.example.COM_ending", "[Filtered]_ending"],
        ["a@b.co@c.de", "[Filtered]@c.de"],
        ["a@b@c.de", "a@[Filtered]"],
        ["a@b.c a@.co", "a@b.c a@.co"],
        ["a@b..co", "[Filtered]"],
        ["a@b.co.more123", "[Filtered]123"],
        ["first@site.test, second@other.test", "[Filtered], [Filtered]"],
        ["BEARER aZ09._~+/=-", "Bearer [Filtered]"],
        ["a".repeat(50_000), "a".repeat(50_000)],
        [`a@${"b.".repeat(25_000)}c`, `a@${"b.".repeat(25_000)}c`],
      ])
        expect(scrub(input)).toBe(expected);
    },
  );

  it("scrubs every sensitive query name even when a name occurs more than once", () => {
    const url = new URL(
      scrubUrl("https://site.test/?token=a&token=b&secret=c&safe=yes"),
    );
    expect(url.searchParams.getAll("token")).toEqual(["[Filtered]"]);
    expect(url.searchParams.get("secret")).toBe("[Filtered]");
    expect(url.searchParams.get("safe")).toBe("yes");
  });
  const overlay = "https://site.test/single-cat-stream/obs?key=sk_live_FAKE123";
  const sse = "/api/live/cat-stream/fixture?key=sk_live_FAKE123";

  it.each(["view", "adoption", "ancestry-tree", "evolution", "i"])(
    "removes queryless %s capabilities from navigation, transaction names and sampling context",
    (route) => {
      const path = `/${route}/private-capability`;
      const result = scrubEvent({
        breadcrumbs: [
          { category: "navigation", data: { from: path, to: "/projects" } },
        ],
        transaction: `GET ${path}`,
        sdkProcessingMetadata: {
          dynamicSamplingContext: {
            public_key: "public-dsn-key",
            transaction: path,
          },
        },
      });
      expect(result.breadcrumbs[0].data.from).toBe(`/${route}/[Filtered]`);
      expect(result.transaction).toBe(`GET /${route}/[Filtered]`);
      expect(
        result.sdkProcessingMetadata.dynamicSamplingContext.transaction,
      ).toBe(`/${route}/[Filtered]`);
      expect(JSON.stringify(result)).not.toContain("private-capability");
      expect(scrubText(`Navigation to ${path} complete`)).toBe(
        `Navigation to /${route}/[Filtered] complete`,
      );
      expect(scrubUrl(`https://site.test${path}`)).toBe(
        `https://site.test/${route}/[Filtered]`,
      );
    },
  );

  it("preserves unrelated paths, stack filenames and ordinary text", () => {
    for (const value of [
      "/projects",
      "/adoption-generator",
      "preview/view/example",
      "app:///view/example.ts",
      "The view is ready.",
      "/i",
      "/icons/image.png",
      "app:///i/example.ts",
      "The data: and blob: schemes carry media.",
    ])
      expect(scrubText(value)).toBe(value);
  });
  it("preserves safe attributes and text mentioning URL schemes", () => {
    const event = {
      attributes: {
        src: "/assets/cat.png",
        srcset: "/one.png 1x, /two.png 2x",
        title: "metadata: public",
        style: "color: red",
      },
      textContent: "Use data: or blob: URLs for local previews.",
    };
    expect(scrubEvent(event)).toEqual(event);
  });

  it("preserves live SDK scopes without reading them and scrubs only sampling metadata", () => {
    const scope = Object.defineProperty({}, "client", {
      enumerable: true,
      get: () => {
        throw new Error("Live scope must not be traversed");
      },
    });
    const input = {
      sdkProcessingMetadata: {
        capturedSpanScope: scope,
        dynamicSamplingContext: {
          public_key: "public-dsn-key",
          transaction: "/view/private-capability?token=private-token",
          user: { email: "person@example.test" },
        },
      },
    };
    const result = scrubEvent(input);
    expect(result.sdkProcessingMetadata.capturedSpanScope).toBe(scope);
    expect(result.sdkProcessingMetadata.dynamicSamplingContext).toEqual({
      public_key: "public-dsn-key",
      transaction: "/view/[Filtered]",
    });
    expect(
      input.sdkProcessingMetadata.dynamicSamplingContext.transaction,
    ).toContain("private-capability");
  });

  it("scrubs overlay requests, fetch/xhr/navigation/console breadcrumbs and EventSource errors", () => {
    const breadcrumbs = [
      { category: "fetch", data: { url: sse, method: "GET" } },
      { category: "xhr", data: { url: sse, method: "GET" } },
      { category: "navigation", data: { from: "/projects", to: overlay } },
      {
        category: "console",
        message: `EventSource ${sse}`,
        data: { arguments: [sse] },
      },
    ];
    for (const breadcrumb of breadcrumbs)
      expect(JSON.stringify(scrubEvent(breadcrumb))).not.toContain(
        "sk_live_FAKE123",
      );
    const result = scrubEvent({
      request: { url: overlay, query_string: "key=sk_live_FAKE123" },
      breadcrumbs,
      exception: {
        values: [
          { type: "Error", value: `EventSource connection failed: ${sse}` },
        ],
      },
      extra: { event: { target: { url: sse } } },
    });
    expect(JSON.stringify(result)).not.toContain("sk_live_FAKE123");
    expect(result.request.query_string).toBe("[Filtered]");
    expect(result.request.url).toBe("https://site.test/single-cat-stream/obs");
  });

  it("scrubs transaction/span URLs, descriptions and every query_string representation", () => {
    const result = scrubEvent({
      type: "transaction",
      transaction: `GET ${overlay}`,
      request: { url: overlay, query_string: [["key", "sk_live_FAKE123"]] },
      contexts: {
        trace: { data: { "http.url": overlay, "url.full": overlay } },
      },
      spans: [
        {
          op: "resource.other",
          description: `EventSource ${sse}`,
          data: {
            "http.url": sse,
            "url.full": overlay,
            "url.query": "key=sk_live_FAKE123",
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("sk_live_FAKE123");
    expect(result.spans[0].data["http.url"]).toBe(
      "/api/live/cat-stream/fixture",
    );
    expect(
      JSON.stringify(
        scrubEvent({ request: { query_string: { key: "sk_live_FAKE123" } } }),
      ),
    ).not.toContain("sk_live_FAKE123");
    for (const key of ["key", "%6b%65%79", "apiKey", "viewerKey"])
      expect(
        JSON.stringify(
          scrubEvent({
            message: `/single-cat-stream/obs?${key}=sk_live_FAKE123`,
            description: `/api/live/cat-stream/fixture?${key}=sk_live_FAKE123`,
          }),
        ),
      ).not.toContain("sk_live_FAKE123");
    expect(
      scrubUrl("/api/live/cat-stream/fixture?viewerKey=sk_live_FAKE123"),
    ).not.toContain("sk_live_FAKE123");
  });
  it("removes identity, bodies, email, bearer/JWT credentials, cookies and nested secrets", () => {
    const original = {
      user: { id: "private-id" },
      message:
        "person@example.com Bearer private-bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature __session=private-session",
      request: {
        url: "https://site.test/?edit=private-edit&share=private-share&safe=ok#private-fragment",
        headers: { Authorization: "private-auth", Cookie: "private-cookie" },
        data: "private-body",
      },
      extra: {
        nested: [{ password: "private-password", email: "other@example.com" }],
      },
      release: "beastypage@v10.0.0",
      environment: "production",
    };
    const scrubbed = scrubEvent(original);
    const serialized = JSON.stringify(scrubbed);
    for (const secret of ["private-", "person@", "other@", "eyJ", "private-id"])
      expect(serialized).not.toContain(secret);
    expect(scrubbed.release).toBe(original.release);
    expect(scrubbed.environment).toBe("production");
    expect(original.message).toContain("person@example.com");
  });
  it("scrubs secret parameters and share paths, preserving useful stack filenames", () => {
    expect(scrubUrl("/view/private-share?token=secret#hash", true)).toBe(
      "/view/[Filtered]",
    );
    const result = scrubEvent({
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: "app:///_next/server/chunks/file.js" }],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(result)).toContain(
      "app:///_next/server/chunks/file.js",
    );
    for (const key of [
      "token",
      "key",
      "secret",
      "password",
      "auth",
      "code",
      "session",
      "signature",
      "sig",
      "edit",
      "share",
    ])
      expect(scrubUrl(`https://site.test/?${key}=sensitive`)).not.toContain(
        "sensitive",
      );
  });
  it("handles cyclic and deeply nested data without mutating the source", () => {
    const value: { nested?: unknown } = {};
    value.nested = value;
    expect(scrubEvent(value)).toEqual({ nested: "[Filtered]" });
    let deep: unknown = "leaf";
    for (let level = 0; level < 40; level++) deep = { nested: deep };
    expect(JSON.stringify(scrubEvent(deep))).not.toContain("leaf");
    expect(JSON.stringify(scrubEvent(deep))).toContain("[Filtered]");
  });
});

describe("outbound links", () => {
  it("finds nested external anchors and returns only the host", () => {
    const link = document.createElement("a");
    link.href = "https://external.test/path?token=private#secret";
    const child = document.createElement("span");
    link.append(child);
    expect(outboundHost(child, "https://site.test")).toBe("external.test");
    for (const href of [
      "/projects",
      "#test",
      "https://site.test/projects",
      "mailto:person@example.com",
      "javascript:void(0)",
    ]) {
      link.setAttribute("href", href);
      expect(outboundHost(child, "https://site.test")).toBeNull();
    }
    expect(outboundHost(null, "https://site.test")).toBeNull();
  });
});
