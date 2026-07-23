import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api.js";

const crons = cronJobs();

crons.interval(
  "catdex-thumbnail-backfill",
  { hours: 6 },
  api.catdex.enqueueMissingThumbnails,
  { limit: 25 },
);

crons.interval(
  "quick-share-retention",
  { hours: 1 },
  internal.quickShare.maintenance,
  {},
);

export default crons;
