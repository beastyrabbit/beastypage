import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./sentry-options";

let initialized = false;
export function initBrowserErrors() {
  if (initialized) return Sentry;
  initialized = true;
  Sentry.init({
    ...sentryOptions(true),
    // BrowserSession persists no data today, but remove it explicitly so
    // necessary error reporting has no session tracking or device storage.
    integrations: (defaults) => [
      ...defaults.filter(
        (integration) =>
          !["BrowserSession", "Replay", "Feedback"].includes(integration.name),
      ),
      Sentry.captureConsoleIntegration({ levels: ["error"] }),
    ],
  });
  return Sentry;
}
