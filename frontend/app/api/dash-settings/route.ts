import { createSettingsRouteHandlers } from "@/app/api/_lib/settings-route";

const handlers = createSettingsRouteHandlers({
  serviceName: "dash",
  kind: "dash",
});

export const { GET, POST } = handlers;
