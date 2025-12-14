import { cronJobs } from "convex/server";
import { api } from "./_generated/api.js";

const crons = cronJobs();

crons.interval(
  "catdex-thumbnail-backfill",
  { hours: 6 },
  api.catdex.enqueueMissingThumbnails,
  { limit: 25 },
);

export default crons;
