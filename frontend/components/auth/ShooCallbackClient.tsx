"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getShooClient } from "@/lib/shooAuth";

export default function ShooCallbackClient() {
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    // Exchange the authorization code for tokens and redirect to the app.
    // Uses the shared client singleton so config stays consistent with the provider.
    getShooClient()
      .handleCallback()
      .catch((err) => {
        console.error("[ShooCallback] handleCallback failed:", err);
        setError(
          err instanceof Error ? err.message : "Sign-in failed. Please try again."
        );
      });
  }, []);

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-400">{error}</p>
        <Link
          href="/"
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Return home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">Signing in...</p>
    </div>
  );
}
