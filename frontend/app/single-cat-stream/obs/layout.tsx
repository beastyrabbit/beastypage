"use client";

import { ConvexProvider } from "convex/react";
import convex from "@/lib/convexClient";

/**
 * Minimal layout for the OBS overlay page.
 * - No site header/footer
 * - Bare ConvexProvider (no auth — overlay authenticates via API key in URL)
 * - Transparent background for OBS browser source
 */
export default function OBSOverlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexProvider client={convex}>
      <div
        className="fixed inset-0 z-[9999]"
        style={{
          "--cam-zone-width": "33.33%",
          "--accent-color": "#f59e0b",
        } as React.CSSProperties}
      >
        {children}
      </div>
    </ConvexProvider>
  );
}
