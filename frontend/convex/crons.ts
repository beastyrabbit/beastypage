import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

crons.interval(
  "catdex-thumbnail-backfill",
  { hours: 6 },
  internal.catdex.enqueueMissingThumbnails,
  { limit: 25 },
);

crons.interval(
  "quick-share-retention",
  { hours: 1 },
  internal.quickShare.maintenance,
  {},
);

crons.interval(
  "perfect-matchup-retention",
  { hours: 1 },
  internal.perfectCats.cleanupExpiredMatchups,
  {},
);

export default crons;
