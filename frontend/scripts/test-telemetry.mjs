import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  NEXT_PUBLIC_APP_ENV: "production",
  APP_VERSION: "v0.0.0-telemetry-test",
  NEXT_PUBLIC_APP_VERSION: "v0.0.0-telemetry-test",
  NEXT_PUBLIC_UMAMI_HOST: "https://umami.telemetry.test",
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: "00000000-0000-4000-8000-000000000001",
  NEXT_PUBLIC_UMAMI_DOMAINS: "127.0.0.1",
  NEXT_PUBLIC_GLITCHTIP_DSN: "http://public@127.0.0.1:4319/1",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("clerk.telemetry.test$").toString("base64")}`,
  CLERK_SECRET_KEY: [
    "sk",
    "test",
    "telemetry-fixture-not-a-real-credential",
  ].join("_"),
  JOBS_ENABLED: "0",
};
// Never let a real upload token enter this test build.
delete env.SENTRY_AUTH_TOKEN;
for (const args of process.argv.includes("--skip-build")
  ? [
      [
        "exec",
        "playwright",
        "test",
        "--config",
        "playwright.telemetry.config.ts",
      ],
    ]
  : [
      ["run", "build"],
      [
        "exec",
        "playwright",
        "test",
        "--config",
        "playwright.telemetry.config.ts",
      ],
    ]) {
  const result = spawnSync("pnpm", args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
