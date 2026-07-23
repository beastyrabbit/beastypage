import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function randomSlug(length = 8) {
	let result = "";
	while (result.length < length) {
		const bytes = randomBytes(length);
		for (const byte of bytes) {
			if (byte >= 232) continue;
			result += BASE58[byte % BASE58.length];
			if (result.length === length) break;
		}
	}
	return result;
}

export function randomReceipt() {
	return randomBytes(32).toString("base64url");
}

export function hmac(value: string, key: string) {
	return createHmac("sha256", key).update(value).digest("base64url");
}

export function safeEqual(left: string, right: string) {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	return a.length === b.length && timingSafeEqual(a, b);
}
