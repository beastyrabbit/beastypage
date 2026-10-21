import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/telemetry/sentry-options";

Sentry.init({
  ...sentryOptions(false),
  integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
});
