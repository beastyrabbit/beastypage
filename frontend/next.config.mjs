import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs/config";

const remotePatterns = [];

const allowedDevOrigins = (() => {
  const values = new Set(["*.beastypage.localhost"]);
  const envList = process.env.NEXT_ALLOWED_DEV_ORIGINS;
  if (envList) {
    for (const entry of envList.split(",")) {
      const origin = entry.trim();
      if (origin.length) {
        values.add(origin);
      }
    }
  }
  const lanHost =
    process.env.NEXT_DEV_HOST ??
    process.env.NEXT_PUBLIC_DEV_HOST ??
    process.env.LAN_HOST ??
    process.env.DEV_LAN_HOST;
  if (lanHost) {
    values.add(lanHost.trim());
  }
  return values.size ? Array.from(values) : undefined;
})();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname);

if (process.env.NEXT_SHOW_CONFIG_LOGS === "1") {
  const fs = await import("node:fs");
  console.log("[next.config] cwd=", process.cwd());
  console.log("[next.config] __dirname=", __dirname);
  console.log(
    "[next.config] next package exists=",
    fs.existsSync(path.join(projectRoot, "node_modules/next/package.json")),
  );
}

const nextConfig = {
  output: "standalone",
  productionBrowserSourceMaps: Boolean(process.env.SENTRY_AUTH_TOKEN),
  experimental: {
    serverSourceMaps: Boolean(process.env.SENTRY_AUTH_TOKEN),
    // Turbopack persists build environment values in its filesystem cache.
    turbopackFileSystemCacheForBuild: !process.env.SENTRY_AUTH_TOKEN,
  },
  serverExternalPackages: ["@napi-rs/canvas"],
  skipTrailingSlashRedirect: true,
  allowedDevOrigins,
  images: {
    remotePatterns,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  turbopack: {
    root: projectRoot,
  },
  async redirects() {
    return [
      // Stream Canvas moved to the separate ModDrop project.
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
      // Redirect old /gatcha hub to its successor category page
      // (:path* also matches zero segments, covering bare /gatcha;
      // explicit trailing-slash variants needed with skipTrailingSlashRedirect)
      {
        source: "/gatcha/testing/collection-focus",
        destination: "/tests/collection-focus",
        permanent: true,
      },
      {
        source: "/gatcha/testing/collection-focus/",
        destination: "/tests/collection-focus",
        permanent: true,
      },
      {
        source: "/gatcha/:path*",
        destination: "/projects/gacha",
        permanent: true,
      },
      {
        source: "/gatcha/:path*/",
        destination: "/projects/gacha",
        permanent: true,
      },
      // Redirect /personal to / (home)
      {
        source: "/personal",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  telemetry: false,
  silent: !process.env.SENTRY_AUTH_TOKEN,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sentryUrl: process.env.SENTRY_URL,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
    // CLI rewriting leaves a map directive on Next's generated worker bootstrap.
    // Application worker chunks remain in the upload set.
    ignore: ["**/turbopack-worker-*.js"],
    // The SDK defaults to deleting client maps only. Remove server maps too,
    // before standalone output tracing copies build artifacts into the image.
    filesToDeleteAfterUpload: [path.join(projectRoot, ".next/**/*.map")],
  },
  release: {
    create: true,
    finalize: true,
    name: `beastypage@${process.env.APP_VERSION ?? "dev"}`,
    setCommits: false,
    deploy: false,
  },
  // The plugin normally logs recoverable upload errors; release builds must fail.
  errorHandler(error) {
    throw error;
  },
  useRunAfterProductionCompileHook: true,
  bundleSizeOptimizations: { excludeDebugStatements: true },
});
