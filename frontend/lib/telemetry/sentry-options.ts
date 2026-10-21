import { telemetryConfig, telemetryEnabled, telemetryRelease } from "./config";
import { scrubEvent } from "./scrub";

export function sentryOptions(browser: boolean) {
  return {
    enabled: telemetryEnabled && Boolean(telemetryConfig.dsn),
    dsn: telemetryConfig.dsn,
    environment: telemetryConfig.environment,
    release: telemetryRelease,
    // SDK v11 uses explicit collection controls instead of sendDefaultPii.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      httpHeaders: {
        deny: ["authorization", "proxy-authorization", "cookie", "set-cookie"],
      },
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    tracesSampleRate: browser ? 0.1 : 0.05,
    traceLifecycle: "static" as const,
    beforeSend: <T>(event: T) => scrubEvent(event),
    beforeSendTransaction: <T>(event: T) => scrubEvent(event),
    beforeBreadcrumb: <T>(breadcrumb: T) => scrubEvent(breadcrumb),
  };
}
