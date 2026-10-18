import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import type { Config } from "../src/config.ts";
import type { ObjectStore } from "../src/objectStore.ts";

const config: Config = {
	port: 8003,
	publicBaseUrl: "https://beastyrabbit.com",
	controlPlaneUrl: "https://frontend.example/api/internal/quick-share",
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
	it.each([
		["/i/api/uploads", undefined],
		["/i/api/imports", undefined],
		["/i/api/admin/bans", { authorization: "Bearer admin-token" }],
	])("rejects oversized JSON bodies on %s", async (path, extraHeaders) => {
		const { app } = createApp(config, {} as ObjectStore);
		const response = await app.request(`https://beastyrabbit.com${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"content-length": String(64 * 1024 + 1),
				...extraHeaders,
			},
			body: "{}",
		});
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({
			error: "Request body is too large",
		});
	});

	it("rejects malformed JSON before calling the control plane", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const { app } = createApp(config, {} as ObjectStore);
		const response = await app.request(
			"https://beastyrabbit.com/i/api/imports",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			},
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Invalid JSON body" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("serves the selected later survivor consistently for GET and HEAD", async () => {
		const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
			const request = JSON.parse(String(init?.body));
			if (request.op === "public")
				return controlResponse({ error: "unavailable" }, 404);
			return controlResponse([
				{
					key: "derivatives/later-item.png",
					mime: "image/png",
					size: 4,
					name: "later.png",
					expiresAt: Date.now() + 60_000,
				},
			]);
		});
		vi.stubGlobal("fetch", fetchMock);
		const get = vi.fn(async () => ({
			body: new Blob(["safe"]).stream(),
			contentLength: 4,
		}));
		const head = vi.fn(async () => ({ contentLength: 4 }));
		const { app } = createApp(config, { get, head } as unknown as ObjectStore);
		expect((await app.request("/i/Abcdefg1")).status).toBe(200);
		expect((await app.request("/i/Abcdefg1", { method: "HEAD" })).status).toBe(
			200,
		);
		expect(get).toHaveBeenCalledWith("derivatives/later-item.png", undefined);
		expect(head).toHaveBeenCalledWith("derivatives/later-item.png");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
	it("falls back to the legacy public operation only for unknown-operation 400s", async () => {
		const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
			const request = JSON.parse(String(init?.body));
			if (request.op === "publicCollection") {
				return controlResponse({ error: "Unknown operation" }, 400);
			}
			return controlResponse({
				key: "derivatives/legacy.png",
				mime: "image/png",
				size: 4,
				name: "legacy.png",
				expiresAt: Date.now() + 60_000,
			});
		});
		vi.stubGlobal("fetch", fetchMock);
		const get = vi.fn(async () => ({
			body: new Blob(["safe"]).stream(),
			contentLength: 4,
		}));
		const { app } = createApp(config, { get } as unknown as ObjectStore);
		expect((await app.request("/i/Abcdefg1")).status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
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
					key: "derivatives/example.png",
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
	it("does not publicly serve an image original", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				controlResponse({
					key: "originals/example",
					mime: "image/jpeg",
					size: 123,
					name: "image.jpg",
					expiresAt: Date.now() + 60_000,
				}),
			),
		);
		const store = { get: vi.fn() } as unknown as ObjectStore;
		const { app } = createApp(config, store);
		const response = await app.request("https://beastyrabbit.com/i/AbCd1234");
		expect(response.status).toBe(404);
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

	it("asks the control plane to retry when this replica is busy", async () => {
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

describe("moderation previews", () => {
	const adminUpload = {
		id: "upload1",
		slug: "Abcdefg1",
		source: "file",
		originalName: "shot.png",
		originalSize: 4,
		state: "ready",
		rawIp: "203.0.113.5",
		ipHash: "hash",
		ownerTokenIdentifier: null,
		originalKey: "originals/upload1",
		createdAt: 1,
	};

	async function listPreviews(uploads: unknown[]) {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => controlResponse(uploads)),
		);
		const get = vi.fn(async () => ({
			body: new Blob(["safe"]).stream(),
			contentLength: 4,
		}));
		const { app } = createApp(config, { get } as unknown as ObjectStore);
		const response = await app.request("/i/api/admin/uploads", {
			headers: { authorization: "Bearer admin-token" },
		});
		const body = (await response.json()) as Array<{
			previewUrl: string | null;
		}>;
		return { app, get, previews: body.map((item) => item.previewUrl) };
	}

	it("signs previews only for sanitized derivatives and videos", async () => {
		const { previews } = await listPreviews([
			{
				...adminUpload,
				publicKey: "derivatives/upload1-a.webp",
				publicMime: "image/webp",
			},
			{
				...adminUpload,
				id: "upload2",
				publicKey: "originals/upload2",
				publicMime: "video/mp4",
			},
			{
				...adminUpload,
				id: "upload3",
				publicKey: "originals/upload3",
				publicMime: "image/png",
			},
			{
				...adminUpload,
				id: "upload4",
				state: "removed",
				publicKey: "derivatives/upload4-a.webp",
				publicMime: "image/webp",
			},
			{ ...adminUpload, id: "upload5", publicMime: null },
		]);
		expect(previews[0]).toMatch(
			/^\/i\/api\/admin\/uploads\/upload1\/preview\?/,
		);
		expect(previews[1]).toMatch(
			/^\/i\/api\/admin\/uploads\/upload2\/preview\?/,
		);
		expect(previews.slice(2)).toEqual([null, null, null]);
	});

	it("serves a signed preview inline and rejects tampering", async () => {
		const { app, get, previews } = await listPreviews([
			{
				...adminUpload,
				publicKey: "derivatives/upload1-a.webp",
				publicMime: "image/webp",
			},
		]);
		const url = previews[0] as string;
		const response = await app.request(url);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/webp");
		expect(response.headers.get("content-disposition")).toBeNull();
		expect(get).toHaveBeenCalledWith("derivatives/upload1-a.webp", undefined);

		const otherId = url.replace("/upload1/", "/upload9/");
		expect((await app.request(otherId)).status).toBe(403);
		const badSignature = url.replace(/signature=[^&]+/, "signature=nope");
		expect((await app.request(badSignature)).status).toBe(403);
		const asDownload = url.replace("/preview?", "/original?");
		expect((await app.request(asDownload)).status).toBe(403);
		expect(get).toHaveBeenCalledTimes(1);
	});
});
