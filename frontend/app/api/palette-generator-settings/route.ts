import { createSettingsRouteHandlers } from "@/app/api/_lib/settings-route";
import { api } from "@/convex/_generated/api";
import { parsePaletteGeneratorPayload } from "@/utils/paletteGeneratorVariants";

const handlers = createSettingsRouteHandlers({
  serviceName: "palette generator",
  parseConfig: parsePaletteGeneratorPayload,
  get: (convex, slug) =>
    convex.query(api.paletteGeneratorSettings.get, { slug }),
  save: (convex, args) =>
    convex.mutation(api.paletteGeneratorSettings.save, args),
});

export const { GET, POST } = handlers;
