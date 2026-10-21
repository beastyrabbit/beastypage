import { captureException } from "@sentry/node";
import { afterEach, expect, test, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import type { ObjectStore } from "../src/objectStore.ts";

vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

afterEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

test("reports caught HTTP server failures without attaching request data", async () => {
	const config = loadConfig({
		CONTROL_PLANE_URL: "https://frontend.example.test",
		QUICK_SHARE_INTERNAL_TOKEN: "i".repeat(32),
		QUICK_SHARE_HMAC_KEY: "h".repeat(32),
		S3_ENDPOINT: "https://s3.example.test",
		S3_ACCESS_KEY_ID: "test-access",
		S3_SECRET_ACCESS_KEY: "test-secret",
		WORKER_ENABLED: "false",
	});
	vi.spyOn(console, "error").mockImplementation(() => {});
	const { app } = createApp(config, {} as ObjectStore);
	const error = new Error("unexpected failure");
	app.get("/test-failure", () => {
		throw error;
	});
	const response = await app.request("/test-failure");
	expect(response.status).toBe(500);
	expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
});
