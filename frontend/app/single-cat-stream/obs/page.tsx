"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ObsOverlayClient } from "@/components/stream-control/obs/ObsOverlayClient";
import { lookFontsClassName } from "./lookFonts";

function OBSOverlayInner() {
  const searchParams = useSearchParams();
  const apiKey = searchParams.get("key");

  if (!apiKey) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-white/50">
        Missing API key. Add ?key=YOUR_KEY to the URL.
      </div>
    );
  }

  // The show looks (evolution finale / batch show designs) read their web
  // fonts from the CSS variables this class provides.
  return (
    <div className={lookFontsClassName}>
      <ObsOverlayClient apiKey={apiKey} />
    </div>
  );
}

export default function OBSOverlayPage() {
  return (
    <Suspense>
      <OBSOverlayInner />
    </Suspense>
  );
}
