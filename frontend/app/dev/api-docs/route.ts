import { ApiReference } from "@scalar/nextjs-api-reference";

export const GET = ApiReference({
  sources: [
    { title: "Cat Renderer", url: "/api/renderer/openapi.json" },
    { title: "Image Processing", url: "/api/pixelator/openapi.json" },
  ],
  theme: "purple",
  darkMode: true,
});
