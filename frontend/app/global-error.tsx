"use client";

import { useEffect } from "react";
import { telemetryConfig, telemetryEnabled } from "@/lib/telemetry/config";

export default function GlobalError({
  error,
  retry,
}: Readonly<{ error: unknown; retry: () => void }>) {
  useEffect(() => {
    if (!telemetryEnabled || !telemetryConfig.dsn) return;
    void import("@/lib/telemetry/sentry-browser")
      .then(({ initBrowserErrors }) => {
        initBrowserErrors().captureException(error);
      })
      .catch(() => {});
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: "2rem",
          lineHeight: 1.6,
        }}
      >
        <h1>Something went wrong</h1>
        <p>Please try loading this page again.</p>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
        <nav aria-label="Legal" style={{ marginTop: "2rem" }}>
          <a href="/impressum" lang="de">
            Impressum
          </a>
          {" · "}
          <a href="/datenschutz" lang="de">
            Datenschutz
          </a>
          {" · "}
          <a href="/legal-notice">Legal notice</a>
          {" · "}
          <a href="/privacy">Privacy</a>
        </nav>
      </body>
    </html>
  );
}
