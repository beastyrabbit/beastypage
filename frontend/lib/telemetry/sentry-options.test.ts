import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { sentryOptions } from "./sentry-options";

// Vitest selects Next.js's server entry. Exercise its installed browser SDK here.
const require = createRequire(import.meta.url);
const { BrowserClient, defaultStackParser, getDefaultIntegrations } = require(
  require.resolve("@sentry/browser", {
    paths: [require.resolve("@sentry/nextjs")],
  }),
) as typeof import("@sentry/nextjs");

vi.mock("./config", () => ({
  telemetryEnabled: true,
  telemetryRelease: "beastypage@test",
  telemetryConfig: {
    dsn: "https://public@example.test/1",
    environment: "test",
  },
}));

it("disables SDK v11 user collection and IP inference with a fake browser transport", async () => {
  const envelopes: unknown[] = [];
  const options = sentryOptions(true);
  const client = new BrowserClient({
    ...options,
    stackParser: defaultStackParser,
    integrations: getDefaultIntegrations(options).filter(
      (integration) => integration.name !== "BrowserSession",
    ),
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(envelope);
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  try {
    client.init();
    expect(client.getDataCollectionOptions().userInfo).toBe(false);
    expect(client.getDataCollectionOptions().cookies).toBe(false);
    expect(client.getDataCollectionOptions().httpBodies).toEqual([]);
    client.captureEvent({
      message: "IP privacy probe",
      user: { ip_address: "{{auto}}" },
    });
    await client.flush(2000);
    const payload = JSON.stringify(envelopes);
    expect(envelopes).toHaveLength(1);
    expect(payload).toContain('"infer_ip":"never"');
    expect(payload).not.toContain("ip_address");
    expect(payload).not.toContain("{{auto}}");
  } finally {
    await client.close(2000);
  }
});
