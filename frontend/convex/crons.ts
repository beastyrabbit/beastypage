import { cronJobs } from "convex/server";
import { api } from "./_generated/api.js";

const crons = cronJobs();

crons.interval("refresh-mapper-previews", { hours: 24 }, api.previews.refreshMapperPreviews, {
  limit: 10,
});

crons.interval(
  "catdex-thumbnail-backfill",
  { hours: 6 },
  api.catdex.enqueueMissingThumbnails,
  { limit: 25 },
);

export default crons;
