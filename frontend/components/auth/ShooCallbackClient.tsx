"use client";

import { useEffect, useRef } from "react";
import { getShooClient } from "@/lib/shooAuth";

export default function ShooCallbackClient() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    // Exchange the authorization code and redirect to the stored returnTo path.
    // Uses the shared client singleton so config stays consistent with the provider.
    void getShooClient().handleCallback();
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">Signing in...</p>
    </div>
  );
}
