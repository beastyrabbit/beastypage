import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { Config } from "./config.ts";
import { bearerFromHeader, ConvexControlPlane } from "./convex.ts";
import { hmac, randomReceipt, randomSlug, safeEqual } from "./crypto.ts";
import { downloadRemote } from "./importer.ts";
import { clientIp, normalizeIp } from "./ip.ts";
import { ObjectStore } from "./objectStore.ts";
import { MediaWorker } from "./processor.ts";
import type {
	AdminUpload,
	PolicyResponse,
	PublicUpload,
	UploadStatus,
} from "./types.ts";

const createSchema = z.object({
	name: z.string().trim().min(1).max(255),
	mime: z.string().trim().max(150).optional(),
	size: z.number().int().positive(),
	collectionSlug: z
		.string()
		.regex(/^[1-9A-HJ-NP-Za-km-z]{8}$/)
		.optional(),
	collectionReceipt: z.string().min(1).optional(),
});

const importSchema = z.object({
	url: z.url().max(4096),
});

const reasonSchema = z.object({
	ip: z.string().trim().min(2).max(100),
	reason: z.string().trim().max(300).optional(),
});

function statusCode(error: unknown) {
	const candidate = error as {
		status?: unknown;
		$metadata?: { httpStatusCode?: unknown };
	};
	const value = candidate.status ?? candidate.$metadata?.httpStatusCode;
	return typeof value === "number" ? value : 500;
}

const PART_BYTES = 16 * 1024 * 1024;

async function readBodyLimited(
	body: ReadableStream<Uint8Array> | null,
	limit: number,
) {
	if (!body) return new Uint8Array();
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > limit) {
				await reader.cancel("body exceeds limit").catch(() => {});
				throw new Error("PART_TOO_LARGE");
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

const downloadGrantSchema = z.object({
	uploadId: z.string().min(1),
	key: z.string().min(1),
	name: z.string().min(1).max(255),
	expiresAt: z.number().int().positive(),
});

function receipt(c: { req: { header(name: string): string | undefined } }) {
	const value = c.req.header("x-upload-receipt")?.trim();
	return value || undefined;
}

function receiptHash(value: string, key: string) {
	return hmac(`receipt:${value}`, key);
}

function clientIpHash(value: string, key: string) {
	return hmac(`ip:${value}`, key);
}

function grantSignature(value: string, key: string) {
	return hmac(`grant:${value}`, key);
}

function safeName(value: string) {
	return (
		Array.from(value)
			.filter((character) => {
				const code = character.charCodeAt(0);
				return code > 31 && code !== 127;
			})
			.join("")
			.replace(/[\\/]/g, "_")
			.trim()
			.slice(0, 255) || "shared-media"
	);
}

function withLink<T extends { slug: string }>(value: T, config: Config) {
	return {
		...value,
		url: `${config.publicBaseUrl}/i/${value.slug}`,
	};
}

function unavailable() {
	return new Response(null, {
		status: 404,
		headers: {
			"cache-control": "no-store",
			"x-content-type-options": "nosniff",
			"x-robots-tag": "noindex, noarchive, nosnippet",
		},
	});
}

type WorkerDispatcher = Pick<MediaWorker, "dispatch" | "stop">;

export function createApp(
	config: Config,
	store = new ObjectStore(config),
	workerOverride?: WorkerDispatcher,
) {
	const app = new Hono();
	const control = new ConvexControlPlane(config);
	const worker = workerOverride ?? new MediaWorker(config, control, store);

	app.use(
		"*",
		cors({
			origin: (origin) =>
				!origin || config.corsOrigins.includes(origin) ? origin : "",
			allowHeaders: [
				"authorization",
				"content-type",
				"content-length",
				"x-upload-receipt",
			],
			exposeHeaders: [
				"content-length",
				"content-range",
				"etag",
				"accept-ranges",
			],
			allowMethods: ["GET", "HEAD", "POST", "PUT", "OPTIONS"],
			maxAge: 600,
		}),
	);

	app.use("*", async (c, next) => {
		await next();
		c.header("X-Content-Type-Options", "nosniff");
		c.header("X-Robots-Tag", "noindex, noarchive, nosnippet");
		c.header("Referrer-Policy", "no-referrer");
	});

	app.onError((error, c) => {
		if (error instanceof z.ZodError) {
			return c.json({ error: "Invalid request" }, 400);
		}
		if (typeof error === "object" && error !== null && "$metadata" in error) {
			if (statusCode(error) === 404 && /^\/i\/[^/]+$/.test(c.req.path)) {
				return unavailable();
			}
			console.error("[quick-share] object store request failed", error);
			return c.json({ error: "Quick Share is temporarily unavailable" }, 502);
		}
		const status = statusCode(error);
		if (status >= 500) console.error("[quick-share] request failed", error);
		return c.json(
			{
				error:
					status >= 500
						? "Quick Share is temporarily unavailable"
						: error.message,
			},
			status as 400,
		);
	});

	function requestContext(c: Parameters<typeof getConnInfo>[0]) {
		const bearer = bearerFromHeader(c.req.header("authorization"));
		let remote: string | undefined;
		try {
			remote = getConnInfo(c).remote.address;
		} catch {
			// Hono's in-memory request helper has no Node socket. Production
			// requests always use the Node adapter; the safe fallback is an
			// anonymous, non-routable identity.
			remote = undefined;
		}
		const ip = clientIp(
			remote,
			c.req.header("x-forwarded-for"),
			config.trustedProxyCidrs,
		);
		const ipHash = clientIpHash(ip, config.hmacKey);
		return { bearer, ip, ipHash };
	}

	app.get("/health", (c) => c.json({ status: "ok", service: "quick-share" }));

	app.post("/i/api/internal/jobs/:id", async (c) => {
		const token = c.req.header("x-quick-share-internal-token");
		if (!token || !safeEqual(token, config.internalToken)) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		const outcome = await worker.dispatch(c.req.param("id"));
		if (outcome === "busy") {
			c.header("Retry-After", "1");
			return c.json({ error: "Worker is busy" }, 503);
		}
		if (outcome === "not-claimable") return c.body(null, 204);
		return c.json({ accepted: true }, 202);
	});

	app.get("/i/api/policy", async (c) => {
		const { bearer } = requestContext(c);
		const policy = await control.call<PolicyResponse>("policy", {}, bearer);
		return c.json(policy);
	});

	app.post("/i/api/uploads", async (c) => {
		const input = createSchema.parse(await c.req.json());
		const context = requestContext(c);
		if (context.ip === "0.0.0.0") {
			return c.json({ error: "Client IP could not be verified" }, 400);
		}
		const policy = await control.call<PolicyResponse>(
			"policy",
			{},
			context.bearer,
		);
		if (input.size > policy.maxBytes) {
			return c.json({ error: "File is larger than the current limit" }, 413);
		}

		const receiptToken = randomReceipt();
		const receiptHashValue = receiptHash(receiptToken, config.hmacKey);
		const originalKey = `originals/${randomUUID()}`;
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const slug = input.collectionSlug ?? randomSlug();
			const multipartUploadId = await store.createMultipart(originalKey);
			try {
				const created = await control.call<{
					id: string;
					slug: string;
					publicExpiresAt: number;
					retainedUntil: number;
				}>(
					"create",
					{
						slug,
						source: "file",
						originalName: safeName(input.name),
						declaredMime: input.mime,
						originalSize: input.size,
						originalKey,
						multipartUploadId,
						...(input.collectionReceipt
							? {
									collectionReceiptHash: receiptHash(
										input.collectionReceipt,
										config.hmacKey,
									),
								}
							: {}),
						receiptHash: receiptHashValue,
						rateIdentity: `ip:${context.ipHash}`,
						ipHash: context.ipHash,
						rawIp: context.ip,
					},
					context.bearer,
				);
				return c.json(
					{
						uploadId: created.id,
						slug: created.slug,
						receipt: receiptToken,
						url: `${config.publicBaseUrl}/i/${created.slug}`,
						publicExpiresAt: created.publicExpiresAt,
						retainedUntil: created.retainedUntil,
						chunkBytes: policy.chunkBytes,
					},
					201,
				);
			} catch (error) {
				await store
					.abortMultipart(originalKey, multipartUploadId)
					.catch(() => {});
				if (
					error instanceof Error &&
					error.message.includes("SLUG_COLLISION")
				) {
					continue;
				}
				throw error;
			}
		}
		return c.json({ error: "Could not allocate a short link" }, 503);
	});

	app.put("/i/api/uploads/:id/parts/:part", async (c) => {
		const context = requestContext(c);
		const receiptToken = receipt(c);
		if (!receiptToken) return c.json({ error: "Missing upload receipt" }, 401);
		const receiptHashValue = receiptHash(receiptToken, config.hmacKey);
		const uploadId = c.req.param("id");
		const partNumber = Number(c.req.param("part"));
		if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 200) {
			return c.json({ error: "Invalid part number" }, 400);
		}
		const upload = await control.call<UploadStatus>(
			"getUpload",
			{
				uploadId,
				receiptHash: receiptHashValue,
			},
			context.bearer,
		);
		if (
			upload.state !== "uploading" ||
			!upload.originalKey ||
			!upload.multipartUploadId
		) {
			return c.json({ error: "Upload is not accepting parts" }, 409);
		}
		const expectedParts = Math.ceil(upload.originalSize / PART_BYTES);
		if (partNumber > expectedParts) {
			return c.json({ error: "Part is outside the declared file size" }, 409);
		}
		const expectedSize =
			partNumber === expectedParts
				? upload.originalSize - PART_BYTES * (expectedParts - 1)
				: PART_BYTES;
		const declaredLength = Number(c.req.header("content-length") ?? 0);
		if (declaredLength > PART_BYTES) {
			return c.json({ error: "Part exceeds 16 MiB" }, 413);
		}
		if (declaredLength > 0 && declaredLength !== expectedSize) {
			return c.json(
				{ error: "Part size does not match the declared file" },
				409,
			);
		}
		let body: Uint8Array;
		try {
			body = await readBodyLimited(c.req.raw.body, PART_BYTES);
		} catch (error) {
			if (error instanceof Error && error.message === "PART_TOO_LARGE") {
				return c.json({ error: "Part exceeds 16 MiB" }, 413);
			}
			throw error;
		}
		if (body.byteLength === 0) {
			return c.json({ error: "Part must be between 1 byte and 16 MiB" }, 413);
		}
		if (body.byteLength !== expectedSize) {
			return c.json(
				{ error: "Part size does not match the declared file" },
				409,
			);
		}
		const etag = await store.uploadPart(
			upload.originalKey,
			upload.multipartUploadId,
			partNumber,
			body,
		);
		await control.call(
			"recordPart",
			{
				uploadId,
				receiptHash: receiptHashValue,
				partNumber,
				etag,
				size: body.byteLength,
			},
			context.bearer,
		);
		return c.json({ partNumber, etag });
	});

	app.post("/i/api/uploads/:id/complete", async (c) => {
		const context = requestContext(c);
		const receiptToken = receipt(c);
		if (!receiptToken) return c.json({ error: "Missing upload receipt" }, 401);
		const receiptHashValue = receiptHash(receiptToken, config.hmacKey);
		const uploadId = c.req.param("id");
		const upload = await control.call<UploadStatus>(
			"getUpload",
			{ uploadId, receiptHash: receiptHashValue },
			context.bearer,
		);
		if (upload.state !== "uploading") {
			return c.json(withLink(upload, config));
		}
		if (!upload.originalKey || !upload.multipartUploadId || !upload.parts) {
			return c.json({ error: "Upload is incomplete" }, 409);
		}
		const parts = [...upload.parts].sort(
			(left, right) => left.partNumber - right.partNumber,
		);
		const expectedParts = Math.ceil(upload.originalSize / (16 * 1024 * 1024));
		const total = parts.reduce((sum, part) => sum + part.size, 0);
		const contiguous = parts.every(
			(part, index) => part.partNumber === index + 1,
		);
		if (
			parts.length !== expectedParts ||
			total !== upload.originalSize ||
			!contiguous
		) {
			return c.json({ error: "Not all file parts have arrived" }, 409);
		}
		try {
			await store.completeMultipart(
				upload.originalKey,
				upload.multipartUploadId,
				parts,
			);
		} catch (error) {
			// Completing a multipart upload is not inherently retryable: the
			// object may exist even though the client lost the success response.
			// Treat an object with the exact declared size as completed so a
			// later request can still advance the Convex state machine.
			const stored = await store.head(upload.originalKey).catch(() => null);
			if (stored?.contentLength !== upload.originalSize) throw error;
		}
		const completed = await control.call<UploadStatus>(
			"complete",
			{ uploadId, receiptHash: receiptHashValue },
			context.bearer,
		);
		return c.json(withLink(completed, config));
	});

	app.post("/i/api/imports", async (c) => {
		const input = importSchema.parse(await c.req.json());
		const context = requestContext(c);
		if (context.ip === "0.0.0.0") {
			return c.json({ error: "Client IP could not be verified" }, 400);
		}
		const policy = await control.call<PolicyResponse>(
			"policy",
			{},
			context.bearer,
		);
		const receiptToken = randomReceipt();
		const receiptHashValue = receiptHash(receiptToken, config.hmacKey);
		const originalKey = `originals/${randomUUID()}`;
		let reserved:
			| {
					id: string;
					slug: string;
					publicExpiresAt: number;
					retainedUntil: number;
			  }
			| undefined;
		for (let attempt = 0; attempt < 5; attempt += 1) {
			try {
				reserved = await control.call(
					"create",
					{
						slug: randomSlug(),
						source: "url",
						originalName: "remote-media",
						originalSize: policy.maxBytes,
						importReservedBytes: policy.maxBytes,
						originalKey,
						receiptHash: receiptHashValue,
						rateIdentity: `ip:${context.ipHash}`,
						ipHash: context.ipHash,
						rawIp: context.ip,
					},
					context.bearer,
				);
				break;
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("SLUG_COLLISION")
				) {
					continue;
				}
				throw error;
			}
		}
		if (!reserved) throw new Error("Could not allocate a short link");
		await mkdir(config.tempDir, { recursive: true, mode: 0o700 });
		const directory = await mkdtemp(join(config.tempDir, "import-"));
		const destination = join(directory, "original");
		try {
			const remote = await downloadRemote(
				input.url,
				destination,
				policy.maxBytes,
			);
			await store.putFile(
				originalKey,
				remote.path,
				remote.mime ?? "application/octet-stream",
			);
			const completed = await control.call<UploadStatus>(
				"finishImport",
				{
					uploadId: reserved.id,
					receiptHash: receiptHashValue,
					originalName: safeName(remote.name),
					declaredMime: remote.mime,
					originalSize: remote.size,
				},
				context.bearer,
			);
			return c.json(
				{
					...withLink(completed, config),
					receipt: receiptToken,
				},
				201,
			);
		} catch (error) {
			await control
				.call(
					"failImport",
					{ uploadId: reserved.id, receiptHash: receiptHashValue },
					context.bearer,
				)
				.catch(() => {});
			throw error;
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	app.get("/i/api/uploads/:id/status", async (c) => {
		const context = requestContext(c);
		const receiptToken = receipt(c);
		const upload = await control.call<UploadStatus>(
			"getUpload",
			{
				uploadId: c.req.param("id"),
				receiptHash: receiptToken
					? receiptHash(receiptToken, config.hmacKey)
					: undefined,
			},
			context.bearer,
		);
		return c.json(withLink(upload, config));
	});

	app.get("/i/api/account/uploads", async (c) => {
		const { bearer } = requestContext(c);
		if (!bearer) return c.json({ error: "Unauthorized" }, 401);
		const uploads = await control.call<UploadStatus[]>(
			"accountList",
			{},
			bearer,
		);
		return c.json(uploads.map((upload) => withLink(upload, config)));
	});

	app.post("/i/api/account/uploads/:id/extend", async (c) => {
		const { bearer } = requestContext(c);
		if (!bearer) return c.json({ error: "Unauthorized" }, 401);
		const upload = await control.call<UploadStatus>(
			"extend",
			{ uploadId: c.req.param("id") },
			bearer,
		);
		return c.json(withLink(upload, config));
	});

	app.get("/i/api/admin/uploads", async (c) => {
		const { bearer } = requestContext(c);
		if (!bearer) return c.json({ error: "Unauthorized" }, 401);
		const query = c.req.query("q")?.trim();
		const ipQuery =
			query && (query.includes(".") || query.includes(":"))
				? clientIpHash(normalizeIp(query), config.hmacKey)
				: undefined;
		const uploads = await control.call<AdminUpload[]>(
			"adminList",
			{
				slug: query && !ipQuery ? query : undefined,
				ipHash: ipQuery,
			},
			bearer,
		);
		return c.json(
			uploads.map((upload) => ({
				...withLink(upload, config),
				originalDownloadUrl: `/i/api/admin/uploads/${upload.id}/original-link`,
			})),
		);
	});

	app.get("/i/api/admin/uploads/:id/original-link", async (c) => {
		const { bearer } = requestContext(c);
		if (!bearer) return c.json({ error: "Unauthorized" }, 401);
		const upload = await control.call<AdminUpload>(
			"adminGet",
			{ uploadId: c.req.param("id") },
			bearer,
		);
		const grant = Buffer.from(
			JSON.stringify({
				uploadId: upload.id,
				key: upload.originalKey,
				name: upload.originalName,
				expiresAt: Date.now() + 60_000,
			}),
		).toString("base64url");
		const signature = grantSignature(grant, config.hmacKey);
		return c.json({
			url: `/i/api/admin/uploads/${upload.id}/original?grant=${encodeURIComponent(
				grant,
			)}&signature=${encodeURIComponent(signature)}`,
		});
	});

	app.get("/i/api/admin/uploads/:id/original", async (c) => {
		const grant = c.req.query("grant");
		const signature = c.req.query("signature");
		if (
			!grant ||
			!signature ||
			!safeEqual(grantSignature(grant, config.hmacKey), signature)
		) {
			return c.json({ error: "Download link is invalid or expired" }, 403);
		}
		let downloadGrant: z.infer<typeof downloadGrantSchema>;
		try {
			downloadGrant = downloadGrantSchema.parse(
				JSON.parse(Buffer.from(grant, "base64url").toString("utf8")),
			);
		} catch {
			return c.json({ error: "Download link is invalid or expired" }, 403);
		}
		const now = Date.now();
		if (
			downloadGrant.uploadId !== c.req.param("id") ||
			downloadGrant.expiresAt < now ||
			downloadGrant.expiresAt > now + 90_000
		) {
			return c.json({ error: "Download link is invalid or expired" }, 403);
		}
		const object = await store.get(downloadGrant.key);
		return new Response(object.body, {
			status: 200,
			headers: {
				"content-type": "application/octet-stream",
				"content-length": String(object.contentLength),
				"content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
					downloadGrant.name,
				)}`,
				"cache-control": "private, no-store",
				"x-content-type-options": "nosniff",
				"x-robots-tag": "noindex, noarchive, nosnippet",
			},
		});
	});

	app.post("/i/api/admin/bans", async (c) => {
		const { bearer } = requestContext(c);
		if (!bearer) return c.json({ error: "Unauthorized" }, 401);
		const input = reasonSchema.parse(await c.req.json());
		const ip = normalizeIp(input.ip);
		if (ip === "0.0.0.0") {
			return c.json({ error: "This fallback address cannot be banned" }, 400);
		}
		await control.call(
			"adminBan",
			{
				rawIp: ip,
				ipHash: clientIpHash(ip, config.hmacKey),
				reason: input.reason,
			},
			bearer,
		);
		return c.json({ ok: true });
	});

	app.post("/i/api/admin/bans/remove", async (c) => {
		const { bearer } = requestContext(c);
		if (!bearer) return c.json({ error: "Unauthorized" }, 401);
		const input = reasonSchema.pick({ ip: true }).parse(await c.req.json());
		const ip = normalizeIp(input.ip);
		if (ip === "0.0.0.0") {
			return c.json({ error: "This fallback address cannot be unbanned" }, 400);
		}
		await control.call(
			"adminUnban",
			{ ipHash: clientIpHash(ip, config.hmacKey) },
			bearer,
		);
		return c.json({ ok: true });
	});

	app.post("/i/api/admin/uploads/:id/remove", async (c) => {
		const { bearer } = requestContext(c);
		if (!bearer) return c.json({ error: "Unauthorized" }, 401);
		await control.call("adminRemove", { uploadId: c.req.param("id") }, bearer);
		return c.json({ ok: true });
	});

	async function servePublic(
		slug: string,
		method: "GET" | "HEAD",
		range?: string,
	) {
		if (!/^[1-9A-HJ-NP-Za-km-z]{8}$/.test(slug)) return unavailable();
		let upload: PublicUpload;
		try {
			upload = await control.call<PublicUpload>("public", { slug });
		} catch (error) {
			if (statusCode(error) === 404) return unavailable();
			throw error;
		}
		const headers = new Headers({
			"content-type": upload.mime,
			"content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(
				upload.name,
			)}`,
			"accept-ranges": "bytes",
			"cache-control": "private, no-store",
			"x-content-type-options": "nosniff",
			"x-robots-tag": "noindex, noarchive, nosnippet",
		});
		if (method === "HEAD") {
			const metadata = await store.head(upload.key);
			headers.set("content-length", String(metadata.contentLength));
			if (metadata.etag) headers.set("etag", metadata.etag);
			if (metadata.lastModified) {
				headers.set("last-modified", metadata.lastModified.toUTCString());
			}
			return new Response(null, { status: 200, headers });
		}
		try {
			const object = await store.get(upload.key, range);
			headers.set("content-length", String(object.contentLength));
			if (object.contentRange)
				headers.set("content-range", object.contentRange);
			if (object.etag) headers.set("etag", object.etag);
			if (object.lastModified) {
				headers.set("last-modified", object.lastModified.toUTCString());
			}
			return new Response(object.body, {
				status: object.contentRange ? 206 : 200,
				headers,
			});
		} catch (error) {
			if (statusCode(error) === 416) {
				headers.set("content-range", `bytes */${upload.size}`);
				return new Response(null, { status: 416, headers });
			}
			throw error;
		}
	}

	async function publicCollection(slug: string) {
		if (!/^[1-9A-HJ-NP-Za-km-z]{8}$/.test(slug)) return [];
		let result: PublicUpload[] | PublicUpload;
		try {
			result = await control.call<PublicUpload[]>("publicCollection", { slug });
		} catch (error) {
			// Allows the media service to roll out before the new Convex operation.
			if (statusCode(error) < 500) throw error;
			result = await control.call<PublicUpload>("public", { slug });
		}
		return Array.isArray(result) ? result : [result];
	}

	app.get("/i/:slug/:item", async (c) => {
		const items = await publicCollection(c.req.param("slug"));
		const index = Number(c.req.param("item"));
		if (!Number.isInteger(index) || index < 0 || index >= items.length)
			return unavailable();
		const item = items[index];
		const object = await store.get(item.key, c.req.header("range"));
		return new Response(object.body, {
			status: object.contentRange ? 206 : 200,
			headers: {
				"content-type": item.mime,
				"content-length": String(object.contentLength),
				...(object.contentRange
					? { "content-range": object.contentRange }
					: {}),
				"accept-ranges": "bytes",
				"cache-control": "private, no-store",
				"x-content-type-options": "nosniff",
			},
		});
	});

	app.get("/i/:slug", async (c) => {
		const items = await publicCollection(c.req.param("slug"));
		if (items.length > 1) {
			const cards = items
				.map((item, index) =>
					item.mime.startsWith("video/")
						? `<video controls playsinline preload="metadata" src="/i/${c.req.param("slug")}/${index}"></video>`
						: `<img src="/i/${c.req.param("slug")}/${index}" alt="">`,
				)
				.join("");
			return c.html(
				`<!doctype html><html><head><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shared media</title><style>body{margin:0;background:#111;color:#eee;font-family:system-ui;padding:24px}main{max-width:1100px;margin:auto;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))}img,video{display:block;width:100%;max-height:80vh;object-fit:contain;background:#000;border-radius:8px}</style></head><body><main>${cards}</main></body></html>`,
			);
		}
		return servePublic(
			c.req.param("slug"),
			c.req.method === "HEAD" ? "HEAD" : "GET",
			c.req.header("range"),
		);
	});

	return { app, control, store, worker };
}
