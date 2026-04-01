"use client";

import dynamic from "next/dynamic";

// The Shoo callback must be fully client-side because @shoojs/auth
// is browser-only and accesses window.location during initialization.
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
