import "server-only";

import type { AnyJobKind } from "../types";
import catdexThumbnail from "./catdex-thumbnail";
import catdexThumbnailBackfill from "./catdex-thumbnail-backfill";
import catdexUploadRetention from "./catdex-upload-retention";
import discordChallengePrune from "./discord-challenge-prune";
import filesOrphanCleanup from "./files-orphan-cleanup";
import jobsPrune from "./jobs-prune";
import livePrune from "./live-prune";

/** Add one entry here when registering a concrete application job kind. */
export const jobKinds = [
  livePrune,
  jobsPrune,
  discordChallengePrune,
  catdexThumbnail,
  catdexThumbnailBackfill,
  catdexUploadRetention,
  filesOrphanCleanup,
] as const;

export const jobKindRegistry = new Map<string, AnyJobKind>(
  jobKinds.map(
    (definition) =>
      [definition.kind, definition as unknown as AnyJobKind] as const,
  ),
);

export function getJobKind(kind: string): AnyJobKind | undefined {
  return jobKindRegistry.get(kind);
}
