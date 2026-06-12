"use client";

import { Tv } from "lucide-react";
import { useStreamControl } from "./context";

/**
 * OBS overlay live preview — stays visible next to whichever tab is active
 * so settings changes give instant feedback.
 */
export function PreviewCard() {
  const { obsUrl, previewContainerRef } = useStreamControl();

  return (
    <section className="rounded-2xl border border-border/40 bg-background/80 p-4 backdrop-blur lg:sticky lg:top-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Tv className="mr-1.5 inline size-3.5" />
          OBS Preview
        </h3>
      </div>
      <div
        ref={previewContainerRef}
        className="relative aspect-video overflow-hidden rounded-lg border border-border/30 bg-black/90"
      >
        {obsUrl ? (
          <iframe
            src={obsUrl}
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: "1920px",
              height: "1080px",
              transform: "scale(var(--preview-scale, 0.3))",
            }}
            title="OBS Overlay Preview"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Loading API key…
          </div>
        )}
      </div>
    </section>
  );
}
