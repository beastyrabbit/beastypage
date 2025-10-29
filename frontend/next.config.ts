import type { NextConfig } from "next";
import path from "node:path";

const remotePatterns = (() => {
  const patterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];
  const raw = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (raw) {
    try {
      const url = new URL(raw);
      patterns.push({
        protocol: url.protocol.replace(":", "") as "http" | "https",
        hostname: url.hostname,
        port: url.port || undefined,
        pathname: "/storage/**",
      });
    } catch {
      // ignore invalid URL and fall back to defaults
    }
  }
  // Local development fallback
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

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      child_process: false,
      fs: false,
    };
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "posthog-js": path.resolve(__dirname, "lib/posthog-standin.ts"),
    };
    return config;
  },
};

export default nextConfig;
