import { describe, expect, it } from "vitest";
import { assertPublicIp, clientIp, normalizeIp } from "../src/ip.ts";

describe("client IP handling", () => {
	it("only trusts forwarding headers from configured proxies", () => {
		expect(clientIp("10.1.2.3", "203.0.113.9, 10.1.2.3", ["10.0.0.0/8"])).toBe(
			"203.0.113.9",
		);
		expect(clientIp("198.51.100.2", "203.0.113.9", ["10.0.0.0/8"])).toBe(
			"198.51.100.2",
		);
		expect(
			clientIp("10.1.2.3", "1.2.3.4, 203.0.113.9, 10.2.3.4", ["10.0.0.0/8"]),
		).toBe("203.0.113.9");
	});

	it("normalizes IPv4-mapped IPv6 addresses", () => {
		expect(normalizeIp("::ffff:192.0.2.9")).toBe("192.0.2.9");
	});

	it("rejects private, loopback, and reserved import targets", () => {
		for (const address of [
			"127.0.0.1",
			"10.0.0.1",
			"192.168.1.1",
			"169.254.169.254",
			"::1",
			"fc00::1",
		]) {
			expect(() => assertPublicIp(address)).toThrow();
		}
		expect(assertPublicIp("1.1.1.1")).toBe("1.1.1.1");
	});
});
