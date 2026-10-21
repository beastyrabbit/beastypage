import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import * as Sentry from "@sentry/node";
import { initMonitoring } from "./monitoring.js";
import { scrubTelemetry } from "./privacy.js";

const discordToken = `${"A".repeat(24)}.abcdef.${"B".repeat(32)}`;

test("survives an unhandled rejection without a DSN and logs it once", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
    import { initMonitoring } from ${JSON.stringify(new URL("./monitoring.js", import.meta.url).href)};
    import ${JSON.stringify(new URL("./unhandled-rejection.js", import.meta.url).href)};
    if (initMonitoring()) throw new Error("Monitoring should be disabled");
    Promise.reject(new Error("rejection survival probe"));
    setTimeout(() => console.log("still alive"), 25);
  `,
    ],
    {
      env: { ...process.env, GLITCHTIP_DSN: "" },
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /still alive/);
  assert.equal(child.stderr.match(/Unhandled rejection:/g)?.length, 1);
});

test("configured monitoring captures an unhandled rejection once without exiting", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
    import * as Sentry from "@sentry/node";
    import { initMonitoring } from ${JSON.stringify(new URL("./monitoring.js", import.meta.url).href)};
    import ${JSON.stringify(new URL("./unhandled-rejection.js", import.meta.url).href)};
    let reports = 0;
    initMonitoring({ GLITCHTIP_DSN: "https://public@example.test/1" }, Sentry, () => ({
      send: async (envelope) => { reports += envelope[1].filter(([header]) => header.type === "event").length; return { statusCode: 200 }; },
      flush: async () => true,
    }));
    Promise.reject(new Error("rejection capture probe"));
    setTimeout(async () => {
      await Sentry.flush(2000);
      console.log("reports=" + reports);
      await Sentry.close(2000);
    }, 50);
  `,
    ],
    {
      env: { ...process.env, GLITCHTIP_DSN: "" },
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /reports=1/);
  assert.equal(child.stderr.match(/Unhandled rejection:/g)?.length, 1);
});

test("compiled error stacks resolve to TypeScript sources", () => {
  assert.ok(
    new Error("source map probe").stack?.includes("monitoring.test.ts"),
  );
});

test("scrubs nested events, breadcrumbs and transaction data without mutation", () => {
  const input = {
    request: {
      url: "https://example.test/path?%74oken=private-token&edit=private-edit&safe=yes",
      headers: {
        Authorization: "private-auth",
        Cookie: "private-cookie",
        "SET-COOKIE": "private-set-cookie",
        Accept: "application/json",
      },
      cookies: { session: "private-cookie" },
      data: "private-body",
      body: "private-body",
      query_string: [
        ["api_key", "private-key"],
        ["page", "2"],
      ],
    },
    user: { email: "person@example.test" },
    exception: {
      values: [
        {
          value: `person@example.test Bearer private-bearer ${discordToken} mfa.${"C".repeat(32)}`,
        },
      ],
    },
    breadcrumbs: [
      {
        data: {
          url: "/?signature=private-signature&code=private-code",
          body: "private-body",
          headers: [
            ["AUTHORIZATION", "private-auth"],
            ["Accept", "text/plain"],
          ],
        },
      },
    ],
    contexts: { trace: { data: { url: "/?session=private-session" } } },
    tags: { service: "discord-bot" },
  };
  const original = JSON.stringify(input);
  const output = scrubTelemetry(input);
  const encoded = JSON.stringify(output);
  assert.equal(JSON.stringify(input), original);
  assert.equal(output.request.headers.Accept, "application/json");
  assert.equal(output.tags.service, "discord-bot");
  assert.ok(encoded.includes("safe=yes"));
  assert.ok(encoded.includes('"page","2"'));
  assert.ok(encoded.includes("[Filtered]"));
  for (const value of [
    "private-",
    "person@example.test",
    discordToken,
    "mfa.CCCC",
  ])
    assert.ok(!encoded.includes(value), value);
  for (const key of [
    "Authorization",
    "Cookie",
    "SET-COOKIE",
    "cookies",
    "body",
    "user",
  ])
    assert.ok(!encoded.includes(`"${key}"`), key);
});

test("redacts secret query keys in strings, maps and pairs", () => {
  for (const key of [
    "token",
    "api_key",
    "secret",
    "password",
    "auth",
    "code",
    "session",
    "signature",
    "sig",
    "edit",
    "slug",
    "paletteSlug",
    "share",
    "imageUrl",
  ]) {
    assert.equal(
      scrubTelemetry(`https://example.test/?${key}=private-value&ok=1`),
      `https://example.test/?${key}=[Filtered]&ok=1`,
    );
    assert.equal(
      scrubTelemetry({
        request: { query_string: { [key]: "private-value", page: "2" } },
      }).request.query_string[key],
      "[Filtered]",
    );
  }
});

test("handles cycles, scrubs envelope sampling context and preserves SDK scopes", () => {
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  const input = {
    extra: cycle,
    sdkProcessingMetadata: {
      capturedSpanScope: cycle,
      dynamicSamplingContext: {
        public_key: "public-dsn-key",
        transaction: "test /?token=private-token",
      },
    },
    spans: [
      {
        data: {
          "http.request.body": "private-body",
          "http.response.header.set-cookie": "private-cookie",
        },
      },
    ],
  };
  const output = scrubTelemetry(input);
  assert.equal(output.extra.self, "[Filtered]");
  assert.equal(output.sdkProcessingMetadata.capturedSpanScope, cycle);
  assert.equal(
    output.sdkProcessingMetadata.dynamicSamplingContext.public_key,
    "public-dsn-key",
  );
  assert.equal(
    output.sdkProcessingMetadata.dynamicSamplingContext.transaction,
    "test /?token=[Filtered]",
  );
  assert.deepEqual(output.spans[0]?.data, {});
});

test("missing or empty DSN never calls SDK init, even with SENTRY_DSN set", () => {
  let calls = 0;
  const sdk = {
    init: () => {
      calls++;
      return undefined;
    },
  };
  assert.equal(
    initMonitoring({ SENTRY_DSN: "https://public@example.test/1" }, sdk),
    false,
  );
  assert.equal(initMonitoring({ GLITCHTIP_DSN: "" }, sdk), false);
  assert.equal(calls, 0);
});

test("configured SDK sends scrubbed errors and transactions through a fake transport", async () => {
  const envelopes: Array<[unknown, Array<[{ type: string }, unknown]>]> = [];
  initMonitoring(
    {
      GLITCHTIP_DSN: "https://public@example.test/1",
      GLITCHTIP_ENVIRONMENT: "production",
      APP_VERSION: "v10.0.0",
    },
    Sentry,
    () => ({
      send: async (envelope) => {
        envelopes.push(envelope);
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  );
  const client = Sentry.getClient();
  try {
    const options = client?.getOptions();
    assert.equal(options?.dataCollection?.userInfo, false);
    assert.equal(options?.dataCollection?.cookies, false);
    assert.deepEqual(options?.dataCollection?.httpBodies, []);
    assert.equal(options?.tracesSampleRate, 0.05);
    assert.equal(options?.traceLifecycle, "static");
    Sentry.addBreadcrumb({
      message: "person@example.test Bearer private-bearer",
      data: { body: "private-body" },
    });
    Sentry.captureEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "telemetry test person@example.test Bearer private-bearer",
          },
        ],
      },
      user: { email: "person@example.test" },
      request: {
        data: "private-body",
        headers: { Authorization: "private-auth" },
        url: "https://example.test/?edit=private-edit",
      },
    });
    Sentry.continueTrace(
      {
        sentryTrace: "11111111111111111111111111111111-2222222222222222-1",
        baggage: undefined,
      },
      () =>
        Sentry.startSpan(
          { name: "test /?token=private-token", forceTransaction: true },
          () => {},
        ),
    );
    assert.equal(await Sentry.flush(2000), true);
    const items = envelopes.flatMap((envelope) => envelope[1]);
    const event = items.find(([header]) => header.type === "event")?.[1] as
      | Sentry.Event
      | undefined;
    const transaction = items.find(
      ([header]) => header.type === "transaction",
    )?.[1] as Sentry.Event | undefined;
    assert.ok(event);
    assert.ok(transaction);
    assert.equal(event.release, "beastypage@v10.0.0");
    assert.equal(event.environment, "production");
    assert.equal(event.tags?.service, "discord-bot");
    assert.equal(transaction.tags?.service, "discord-bot");
    const encoded = JSON.stringify(envelopes);
    assert.ok(!encoded.includes("private-"));
    assert.ok(!encoded.includes("person@example.test"));
  } finally {
    await client?.close(2000);
  }
});

test("keeps capability URLs out of encoded transaction envelopes", async () => {
  const envelopes: Array<[unknown, Array<[{ type: string }, unknown]>]> = [];
  initMonitoring(
    { GLITCHTIP_DSN: "https://public@example.test/1" },
    Sentry,
    () => ({
      send: async (envelope) => {
        envelopes.push(envelope);
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  );
  const client = Sentry.getClient();
  const slug = "abcd1234";
  try {
    for (const origin of ["", "https://example.test"]) {
      const path = `/i/${slug}/0`;
      const url = `${origin}${path}`;
      Sentry.getIsolationScope().clearBreadcrumbs();
      const breadcrumb = {
        message: `GET ${url}`,
        data: { url },
      };
      Sentry.addBreadcrumb(breadcrumb);
      assert.equal(
        Sentry.getIsolationScope().getScopeData().breadcrumbs[0]?.data?.url,
        `${origin}/i/[Filtered]`,
      );
      Sentry.captureEvent({
        type: "transaction",
        transaction: `GET /i/${slug}`,
        start_timestamp: 1,
        timestamp: 2,
        request: { url },
        breadcrumbs: [breadcrumb],
        extra: {
          links: [
            ...["view", "adoption", "ancestry-tree", "evolution"].map(
              (route) => `${origin}/${route}/${slug}`,
            ),
            `${origin}/webhooks/123456789012345678/private-webhook-capability/messages/@original`,
            `${origin}/interactions/123456789012345678/private-interaction-capability/callback`,
            `${origin}/color-palette-creator?paletteSlug=${slug}`,
          ],
        },
        message: `Could not fetch ${url}`,
        contexts: {
          trace: {
            trace_id: "11111111111111111111111111111111",
            span_id: "2222222222222222",
            op: "http.server",
          },
        },
        spans: [
          {
            trace_id: "11111111111111111111111111111111",
            span_id: "3333333333333333",
            start_timestamp: 1,
            timestamp: 2,
            op: "http.client",
            status: "ok",
            description: `GET ${url}`,
            data: {
              url,
              "url.full": url,
              "url.path": path,
              "http.target": path,
              "http.url": url,
              "http.route": path,
              "safe.path": "/info",
              "safe.url": `${origin}/images`,
            },
          },
        ],
        sdkProcessingMetadata: {
          dynamicSamplingContext: {
            public_key: "public",
            transaction: `GET ${url}`,
          },
        },
      });
    }
    assert.equal(await Sentry.flush(2000), true);
    const transactions = envelopes
      .flatMap((envelope) => envelope[1])
      .filter(([header]) => header.type === "transaction")
      .map(([, item]) => item as Sentry.Event);
    assert.equal(transactions.length, 2);
    for (const [index, transaction] of transactions.entries()) {
      const origin = index === 0 ? "" : "https://example.test";
      const filtered = `${origin}/i/[Filtered]`;
      assert.equal(transaction.transaction, "GET /i/[Filtered]");
      assert.equal(transaction.request?.url, filtered);
      assert.equal(transaction.message, `Could not fetch ${filtered}`);
      const span = transaction.spans?.[0];
      assert.equal(span?.description, `GET ${filtered}`);
      assert.equal(span?.data?.["url.path"], "/i/[Filtered]");
      assert.equal(span?.data?.["safe.path"], "/info");
      assert.equal(span?.data?.["safe.url"], `${origin}/images`);
      assert.equal(transaction.breadcrumbs?.[0]?.data?.url, filtered);
    }
    const encoded = JSON.stringify(envelopes);
    assert.ok(encoded.includes("[Filtered]"));
    assert.ok(!encoded.includes(slug));
    assert.ok(!encoded.includes("private-"));
    for (const route of [
      "view",
      "adoption",
      "ancestry-tree",
      "evolution",
      "webhooks",
      "interactions",
    ]) {
      assert.ok(encoded.includes(`/${route}/[Filtered]`), route);
    }
  } finally {
    Sentry.getIsolationScope().clearBreadcrumbs();
    await client?.close(2000);
  }
});

test("defaults to development and raw dev release without changing SDK gating", () => {
  let options: Sentry.NodeOptions | undefined;
  initMonitoring(
    { GLITCHTIP_DSN: "https://public@example.test/1", NODE_ENV: "test" },
    {
      init: (value) => {
        options = value;
        return undefined;
      },
    },
  );
  assert.equal(options?.environment, "development");
  assert.equal(options?.release, "beastypage@dev");
});

test("removes Discord identities from structured data and HTTP breadcrumbs", () => {
  const output = scrubTelemetry({
    user: { id: "123456789012345678", username: "private-name" },
    extra: {
      discord_user_id: "123456789012345678", // gitleaks:allow fake snowflake
      discordUsername: "private-name",
      guildName: "private-guild",
    },
    message: "GET /guilds/123456789012345678",
    request: { url: "https://example.test/?discordUserId=123456789012345678" }, // gitleaks:allow fake snowflake
  });
  const encoded = JSON.stringify(output);
  assert.ok(!encoded.includes("123456789012345678"));
  assert.ok(!encoded.includes("private-name"));
  assert.ok(!encoded.includes("private-guild"));
});
