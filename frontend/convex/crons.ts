import { cronJobs } from "convex/server";
import { api } from "./_generated/api.js";

const crons = cronJobs();

crons.interval("refresh-mapper-previews", { hours: 24 }, api.previews.refreshMapperPreviews, {
  limit: 10,
});

export default crons;
