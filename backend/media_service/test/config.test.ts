import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const base = {
	CONTROL_PLANE_URL: "https://frontend.example/api/internal/quick-share/",
	QUICK_SHARE_INTERNAL_TOKEN: "i".repeat(32),
	QUICK_SHARE_HMAC_KEY: "h".repeat(32),
	S3_ENDPOINT: "https://s3.example",
	S3_ACCESS_KEY_ID: "access",
	S3_SECRET_ACCESS_KEY: "secret",
};

describe("media control plane configuration", () => {
	it("requires the Quick Share control-plane endpoint", () => {
		expect(loadConfig(base).controlPlaneUrl).toBe(
			"https://frontend.example/api/internal/quick-share",
		);
	});

	it("trims the configured endpoint", () => {
		expect(
			loadConfig({
				...base,
				CONTROL_PLANE_URL:
					"https://frontend.example/api/internal/quick-share///",
			}).controlPlaneUrl,
		).toBe("https://frontend.example/api/internal/quick-share");
	});
});
