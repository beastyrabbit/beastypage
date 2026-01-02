import path from "node:path";
import { fileURLToPath } from "node:url";

const remotePatterns = (() => {
  const patterns = [];
  const raw = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (raw) {
    try {
      const url = new URL(raw);
      patterns.push({
        protocol: url.protocol.replace(":", ""),
        hostname: url.hostname,
        port: url.port || undefined,
        pathname: "/storage/**",
      });
    } catch {
      // ignore invalid URL and fall back to defaults
    }
  }
  if (!patterns.length) {
    patterns.push({
      protocol: "http",
      hostname: "localhost",
      port: "3210",
      pathname: "/storage/**",
    });
  }
  return patterns;
})();

const allowedDevOrigins = (() => {
  const values = new Set();
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
const posthogStandinRelative = (() => {
  const absolutePath = path.join(projectRoot, "lib/posthog-standin.ts");
  const relativePath = path
    .relative(projectRoot, absolutePath)
    .split(path.sep)
    .join("/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
})();

if (process.env.NEXT_SHOW_CONFIG_LOGS === "1") {
  const fs = await import("node:fs");
  console.log("[next.config] cwd=", process.cwd());
  console.log("[next.config] __dirname=", __dirname);
  console.log(
    "[next.config] next package exists=",
    fs.existsSync(path.join(projectRoot, "node_modules/next/package.json"))
  );
}

const nextConfig = {
  output: "standalone",
  allowedDevOrigins,
  images: {
    remotePatterns,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: projectRoot,
    resolveAlias: {
      "posthog-js": posthogStandinRelative,
    },
  },
};

export default nextConfig;
