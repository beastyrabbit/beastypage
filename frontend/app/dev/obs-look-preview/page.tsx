import { Suspense } from "react";
import { lookFontsClassName } from "@/app/single-cat-stream/obs/lookFonts";
import { LookPreviewClient } from "./LookPreviewClient";

/**
 * DEV HARNESS — renders any show look's evolution finale or batch board with
 * mock data (composited sprites, no PostgreSQL, no renderer).
 *
 *   /dev/obs-look-preview?look=allegiances&scene=evolution&branches=3&levels=2
 *   /dev/obs-look-preview?look=contact&scene=batch&pool=16&phase=awaitingCull&spot=1
 *
 * Not linked from anywhere.
 */
export default function ObsLookPreviewPage() {
  return (
    <Suspense>
      <div className={lookFontsClassName}>
        <LookPreviewClient />
      </div>
    </Suspense>
  );
}
