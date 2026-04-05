"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CanvasMirror } from "@/components/stream-canvas/CanvasMirror";

function OBSInner() {
  const searchParams = useSearchParams();
  const secret = searchParams.get("secret");

  if (!secret) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-white/50">
        Missing OBS secret. Add ?secret=YOUR_SECRET to the URL.
      </div>
    );
  }

  return <CanvasMirror obsSecret={secret} />;
}

export default function StreamCanvasOBSPage() {
  return (
    <Suspense>
      <OBSInner />
    </Suspense>
  );
}
