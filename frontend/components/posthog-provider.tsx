"use client";

import posthog from "posthog-js";
import { ReactNode, useEffect } from "react";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

function isLocalHost(hostname: string | undefined) {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();
  return (
    lower === "localhost" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower.startsWith("127.") ||
    lower.endsWith(".local")
  );
}

export function PosthogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!KEY) {
      posthog.opt_out_capturing();
      return;
    }

    const { hostname } = window.location;
    const disable = isLocalHost(hostname);

    if (disable) {
      posthog.opt_out_capturing();
      return;
    }

    if (!(posthog as unknown as { __loaded?: boolean }).__loaded) {
      posthog.init(KEY, {
        api_host: HOST,
        capture_pageview: false,
        persistence: "localStorage",
      });
      posthog.register({ defaults: "2025-05-24" });
      posthog.capture("$pageview");
    }

    return () => {
      (posthog as unknown as { flush?: () => void }).flush?.();
    };
  }, []);

  return <>{children}</>;
}
