import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const base = {
	CONVEX_SITE_URL: "https://control.example/",
	QUICK_SHARE_INTERNAL_TOKEN: "i".repeat(32),
	QUICK_SHARE_HMAC_KEY: "h".repeat(32),
	S3_ENDPOINT: "https://s3.example",
	S3_ACCESS_KEY_ID: "access",
	S3_SECRET_ACCESS_KEY: "secret",
};

describe("media control plane configuration", () => {
	it("defaults to the Convex Quick Share endpoint", () => {
		expect(loadConfig(base).controlPlaneUrl).toBe(
			"https://control.example/quick-share/internal",
		);
	});

	it("uses the configured PostgreSQL-compatible endpoint", () => {
		expect(
			loadConfig({
				...base,
				CONTROL_PLANE_URL: "https://frontend.example/api/internal/quick-share/",
			}).controlPlaneUrl,
		).toBe("https://frontend.example/api/internal/quick-share");
	});
});
