import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";

type RedirectConfig = {
  source: string;
  destination: string;
  permanent?: boolean;
};

async function getStreamCanvasRedirects(): Promise<RedirectConfig[]> {
  const redirects = await nextConfig.redirects();

  return redirects.filter((redirect) =>
    redirect.source.startsWith("/stream-canvas"),
  );
}

describe("stream canvas legacy redirects", () => {
  it("configures root, nested, and trailing-slash ModDrop redirects", async () => {
    const redirects = await getStreamCanvasRedirects();

    expect(redirects).toEqual([
      {
        source: "/stream-canvas",
        destination: "https://moddrop.live/",
        permanent: true,
      },
      {
        source: "/stream-canvas/:path*",
        destination: "https://moddrop.live/:path*",
        permanent: true,
      },
      {
        source: "/stream-canvas/:path*/",
        destination: "https://moddrop.live/:path*/",
        permanent: true,
      },
    ]);
  });
});
