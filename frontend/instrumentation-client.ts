import { telemetryConfig, telemetryEnabled } from "./lib/telemetry/config";

if (telemetryEnabled && telemetryConfig.dsn) {
  const pending: unknown[] = [];
  const onError = (event: ErrorEvent) => {
    if (pending.length < 20)
      pending.push(event.error ?? new Error(event.message));
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    if (pending.length < 20) pending.push(event.reason);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  const load = () => {
    void import("./lib/telemetry/sentry-browser")
      .then(({ initBrowserErrors }) => {
        const sdk = initBrowserErrors();
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
        for (const error of pending) sdk.captureException(error);
        pending.length = 0;
      })
      .catch(() => {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
        pending.length = 0;
      });
  };
  // Wait for the page to finish loading, then give hydration a frame to finish.
  const afterLoad = () => requestAnimationFrame(() => setTimeout(load, 0));
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
}
