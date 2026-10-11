import { createSettingsRouteHandlers } from "@/app/api/_lib/settings-route";
import { api } from "@/convex/_generated/api";
import { parsePixelatorPayload } from "@/utils/pixelatorVariants";

const handlers = createSettingsRouteHandlers({
  serviceName: "pixelator",
  parseConfig: parsePixelatorPayload,
  get: (convex, slug) => convex.query(api.pixelatorSettings.get, { slug }),
  save: (convex, args) => convex.mutation(api.pixelatorSettings.save, args),
});

export const { GET, POST } = handlers;
