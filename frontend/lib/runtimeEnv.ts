const CONFIG_KEY = "__GATCHA_RUNTIME__";

export type RuntimeConfig = {
  convexUrl?: string | null;
};

export function getRuntimeConfig(): RuntimeConfig {
  const win =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>)
      : undefined;
  if (win?.[CONFIG_KEY]) {
    return win[CONFIG_KEY] as RuntimeConfig;
  }
  const g =
    typeof globalThis !== "undefined"
      ? (globalThis as unknown as Record<string, unknown>)
      : undefined;
  if (g?.[CONFIG_KEY]) {
    return g[CONFIG_KEY] as RuntimeConfig;
  }
  return {};
}

export function injectRuntimeConfig(config: RuntimeConfig): string {
  const payload = JSON.stringify(config ?? {}).replace(/</g, "\\u003c");
  return `
    (function(){
      var key = ${JSON.stringify(CONFIG_KEY)};
      var current = (typeof window !== 'undefined' && window[key]) || {};
      var next = Object.assign({}, current, ${payload});
      window[key] = next;
    })();
  `;
}
