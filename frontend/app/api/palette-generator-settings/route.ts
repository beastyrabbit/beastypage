import { createSettingsRouteHandlers } from "@/app/api/_lib/settings-route";
import { parsePaletteGeneratorPayload } from "@/utils/paletteGeneratorVariants";

const handlers = createSettingsRouteHandlers({
  serviceName: "palette generator",
  kind: "paletteGenerator",
  parseConfig: parsePaletteGeneratorPayload,
});

export const { GET, POST } = handlers;
