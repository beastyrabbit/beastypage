"use client";

import type {
  BatchLiveState,
  BatchStreamCommand,
} from "@/lib/adoption/streamBatch";
import type { BatchThemeId } from "../themes/batchThemeMeta";
import { BATCH_SCENES } from "./batch/batchRegistry";
import { useBatchShow } from "./batch/useBatchShow";

interface BatchSceneProps {
  command: BatchStreamCommand & { seq: number };
  /** Live elimination state from the session — the control page culls into it. */
  liveState: BatchLiveState | null;
  apiKey: string;
  /** Which look draws the show (session setting `batchTheme`). */
  theme: BatchThemeId;
}

/**
 * The adoption elimination show on the overlay: `useBatchShow` runs the
 * reveal/cull engine and syncs progress through the session; the chosen
 * look only renders the resulting view. Swapping the look mid-show keeps
 * the engine state because the hook lives here, above the look.
 */
export function BatchScene({
  command,
  liveState,
  apiKey,
  theme,
}: Readonly<BatchSceneProps>) {
  const view = useBatchShow({ command, liveState, apiKey });
  const Scene = BATCH_SCENES[theme];
  return (
    <div
      data-batch-theme={theme}
      data-batch-phase={view.phase}
      style={{ position: "relative", width: 1280, height: 1080 }}
    >
      <Scene view={view} />
    </div>
  );
}
