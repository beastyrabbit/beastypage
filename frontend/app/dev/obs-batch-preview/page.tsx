import { Suspense } from "react";
import { BatchPreviewClient } from "./BatchPreviewClient";

/**
 * DEV HARNESS — renders any batch show look with mock cats so it can be
 * designed without PostgreSQL or a live stream session (the renderer service
 * is still needed for sprites).
 *
 *   /dev/obs-batch-preview?theme=gathering&state=awaiting&count=25&scale=0.6
 *
 * Not linked from anywhere.
 */
export default function ObsBatchPreviewPage() {
  return (
    <Suspense>
      <BatchPreviewClient />
    </Suspense>
  );
}
