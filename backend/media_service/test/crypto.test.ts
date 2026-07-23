import { describe, expect, it } from "vitest";
import { hmac, randomReceipt, randomSlug, safeEqual } from "../src/crypto.ts";

describe("Quick Share identifiers", () => {
	it("creates short Base58 IDs without ambiguous characters", () => {
		const ids = new Set(Array.from({ length: 500 }, () => randomSlug()));
		expect(ids.size).toBe(500);
		for (const id of ids) {
			expect(id).toMatch(/^[1-9A-HJ-NP-Za-km-z]{8}$/);
		}
	});

	it("creates unguessable receipt tokens and stable HMAC identifiers", () => {
		const receipt = randomReceipt();
		expect(receipt.length).toBeGreaterThan(40);
		expect(hmac(receipt, "a".repeat(32))).toBe(hmac(receipt, "a".repeat(32)));
		expect(safeEqual(receipt, receipt)).toBe(true);
		expect(safeEqual(receipt, `${receipt}x`)).toBe(false);
	});
});
