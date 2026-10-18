import { createSettingsRouteHandlers } from "@/app/api/_lib/settings-route";

const handlers = createSettingsRouteHandlers({
  serviceName: "single cat",
  kind: "singleCat",
});

export const { GET, POST } = handlers;
