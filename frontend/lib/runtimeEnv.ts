const CONFIG_KEY = "__GATCHA_RUNTIME__";

export type RuntimeConfig = {
  convexUrl?: string | null;
};

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window !== "undefined" && (window as any)[CONFIG_KEY]) {
    return (window as any)[CONFIG_KEY];
  }
  if (typeof globalThis !== "undefined" && (globalThis as any)[CONFIG_KEY]) {
    return (globalThis as any)[CONFIG_KEY];
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
