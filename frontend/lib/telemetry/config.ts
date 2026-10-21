export const telemetryConfig = {
  environment: process.env.NEXT_PUBLIC_APP_ENV,
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
  umamiHost: process.env.NEXT_PUBLIC_UMAMI_HOST,
  websiteId: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
  domains: process.env.NEXT_PUBLIC_UMAMI_DOMAINS,
  dsn: process.env.NEXT_PUBLIC_GLITCHTIP_DSN,
};

export const telemetryEnabled = telemetryConfig.environment === "production";
export const telemetryRelease = `beastypage@${telemetryConfig.version}`;
