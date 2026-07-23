import { describe, expect, it } from "vitest";
import { validateRemoteUrl } from "../src/importer.ts";

describe("remote URL validation", () => {
	it("allows standard HTTP and HTTPS ports", () => {
		expect(validateRemoteUrl("http://example.com:80/image.png").port).toBe("");
		expect(validateRemoteUrl("https://example.com:443/image.png").port).toBe(
			"",
		);
	});

	it("rejects nonstandard ports and credentials", () => {
		expect(() =>
			validateRemoteUrl("http://example.com:6379/image.png"),
		).toThrow("standard HTTP or HTTPS port");
		expect(() =>
			validateRemoteUrl("https://user:pass@example.com/image.png"),
		).toThrow("credentials");
	});
});
