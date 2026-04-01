"use client";

import { useShooAuth } from "@shoojs/react";

export default function ShooCallbackClient() {
  useShooAuth();
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">Signing in...</p>
    </div>
  );
}
