import "server-only";

import type { AnyJobKind } from "../types";
import catStreamAutoReleaseEvolution from "./cat-stream-auto-release-evolution";
import catStreamFinalizeBatchCull from "./cat-stream-finalize-batch-cull";
import catdexThumbnail from "./catdex-thumbnail";
import catdexThumbnailBackfill from "./catdex-thumbnail-backfill";
import catdexUploadRetention from "./catdex-upload-retention";
import discordChallengePrune from "./discord-challenge-prune";
import filesOrphanCleanup from "./files-orphan-cleanup";
import jobsPrune from "./jobs-prune";
import livePrune from "./live-prune";
import perfectMatchupRetention from "./perfect-matchup-retention";
import quickShareDispatch from "./quick-share-dispatch";
import quickShareQueueRetention from "./quick-share-queue-retention";
import quickShareRecoverLease from "./quick-share-recover-lease";
import quickShareRedispatch from "./quick-share-redispatch";
import quickShareRetention from "./quick-share-retention";
import quickShareRevokeIp from "./quick-share-revoke-ip";

/** Add one entry here when registering a concrete application job kind. */
export const jobKinds = [
  livePrune,
  jobsPrune,
  discordChallengePrune,
  catdexThumbnail,
  catdexThumbnailBackfill,
  catdexUploadRetention,
  filesOrphanCleanup,
  perfectMatchupRetention,
  quickShareDispatch,
  quickShareRecoverLease,
  quickShareRevokeIp,
  quickShareQueueRetention,
  quickShareRedispatch,
  quickShareRetention,
  catStreamFinalizeBatchCull,
  catStreamAutoReleaseEvolution,
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
