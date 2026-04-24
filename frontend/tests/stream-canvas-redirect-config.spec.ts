import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match.js";
import { prepareDestination } from "next/dist/shared/lib/router/utils/prepare-destination.js";
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

async function resolveStreamCanvasRedirect(
  pathname: string,
  query: Record<string, string | string[]> = {},
) {
  const redirects = await getStreamCanvasRedirects();

  for (const redirect of redirects) {
    const match = getPathMatch(redirect.source, {
      removeUnnamedParams: true,
      strict: true,
    });
    const params = match(pathname);
    if (!params) {
      continue;
    }

    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: redirect.destination,
      params,
      query,
    });

    return {
      permanent: redirect.permanent,
      hostname: parsedDestination.hostname,
      pathname: parsedDestination.pathname || "/",
      query: parsedDestination.query,
    };
  }

  return null;
}

describe("stream canvas legacy redirects", () => {
  it("configures root, nested, and trailing-slash ModDrop redirects", async () => {
    const redirects = await getStreamCanvasRedirects();

    expect(redirects).toEqual([
      {
        source: "/stream-canvas",
        destination: "https://moddrop.live/",
        permanent: false,
      },
      {
        source: "/stream-canvas/:path*",
        destination: "https://moddrop.live/:path*",
        permanent: false,
      },
      {
        source: "/stream-canvas/:path*/",
        destination: "https://moddrop.live/:path*/",
        permanent: false,
      },
    ]);
  });

  it.each([
    ["/stream-canvas", "/"],
    ["/stream-canvas/", "/"],
    ["/stream-canvas/obs", "/obs"],
    ["/stream-canvas/obs/", "/obs/"],
    ["/stream-canvas/obs/scene", "/obs/scene"],
    ["/stream-canvas/obs/scene/", "/obs/scene/"],
  ])("redirects %s to ModDrop path %s", async (sourcePath, targetPath) => {
    await expect(
      resolveStreamCanvasRedirect(sourcePath, {
        secret: "keep",
        tag: ["one", "two"],
      }),
    ).resolves.toEqual({
      permanent: false,
      hostname: "moddrop.live",
      pathname: targetPath,
      query: {
        secret: "keep",
        tag: ["one", "two"],
      },
    });
  });
});
