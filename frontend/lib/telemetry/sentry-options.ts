import { telemetryConfig, telemetryEnabled, telemetryRelease } from "./config";
import { scrubEvent } from "./scrub";

export function sentryOptions(browser: boolean) {
  return {
    enabled: telemetryEnabled && Boolean(telemetryConfig.dsn),
    dsn: telemetryConfig.dsn,
    environment: telemetryConfig.environment,
    release: telemetryRelease,
    sendDefaultPii: false,
    tracesSampleRate: browser ? 0.1 : 0.05,
    traceLifecycle: "static" as const,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubEvent,
  };
}
