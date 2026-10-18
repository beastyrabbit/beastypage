import { createSettingsRouteHandlers } from "@/app/api/_lib/settings-route";
import { parsePixelatorPayload } from "@/utils/pixelatorVariants";

const handlers = createSettingsRouteHandlers({
  serviceName: "pixelator",
  kind: "pixelator",
  parseConfig: parsePixelatorPayload,
});

export const { GET, POST } = handlers;
