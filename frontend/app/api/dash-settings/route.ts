import { createSettingsRouteHandlers } from "@/app/api/_lib/settings-route";
import { api } from "@/convex/_generated/api";

const handlers = createSettingsRouteHandlers({
  serviceName: "dash",
  kind: "dash",
  get: (convex, slug) => convex.query(api.dashSettings.get, { slug }),
  save: (convex, args) => convex.mutation(api.dashSettings.save, args),
});

export const { GET, POST } = handlers;
