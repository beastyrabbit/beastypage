import { createSettingsRouteHandlers } from "@/app/api/_lib/settings-route";
import { api } from "@/convex/_generated/api";

const handlers = createSettingsRouteHandlers({
  serviceName: "single cat",
  get: (convex, slug) => convex.query(api.singleCatSettings.get, { slug }),
  save: (convex, args) => convex.mutation(api.singleCatSettings.save, args),
});

export const { GET, POST } = handlers;
