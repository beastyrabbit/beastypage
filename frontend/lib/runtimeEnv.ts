const CONFIG_KEY = "__GATCHA_RUNTIME__";

export type RuntimeConfig = {
  convexUrl?: string | null;
};

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window !== "undefined") {
    const cfg = (window as unknown as Record<string, unknown>)[CONFIG_KEY];
    if (cfg) return cfg as RuntimeConfig;
  }
  if (typeof globalThis !== "undefined") {
    const cfg = (globalThis as unknown as Record<string, unknown>)[CONFIG_KEY];
    if (cfg) return cfg as RuntimeConfig;
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
