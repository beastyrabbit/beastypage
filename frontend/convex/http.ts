import { httpRouter } from "convex/server";
import {
  upload as catdexUpload,
  options as catdexUploadOptions,
} from "./catdexHttp.js";
import { userConfig } from "./discordHttp.js";
import { quickShareInternal } from "./quickShareHttp.js";

const http = httpRouter();
http.route({
  path: "/catdex/upload",
  method: "POST",
  handler: catdexUpload,
});
http.route({
  path: "/catdex/upload",
  method: "OPTIONS",
  handler: catdexUploadOptions,
});

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
