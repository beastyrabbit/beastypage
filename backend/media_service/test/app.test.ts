import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import type { Config } from "../src/config.ts";
import type { ObjectStore } from "../src/objectStore.ts";

const config: Config = {
	port: 8003,
	publicBaseUrl: "https://beastyrabbit.com",
	convexSiteUrl: "https://control.example",
	internalToken: "i".repeat(32),
	hmacKey: "h".repeat(32),
	s3Endpoint: "https://s3.example",
	s3Region: "garage",
	s3Bucket: "beastypage-media",
	s3AccessKeyId: "access",
	s3SecretAccessKey: "secret",
	corsOrigins: ["https://beastyrabbit.com"],
	trustedProxyCidrs: ["10.0.0.0/8"],
	workerEnabled: false,
	tempDir: "/tmp/quick-share-test",
	processingTimeoutMs: 1_200_000,
};

function controlResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("raw media delivery", () => {
	it("returns media bytes directly with range and crawler headers", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				controlResponse({
					key: "derivatives/example.mp4",
					mime: "video/mp4",
					size: 4,
					name: "clip.mp4",
					expiresAt: Date.now() + 60_000,
				}),
			),
		);
		const get = vi.fn(async (_key: string, range?: string) => ({
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(new Uint8Array([1, 2, 3, 4]));
					controller.close();
				},
			}),
			contentLength: 4,
			contentRange: range ? "bytes 0-3/4" : undefined,
			etag: '"etag"',
		}));
		const store = {
			get,
			head: vi.fn(async () => ({ contentLength: 4, etag: '"etag"' })),
		} as unknown as ObjectStore;
		const { app } = createApp(config, store);

		const response = await app.request("https://beastyrabbit.com/i/AbCd1234", {
			headers: { range: "bytes=0-3" },
		});
		expect(response.status).toBe(206);
		expect(response.headers.get("content-type")).toBe("video/mp4");
		expect(response.headers.get("content-range")).toBe("bytes 0-3/4");
		expect(response.headers.get("location")).toBeNull();
		expect(response.headers.get("x-robots-tag")).toContain("noindex");
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array([1, 2, 3, 4]),
		);
		expect(get).toHaveBeenCalledWith("derivatives/example.mp4", "bytes=0-3");
	});

	it("supports HEAD without fetching the object body", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				controlResponse({
					key: "originals/example",
					mime: "image/png",
					size: 123,
					name: "image.png",
					expiresAt: Date.now() + 60_000,
				}),
			),
		);
		const store = {
			get: vi.fn(),
			head: vi.fn(async () => ({ contentLength: 123, etag: '"head"' })),
		} as unknown as ObjectStore;
		const { app } = createApp(config, store);
		const response = await app.request("https://beastyrabbit.com/i/AbCd1234", {
			method: "HEAD",
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("content-length")).toBe("123");
		expect(store.get).not.toHaveBeenCalled();
	});

	it("does not expose an uploader delete route", async () => {
		const store = {} as ObjectStore;
		const { app } = createApp(config, store);
		const response = await app.request(
			"https://beastyrabbit.com/i/api/uploads/id/remove",
			{ method: "POST" },
		);
		expect(response.status).toBe(404);
	});

	it("maps AWS range exceptions to a 416 response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				controlResponse({
					key: "derivatives/example.mp4",
					mime: "video/mp4",
					size: 4,
					name: "clip.mp4",
					expiresAt: Date.now() + 60_000,
				}),
			),
		);
		const store = {
			get: vi.fn(async () => {
				throw { $metadata: { httpStatusCode: 416 } };
			}),
		} as unknown as ObjectStore;
		const { app } = createApp(config, store);
		const response = await app.request("https://beastyrabbit.com/i/AbCd1234", {
			headers: { range: "bytes=99-100" },
		});
		expect(response.status).toBe(416);
		expect(response.headers.get("content-range")).toBe("bytes */4");
	});
});

describe("event-driven worker dispatch", () => {
	it("rejects dispatch requests without the internal token", async () => {
		const dispatch = vi.fn();
		const worker = { dispatch, stop: vi.fn() };
		const { app } = createApp(config, {} as ObjectStore, worker);
		const response = await app.request(
			"https://beastyrabbit.com/i/api/internal/jobs/job-id",
			{ method: "POST" },
		);

		expect(response.status).toBe(401);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it("accepts a pushed job and passes its id to the worker", async () => {
		const dispatch = vi.fn(async () => "accepted" as const);
		const worker = { dispatch, stop: vi.fn() };
		const { app } = createApp(config, {} as ObjectStore, worker);
		const response = await app.request(
			"https://beastyrabbit.com/i/api/internal/jobs/job-id",
			{
				method: "POST",
				headers: {
					"x-quick-share-internal-token": config.internalToken,
				},
			},
		);

		expect(response.status).toBe(202);
		expect(dispatch).toHaveBeenCalledWith("job-id");
	});

	it("asks Convex to retry when this replica is busy", async () => {
		const worker = {
			dispatch: vi.fn(async () => "busy" as const),
			stop: vi.fn(),
		};
		const { app } = createApp(config, {} as ObjectStore, worker);
		const response = await app.request(
			"https://beastyrabbit.com/i/api/internal/jobs/job-id",
			{
				method: "POST",
				headers: {
					"x-quick-share-internal-token": config.internalToken,
				},
			},
		);

		expect(response.status).toBe(503);
		expect(response.headers.get("retry-after")).toBe("1");
	});
});

describe("multipart upload limits", () => {
	it("rejects a chunked oversized part before passing it to storage", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				controlResponse({
					id: "upload-id",
					slug: "AbCd1234",
					source: "file",
					originalName: "clip.mp4",
					originalSize: 32 * 1024 * 1024,
					state: "uploading",
					originalKey: "originals/object",
					multipartUploadId: "multipart-id",
					parts: [],
				}),
			),
		);
		const store = {
			uploadPart: vi.fn(),
		} as unknown as ObjectStore;
		const { app } = createApp(config, store);
		const chunk = new Uint8Array(8 * 1024 * 1024);
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(chunk);
				controller.enqueue(chunk);
				controller.enqueue(new Uint8Array([1]));
				controller.close();
			},
		});
		const init: RequestInit & { duplex: "half" } = {
			method: "PUT",
			headers: { "x-upload-receipt": "receipt" },
			body,
			duplex: "half",
		};
		const response = await app.request(
			"https://beastyrabbit.com/i/api/uploads/upload-id/parts/1",
			init,
		);
		expect(response.status).toBe(413);
		expect(store.uploadPart).not.toHaveBeenCalled();
	});

	it("rejects parts beyond the declared file size before storage", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				controlResponse({
					id: "upload-id",
					slug: "AbCd1234",
					source: "file",
					originalName: "tiny.png",
					originalSize: 1,
					state: "uploading",
					originalKey: "originals/object",
					multipartUploadId: "multipart-id",
					parts: [],
				}),
			),
		);
		const store = {
			uploadPart: vi.fn(),
		} as unknown as ObjectStore;
		const { app } = createApp(config, store);
		const response = await app.request(
			"https://beastyrabbit.com/i/api/uploads/upload-id/parts/200",
			{
				method: "PUT",
				headers: { "x-upload-receipt": "receipt" },
				body: new Uint8Array([1]),
			},
		);
		expect(response.status).toBe(409);
		expect(store.uploadPart).not.toHaveBeenCalled();
	});
});

describe("multipart completion", () => {
	it("advances state when the object exists after an ambiguous storage error", async () => {
		const upload = {
			id: "upload-id",
			slug: "AbCd1234",
			source: "file",
			originalName: "clip.mp4",
			originalSize: 4,
			declaredMime: "video/mp4",
			detectedMime: null,
			publicMime: null,
			publicSize: null,
			state: "uploading",
			publicExpiresAt: Date.now() + 60_000,
			retainedUntil: Date.now() + 120_000,
			extendedAt: null,
			completedAt: null,
			failureCode: null,
			failureMessage: null,
			compatibilityWarning: null,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			originalKey: "originals/object",
			multipartUploadId: "multipart-id",
			parts: [{ partNumber: 1, etag: '"part"', size: 4 }],
		} as const;
		const completed = { ...upload, state: "processing" as const };
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(controlResponse(upload))
			.mockResolvedValueOnce(controlResponse(completed));
		vi.stubGlobal("fetch", fetchMock);
		const store = {
			completeMultipart: vi.fn(async () => {
				throw new Error("connection closed after completion");
			}),
			head: vi.fn(async () => ({ contentLength: 4, etag: '"whole"' })),
		} as unknown as ObjectStore;
		const { app } = createApp(config, store);

		const response = await app.request(
			"https://beastyrabbit.com/i/api/uploads/upload-id/complete",
			{
				method: "POST",
				headers: { "x-upload-receipt": "receipt" },
			},
		);

		expect(response.status).toBe(200);
		expect((await response.json()).state).toBe("processing");
		expect(store.head).toHaveBeenCalledWith("originals/object");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("does not advance state when the completed object size is wrong", async () => {
		const upload = {
			id: "upload-id",
			slug: "AbCd1234",
			source: "file",
			originalName: "clip.mp4",
			originalSize: 4,
			declaredMime: "video/mp4",
			detectedMime: null,
			publicMime: null,
			publicSize: null,
			state: "uploading",
			publicExpiresAt: Date.now() + 60_000,
			retainedUntil: Date.now() + 120_000,
			extendedAt: null,
			completedAt: null,
			failureCode: null,
			failureMessage: null,
			compatibilityWarning: null,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			originalKey: "originals/object",
			multipartUploadId: "multipart-id",
			parts: [{ partNumber: 1, etag: '"part"', size: 4 }],
		} as const;
		const fetchMock = vi.fn().mockResolvedValue(controlResponse(upload));
		vi.stubGlobal("fetch", fetchMock);
		const store = {
			completeMultipart: vi.fn(async () => {
				throw new Error("storage failed");
			}),
			head: vi.fn(async () => ({ contentLength: 3, etag: '"partial"' })),
		} as unknown as ObjectStore;
		const { app } = createApp(config, store);

		const response = await app.request(
			"https://beastyrabbit.com/i/api/uploads/upload-id/complete",
			{
				method: "POST",
				headers: { "x-upload-receipt": "receipt" },
			},
		);

		expect(response.status).toBe(500);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
