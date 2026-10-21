import * as Sentry from "@sentry/node";
import { scrubTelemetry } from "./privacy.js";

export function initMonitoring(
  environment: NodeJS.ProcessEnv = process.env,
  sdk: Pick<typeof Sentry, "init"> = Sentry,
  transport?: Sentry.NodeOptions["transport"],
): boolean {
  const dsn = environment.GLITCHTIP_DSN;
  if (!dsn) return false;

  sdk.init({
    dsn,
    environment: environment.GLITCHTIP_ENVIRONMENT ?? "development",
    release: `beastypage@${environment.APP_VERSION ?? "dev"}`,
    initialScope: { tags: { service: "discord-bot" } },
    // SDK v11 replaces sendDefaultPii: false with explicit collection controls.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      httpHeaders: {
        deny: ["authorization", "proxy-authorization", "cookie", "set-cookie"],
      },
      stackFrameVariables: false,
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    tracesSampleRate: 0.05,
    // GlitchTip accepts Sentry transaction envelopes, rather than streamed spans.
    traceLifecycle: "static",
    beforeSend: (event) => scrubTelemetry(event),
    beforeBreadcrumb: (breadcrumb) => scrubTelemetry(breadcrumb),
    beforeSendTransaction: (event) => scrubTelemetry(event),
    // Console logs contain Discord display names. Keep them out of breadcrumbs.
    integrations: (defaults) =>
      defaults.filter((integration) => integration.name !== "Console"),
    ...(transport ? { transport } : {}),
  });
  return true;
}
