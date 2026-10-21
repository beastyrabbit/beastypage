import assert from "node:assert/strict";
import * as Sentry from "@sentry/node";
import { test } from "vitest";
import { initMonitoring } from "../src/monitoring.ts";
import { scrubTelemetry } from "../src/privacy.ts";

const discordToken = `${"A".repeat(24)}.abcdef.${"B".repeat(32)}`;
test("keeps only outbound origins in fake transport envelopes", async () => {
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
	const urls = [
		"https://cdn.discordapp.com/attachments/1/2/x.png?ex=a&is=b&hm=c#private-fragment",
	];
	try {
		for (const url of urls) {
			Sentry.getIsolationScope().clearBreadcrumbs();
			Sentry.addBreadcrumb({
				category: "http",
				message: `GET ${url}`,
				data: { url },
			});
			Sentry.captureEvent({
				type: "transaction",
				transaction: "POST /i/api/imports",
				start_timestamp: 1,
				timestamp: 2,
				request: { url },
				message: `Download ${url}`,
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
							"http.url": url,
							"server.address": url,
						},
					},
				],
			});
		}
		assert.equal(await Sentry.flush(2000), true);
		const transactions = envelopes
			.flatMap((envelope) => envelope[1])
			.filter(([header]) => header.type === "transaction")
			.map(([, item]) => item as Sentry.Event);
		assert.equal(transactions.length, urls.length);
		for (const [index, transaction] of transactions.entries()) {
			const url = urls[index];
			assert.ok(url);
			const filtered = `${new URL(url).origin}/[Filtered]`;
			assert.equal(transaction.request?.url, filtered);
			assert.equal(transaction.message, `Download ${filtered}`);
			assert.equal(transaction.breadcrumbs?.[0]?.data?.url, filtered);
			assert.equal(transaction.breadcrumbs?.[0]?.message, `GET ${filtered}`);
			assert.equal(transaction.spans?.[0]?.description, `GET ${filtered}`);
			assert.deepEqual(transaction.spans?.[0]?.data, {
				url: filtered,
				"url.full": filtered,
				"http.url": filtered,
				"server.address": filtered,
			});
		}
		const encoded = JSON.stringify(envelopes);
		for (const forbidden of [
			"/attachments",
			"/api/webhooks",
			"TOKEN",
			"ex=a",
			"is=b",
			"hm=c",
			"private-fragment",
		])
			assert.ok(!encoded.includes(forbidden), forbidden);
	} finally {
		Sentry.getIsolationScope().clearBreadcrumbs();
		await client?.close(2000);
	}
});

test("scrubs nested events, breadcrumbs and transaction data without mutation", () => {
	const input = {
		request: {
			url: "/path?%74oken=private-token&edit=private-edit&safe=yes",
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
		tags: { service: "media" },
	};
	const original = JSON.stringify(input);
	const output = scrubTelemetry(input);
	const encoded = JSON.stringify(output);
	assert.equal(JSON.stringify(input), original);
	assert.equal(output.request.headers.Accept, "application/json");
	assert.equal(output.tags.service, "media");
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
		"grant",
		"q",
	]) {
		assert.equal(
			scrubTelemetry(`/?${key}=private-value&ok=1`),
			`/?${key}=[Filtered]&ok=1`,
		);
		assert.equal(
			scrubTelemetry({
				request: { query_string: { [key]: "private-value", page: "2" } },
			}).request.query_string[key],
			"[Filtered]",
		);
	}
});

test("redacts signed admin URLs and keeps unrelated paths intact", () => {
	assert.equal(
		scrubTelemetry(
			"https://example.test/i/api/admin/uploads/upload-id/preview?grant=private-grant&signature=private-signature",
		),
		"https://example.test/[Filtered]",
	);
	for (const path of ["/info", "/images"]) {
		assert.equal(scrubTelemetry(path), path);
		assert.equal(
			scrubTelemetry(`https://example.test${path}`),
			"https://example.test/[Filtered]",
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
		assert.equal(event.tags?.service, "media");
		assert.equal(transaction.tags?.service, "media");
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
				origin ? `${origin}/[Filtered]` : "/i/[Filtered]",
			);
			Sentry.captureEvent({
				type: "transaction",
				transaction: `GET /i/${slug}`,
				start_timestamp: 1,
				timestamp: 2,
				request: { url },
				breadcrumbs: [breadcrumb],
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
			const filtered = origin ? `${origin}/[Filtered]` : "/i/[Filtered]";
			assert.equal(transaction.transaction, "GET /i/[Filtered]");
			assert.equal(transaction.request?.url, filtered);
			assert.equal(transaction.message, `Could not fetch ${filtered}`);
			const span = transaction.spans?.[0];
			assert.equal(span?.description, `GET ${filtered}`);
			assert.equal(span?.data?.["url.path"], "/i/[Filtered]");
			assert.equal(span?.data?.["safe.path"], "/info");
			assert.equal(
				span?.data?.["safe.url"],
				origin ? `${origin}/[Filtered]` : "/images",
			);
			assert.equal(transaction.breadcrumbs?.[0]?.data?.url, filtered);
		}
		const encoded = JSON.stringify(envelopes);
		assert.ok(encoded.includes("[Filtered]"));
		assert.ok(!encoded.includes(slug));
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
