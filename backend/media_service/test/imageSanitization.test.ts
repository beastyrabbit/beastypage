import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { expect, it } from "vitest";
import type { Config } from "../src/config.ts";
import type { ObjectStore } from "../src/objectStore.ts";
import { processOriginal } from "../src/processor.ts";
import type { ClaimedJob } from "../src/types.ts";

async function sanitize(input: Buffer) {
	const directory = await mkdtemp(join(tmpdir(), "sanitize-test-"));
	let output: Buffer | undefined;
	const store = {
		downloadToFile: async (_key: string, path: string) => {
			await writeFile(path, input);
		},
		putFile: async (_key: string, path: string) => {
			output = await readFile(path);
		},
	} as unknown as ObjectStore;
	try {
		const result = await processOriginal(
			{
				upload: { id: "fixture", originalKey: "originals/fixture" },
			} as ClaimedJob,
			store,
			{} as Config,
			directory,
			"artifact",
		);
		expect(result.state).toBe("ready");
		expect(result.publicKey).toMatch(/^derivatives\//);
		expect(output).toBeDefined();
		if (!output) throw new Error("No derivative published");
		expect(result.publicSize).toBe(output.length);
		return { output, result };
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

async function expectNoMetadata(output: Buffer) {
	const metadata = await sharp(output).metadata();
	for (const field of [
		"exif",
		"xmp",
		"iptc",
		"icc",
		"comments",
		"orientation",
	] as const) {
		expect(metadata[field]).toBeUndefined();
	}
	expect(output.includes(Buffer.from("private-fixture"))).toBe(false);
}

it.each(["jpeg", "png", "webp"] as const)(
	"removes embedded metadata from real %s images",
	async (format) => {
		const input = await sharp({
			create: {
				width: 8,
				height: 4,
				channels: 4,
				background: { r: 120, g: 40, b: 20, alpha: 0.5 },
			},
		})
			.withMetadata({ orientation: 6 })
			.withExifMerge({
				IFD0: { Artist: "private-fixture" },
				IFD3: { GPSLatitudeRef: "N", GPSLatitude: "52/1 30/1 0/1" },
			})
			.withXmp(
				'<x:xmpmeta xmlns:x="adobe:ns:meta/"><private>private-fixture</private></x:xmpmeta>',
			)
			.toFormat(format)
			.toBuffer();
		const before = await sharp(input).metadata();
		expect(before.exif).toBeDefined();
		expect(before.xmp).toBeDefined();
		expect(before.icc).toBeDefined();
		const { output, result } = await sanitize(input);
		expect(result.publicMime).toBe(`image/${format}`);
		await expectNoMetadata(output);
		const after = await sharp(output).metadata();
		expect([after.width, after.height]).toEqual([4, 8]);
		if (format !== "jpeg") {
			expect(after.hasAlpha).toBe(true);
			const expected = await sharp(input).rotate().raw().toBuffer();
			expect(await sharp(output).raw().toBuffer()).toEqual(expected);
		}
	},
);

it("keeps opaque PNG pixels lossless", async () => {
	const input = await sharp({
		create: { width: 3, height: 2, channels: 3, background: "red" },
	})
		.png()
		.toBuffer();
	const { output, result } = await sanitize(input);
	expect(result.publicMime).toBe("image/png");
	expect(await sharp(output).raw().toBuffer()).toEqual(
		await sharp(input).raw().toBuffer(),
	);
});

it.each(["gif", "webp"] as const)(
	"preserves %s frames and timing without metadata",
	async (format) => {
		const pixels = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
		let input = await sharp(pixels, {
			raw: { width: 1, height: 2, channels: 4, pageHeight: 1 },
		})
			.toFormat(format, { delay: [70, 130], loop: 3, lossless: true })
			.toBuffer();
		if (format === "gif") {
			// A GIF comment extension immediately before the trailer.
			const comment = Buffer.from("private-fixture");
			input = Buffer.concat([
				input.subarray(0, -1),
				Buffer.from([0x21, 0xfe, comment.length]),
				comment,
				Buffer.from([0, 0x3b]),
			]);
		} else {
			input = await sharp(input, { animated: true })
				.withExif({ IFD0: { Artist: "private-fixture" } })
				.webp({ lossless: true })
				.toBuffer();
		}
		expect(input.includes(Buffer.from("private-fixture"))).toBe(true);
		const { output, result } = await sanitize(input);
		expect(result.publicMime).toBe(`image/${format}`);
		await expectNoMetadata(output);
		const metadata = await sharp(output, { animated: true }).metadata();
		expect(metadata.pages).toBe(2);
		expect(metadata.delay).toEqual([70, 130]);
		expect(metadata.loop).toBe(3);
		expect(
			await sharp(output, { animated: true }).ensureAlpha().raw().toBuffer(),
		).toEqual(pixels);
	},
);
