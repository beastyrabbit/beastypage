import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

// Start or resume the bounded username-search backfill automatically. New and
// edited users already write usernameSearch, so this only needs to sweep legacy
// rows and can run infrequently while search remains fail-closed until complete.
crons.interval(
  "username-search-backfill",
  { hours: 6 },
  internal.users.backfillUsernameSearch,
  {},
);

crons.interval(
  "catdex-thumbnail-backfill",
  { hours: 6 },
  internal.catdex.enqueueMissingThumbnails,
  { limit: 25 },
);

crons.interval(
  "catdex-upload-retention",
  { hours: 1 },
  internal.catdex.cleanupExpiredUploads,
  { limit: 100 },
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
