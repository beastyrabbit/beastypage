"use client";

import posthog from "posthog-js";
import { usePathname, useSearchParams } from "next/navigation";
import { ReactNode, useEffect, useRef, Suspense } from "react";

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

/** Tracks page views on route changes */
function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;

    const url = searchParams?.size
      ? `${pathname}?${searchParams.toString()}`
      : pathname;

    // Only capture if URL actually changed
    if (url !== lastUrl.current) {
      lastUrl.current = url;
      posthog.capture("$pageview", { $current_url: window.location.href });
    }
  }, [pathname, searchParams]);

  return null;
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
        capture_pageview: false, // We handle this manually for SPA
        capture_pageleave: true,
        persistence: "localStorage",
        defaults: "2025-11-30",
      });
    }

    return () => {
      (posthog as unknown as { flush?: () => void }).flush?.();
    };
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </>
  );
}
