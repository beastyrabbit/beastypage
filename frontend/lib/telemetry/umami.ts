import { hasAnalyticsConsent, setAnalyticsConsent } from "./consent-state";
import { scrubEvent, scrubUrl } from "./scrub";

declare global {
  interface Window {
    umami?: {
      track(
        name: string,
        data?: Record<string, unknown>,
      ): Promise<unknown> | undefined;
      getSession?(): { cache?: string; website?: string };
    };
    beastypageBeforeSend?: (
      type: string,
      payload: Record<string, unknown>,
    ) => Record<string, unknown> | false;
  }
}

export const REPLAY_BLOCK_SELECTOR =
  ".rr-block, .cl-rootBox, .cl-portal, [data-private]";

type TrackerConfig = {
  enabled: boolean;
  host?: string;
  websiteId?: string;
  domains?: string;
};

/** Recorder has no before-send/stop API. Guard only its host's telemetry endpoints. */
export function installUmamiTransportGuard(host: string): void {
  const base = new URL(host);
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      window.location.href,
    );
    const isUmami =
      url.origin === base.origin &&
      url.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/api/`);
    if (!isUmami) return originalFetch(input, init);
    if (!hasAnalyticsConsent()) return new Response("{}", { status: 200 });
    if (url.pathname.endsWith("/recorder")) {
      const response = await originalFetch(input, {
        ...init,
        credentials: "omit",
      });
      if (!response.ok) return response;
      const config = await response.json();
      return Response.json({
        ...config,
        // These are response options read by the fetched Umami 3.x recorder.
        maskLevel: "strict",
        sampleRate: Math.min(
          typeof config.sampleRate === "number" ? config.sampleRate : 0.15,
          0.15,
        ),
        heatmapSampleRate: Math.min(
          typeof config.heatmapSampleRate === "number"
            ? config.heatmapSampleRate
            : 0.15,
          0.15,
        ),
        blockSelector: REPLAY_BLOCK_SELECTOR,
      });
    }
    if (typeof init?.body !== "string")
      return new Response("{}", { status: 200 });
    try {
      // Parsed JSON cannot contain live SDK graphs. Leave room for deep DOM snapshots.
      const body = JSON.stringify(scrubEvent(JSON.parse(init.body), 1024));
      // Re-check after serialization; withdrawal must also block recorder unload flushes.
      if (!hasAnalyticsConsent()) return new Response("{}", { status: 200 });
      return originalFetch(input, { ...init, body, credentials: "omit" });
    } catch {
      return new Response("{}", { status: 200 });
    }
  };
}

export function createUmamiLoader(
  config: TrackerConfig,
  reload = () => window.location.reload(),
) {
  let loaded = false;
  let consented = false;
  let guarded = false;
  const scripts: HTMLScriptElement[] = [];
  window.beastypageBeforeSend = (_type, payload) => {
    if (!hasAnalyticsConsent()) return false;
    return scrubEvent({
      ...payload,
      title: "BeastyPage",
      url: scrubUrl(String(payload.url ?? "/"), true),
      referrer: scrubUrl(String(payload.referrer ?? "/"), true),
    });
  };
  return (accepted: boolean) => {
    const withdrawing = consented && !accepted;
    consented = accepted;
    setAnalyticsConsent(accepted);
    if (!accepted) {
      for (const script of scripts) script.remove();
      if (withdrawing && loaded) reload();
      return;
    }
    if (
      loaded ||
      !hasAnalyticsConsent() ||
      !config.enabled ||
      !config.host ||
      !config.websiteId ||
      !config.domains
    )
      return;
    if (
      !config.domains
        .split(",")
        .map((domain) => domain.trim())
        .includes(window.location.hostname)
    )
      return;
    try {
      const host = new URL(config.host);
      if (!["https:", "http:"].includes(host.protocol)) return;
    } catch {
      return;
    }
    if (!guarded) {
      installUmamiTransportGuard(config.host);
      guarded = true;
    }
    loaded = true;
    const append = (file: string) => {
      if (!hasAnalyticsConsent()) return;
      const script = document.createElement("script");
      script.src = `${config.host?.replace(/\/$/, "")}/${file}`;
      script.async = true;
      script.dataset.websiteId = config.websiteId;
      script.dataset.domains = config.domains;
      script.dataset.excludeSearch = "true";
      script.dataset.excludeHash = "true";
      script.dataset.beforeSend = "beastypageBeforeSend";
      script.dataset.performance = "true";
      script.dataset.doNotTrack = "true";
      script.referrerPolicy = "no-referrer";
      scripts.push(script);
      document.head.append(script);
      return script;
    };
    const tracker = append("script.js");
    if (tracker)
      tracker.onload = () => {
        append("recorder.js");
      };
  };
}
