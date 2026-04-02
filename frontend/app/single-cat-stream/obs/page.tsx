"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { OBSSpinClient } from "@/components/stream-control/OBSSpinClient";

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

  return <OBSSpinClient apiKey={apiKey} />;
}

export default function OBSOverlayPage() {
  return (
    <Suspense>
      <OBSOverlayInner />
    </Suspense>
  );
}
