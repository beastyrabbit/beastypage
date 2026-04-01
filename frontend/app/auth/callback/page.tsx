"use client";

import dynamic from "next/dynamic";

// The Shoo callback must be fully client-side because @shoojs/react
// evaluates deriveRedirectUri at module scope, which requires a browser.
const ShooCallbackClient = dynamic(
  () => import("@/components/auth/ShooCallbackClient"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Signing in...</p>
      </div>
    ),
  }
);

export default function ShooCallbackPage() {
  return <ShooCallbackClient />;
}
