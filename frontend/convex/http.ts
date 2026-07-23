import { httpRouter } from "convex/server";
import { quickShareInternal } from "./quickShareHttp.js";

const http = httpRouter();

http.route({
  path: "/quick-share/internal",
  method: "POST",
  handler: quickShareInternal,
});

export default http;
