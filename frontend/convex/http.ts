import { httpRouter } from "convex/server";
import { userConfig } from "./discordHttp.js";
import { quickShareInternal } from "./quickShareHttp.js";

const http = httpRouter();
http.route({
  path: "/discord/user-config",
  method: "POST",
  handler: userConfig,
});

http.route({
  path: "/quick-share/internal",
  method: "POST",
  handler: quickShareInternal,
});

export default http;
