import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Config } from "../src/config.ts";
import type { ConvexControlPlane } from "../src/convex.ts";
import type { ObjectStore } from "../src/objectStore.ts";
import { MediaWorker, processOriginal } from "../src/processor.ts";
import type { ClaimedJob } from "../src/types.ts";

const mocks = vi.hoisted(() => ({
	metadata: vi.fn(),
	toFile: vi.fn(),
	fileType: vi.fn(),
}));
vi.mock("file-type", () => ({ fileTypeFromFile: mocks.fileType }));
vi.mock("node:fs/promises", () => ({
	stat: vi.fn(async () => ({ size: 16 })),
	mkdtemp: vi.fn(async () => "/tmp/media-fixture"),
	rm: vi.fn(),
}));
vi.mock("sharp", () => ({
	default: () => {
		const pipeline = {
			metadata: mocks.metadata,
			rotate: () => pipeline,
			png: () => pipeline,
			flatten: () => pipeline,
			jpeg: () => pipeline,
			toFile: mocks.toFile,
		};
		return pipeline;
	},
}));

const job: ClaimedJob = {
	jobId: "fixture-job",
	kind: "process",
	attempts: 1,
	leaseExpiresAt: 100,
	upload: {
		id: "fixture",
		originalKey: "originals/fixture",
		publicKey: null,
		originalName: "fixture.tiff",
		originalSize: 16,
		declaredMime: null,
		retainedUntil: 100,
	},
};
const config = { workerEnabled: true, processingTimeoutMs: 1000 } as Config;
const putFile = vi.fn(async () => {});
const store = {
	downloadToFile: vi.fn(async () => {}),
	putFile,
} as unknown as ObjectStore;
beforeEach(() => {
	mocks.metadata.mockResolvedValue({ width: 8, height: 8 });
	mocks.fileType.mockResolvedValue({ mime: "image/tiff" });
	mocks.toFile.mockResolvedValue({});
	putFile.mockResolvedValue();
});
afterEach(() => vi.resetAllMocks());

it("never publishes an original after metadata failure", async () => {
	mocks.metadata.mockRejectedValue(new Error("metadata unavailable"));
	const result = await processOriginal(
		job,
		store,
		config,
		"/tmp/fixture",
		"artifact",
	);
	expect(result).toMatchObject({
		state: "failed",
		failureCode: "VALIDATION_FAILED",
	});
	expect(result.publicKey).toBeUndefined();
	expect(putFile).not.toHaveBeenCalled();
});

it("keeps rejected dimensions unsupported", async () => {
	mocks.metadata.mockResolvedValue({ width: 20_000, height: 1 });
	expect(
		await processOriginal(job, store, config, "/tmp/fixture", "artifact"),
	).toMatchObject({ state: "unsupported", failureCode: "UNSAFE_MEDIA" });
});

it("allows original fallback only after validation", async () => {
	mocks.toFile.mockRejectedValue(new Error("normalization unavailable"));
	expect(
		await processOriginal(job, store, config, "/tmp/fixture", "artifact"),
	).toMatchObject({
		state: "ready",
		publicKey: job.upload.originalKey,
		compatibilityWarning: expect.any(String),
	});
});

it("retries derivative storage failures instead of publishing fallback", async () => {
	putFile.mockRejectedValue(new Error("storage unavailable"));
	await expect(
		processOriginal(job, store, config, "/tmp/fixture", "artifact"),
	).rejects.toThrow("storage failed");
});

it("drains an in-flight claim before shutdown and refuses new jobs", async () => {
	let finishClaim!: (job: null) => void;
	const claim = new Promise<null>((resolve) => {
		finishClaim = resolve;
	});
	const control = { call: vi.fn(() => claim) } as unknown as ConvexControlPlane;
	const worker = new MediaWorker(config, control, store);
	const dispatch = worker.dispatch("fixture");
	let drained = false;
	const drain = worker.drain().then(() => {
		drained = true;
	});
	expect(await worker.dispatch("another")).toBe("busy");
	expect(drained).toBe(false);
	finishClaim(null);
	await Promise.all([dispatch, drain]);
	expect(drained).toBe(true);
});
