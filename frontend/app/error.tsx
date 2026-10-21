"use client";

import { useEffect } from "react";
import { telemetryConfig, telemetryEnabled } from "@/lib/telemetry/config";

export default function ErrorPage({
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
    <main lang="en" className="mx-auto max-w-3xl space-y-5 px-6 py-16">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p>Please try loading this page again.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md border border-border px-4 py-2"
      >
        Try again
      </button>
    </main>
  );
}
