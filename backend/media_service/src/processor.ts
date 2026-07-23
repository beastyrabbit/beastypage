import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";
import type { Config } from "./config.ts";
import type { ConvexControlPlane } from "./convex.ts";
import type { ObjectStore } from "./objectStore.ts";
import type { ClaimedJob } from "./types.ts";

const IMAGE_MIMES = new Set([
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
	"image/avif",
	"image/heic",
	"image/heif",
	"image/tiff",
	"image/bmp",
]);
const PRESERVE_IMAGE_MIMES = new Set([
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
]);
const VIDEO_MIMES = new Set([
	"video/mp4",
	"video/quicktime",
	"video/webm",
	"video/x-matroska",
	"video/x-msvideo",
]);

class UnsupportedMediaError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UnsupportedMediaError";
	}
}

type ProcessResult = {
	state: "ready" | "unsupported" | "failed";
	detectedMime?: string;
	publicKey?: string;
	publicMime?: string;
	publicSize?: number;
	failureCode?: string;
	failureMessage?: string;
	compatibilityWarning?: string;
};

type Probe = {
	streams?: Array<{
		codec_type?: string;
		codec_name?: string;
		width?: number;
		height?: number;
		avg_frame_rate?: string;
	}>;
	format?: { format_name?: string };
};

function run(
	command: string,
	args: string[],
	timeoutMs: number,
	captureStdout = false,
) {
	return new Promise<string>((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["ignore", captureStdout ? "pipe" : "ignore", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			if (stdout.length < 2_000_000) stdout += chunk.toString("utf8");
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			if (stderr.length < 20_000) stderr += chunk.toString("utf8");
		});
		const timeout = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error(`${command} exceeded the processing time limit`));
		}, timeoutMs);
		child.once("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.once("exit", (code, signal) => {
			clearTimeout(timeout);
			if (code === 0) resolve(stdout);
			else
				reject(
					new Error(
						`${command} failed (${signal ?? code}): ${stderr.slice(-1000)}`,
					),
				);
		});
	});
}

function frameRate(value: string | undefined) {
	if (!value) return 0;
	const [numerator, denominator] = value.split("/").map(Number);
	if (!numerator || !denominator) return Number(value) || 0;
	return numerator / denominator;
}

async function validateImage(input: string) {
	const metadata = await sharp(input, {
		animated: true,
		limitInputPixels: 100_000_000,
	}).metadata();
	const width = metadata.width ?? 0;
	const height = metadata.height ?? 0;
	const pages = metadata.pages ?? 1;
	if (!width || !height || width > 16_384 || height > 16_384) {
		throw new UnsupportedMediaError("Image dimensions are unsafe");
	}
	if (pages > 500 || width * height * pages > 250_000_000) {
		throw new UnsupportedMediaError("Image has too many pixels or frames");
	}
	return metadata;
}

async function probeVideo(input: string, timeoutMs: number) {
	const output = await run(
		"ffprobe",
		["-v", "error", "-show_streams", "-show_format", "-of", "json", input],
		Math.min(timeoutMs, 60_000),
		true,
	);
	const probe = JSON.parse(output) as Probe;
	const video = probe.streams?.find((stream) => stream.codec_type === "video");
	if (!video?.width || !video.height) {
		throw new UnsupportedMediaError("No video stream was found");
	}
	if (
		video.width > 4096 ||
		video.height > 4096 ||
		video.width * video.height > 17_000_000
	) {
		throw new UnsupportedMediaError("Video exceeds the 4K safety limit");
	}
	return { probe, video };
}

async function processImage(
	input: string,
	mime: string,
	outputDir: string,
	uploadId: string,
	artifactId: string,
	store: ObjectStore,
) {
	const metadata = await validateImage(input);
	if (PRESERVE_IMAGE_MIMES.has(mime)) {
		const file = await stat(input);
		return {
			publicKey: undefined,
			publicMime: mime,
			publicSize: file.size,
		};
	}

	const hasAlpha = metadata.hasAlpha === true;
	const extension = hasAlpha ? "png" : "jpg";
	const publicMime = hasAlpha ? "image/png" : "image/jpeg";
	const output = join(outputDir, `normalized.${extension}`);
	const pipeline = sharp(input, {
		limitInputPixels: 100_000_000,
		failOn: "warning",
	}).rotate();
	if (hasAlpha) {
		await pipeline.png({ compressionLevel: 9 }).toFile(output);
	} else {
		await pipeline
			.flatten({ background: "#ffffff" })
			.jpeg({ quality: 88, mozjpeg: true })
			.toFile(output);
	}
	const publicKey = `derivatives/${uploadId}-${artifactId}.${extension}`;
	await store.putFile(publicKey, output, publicMime);
	const file = await stat(output);
	return { publicKey, publicMime, publicSize: file.size };
}

async function processVideo(
	input: string,
	outputDir: string,
	uploadId: string,
	artifactId: string,
	store: ObjectStore,
	timeoutMs: number,
) {
	const { probe, video } = await probeVideo(input, timeoutMs);
	const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
	const formatNames = new Set((probe.format?.format_name ?? "").split(","));
	const compatible =
		formatNames.has("mp4") &&
		video.codec_name === "h264" &&
		(!audio || audio.codec_name === "aac") &&
		Math.max(video.width ?? 0, video.height ?? 0) <= 1920 &&
		Math.min(video.width ?? 0, video.height ?? 0) <= 1080 &&
		frameRate(video.avg_frame_rate) <= 30;
	const output = join(outputDir, "normalized.mp4");
	const args = compatible
		? [
				"-y",
				"-i",
				input,
				"-map",
				"0:v:0",
				"-map",
				"0:a?",
				"-c",
				"copy",
				"-movflags",
				"+faststart",
				output,
			]
		: [
				"-y",
				"-i",
				input,
				"-map",
				"0:v:0",
				"-map",
				"0:a?",
				"-vf",
				"scale=w='if(gte(iw,ih),min(1920,iw),min(1080,iw))':h='if(gte(iw,ih),min(1080,ih),min(1920,ih))':force_original_aspect_ratio=decrease,fps=30",
				"-c:v",
				"libx264",
				"-preset",
				"medium",
				"-crf",
				"23",
				"-pix_fmt",
				"yuv420p",
				"-c:a",
				"aac",
				"-b:a",
				"160k",
				"-movflags",
				"+faststart",
				output,
			];
	await run("ffmpeg", args, timeoutMs);
	const publicKey = `derivatives/${uploadId}-${artifactId}.mp4`;
	await store.putFile(publicKey, output, "video/mp4");
	const file = await stat(output);
	return { publicKey, publicMime: "video/mp4", publicSize: file.size };
}

async function processOriginal(
	job: ClaimedJob,
	store: ObjectStore,
	config: Config,
	directory: string,
	artifactId: string,
): Promise<ProcessResult> {
	const input = join(directory, "original");
	await store.downloadToFile(job.upload.originalKey, input);
	const detected = await fileTypeFromFile(input);
	const mime = detected?.mime;
	if (!mime || (!IMAGE_MIMES.has(mime) && !VIDEO_MIMES.has(mime))) {
		return {
			state: "unsupported",
			detectedMime: mime,
			failureCode: "UNSUPPORTED_FORMAT",
			failureMessage:
				"The original was retained for moderation, but this format cannot be shared safely.",
		};
	}

	try {
		const normalized = IMAGE_MIMES.has(mime)
			? await processImage(
					input,
					mime,
					directory,
					job.upload.id,
					artifactId,
					store,
				)
			: await processVideo(
					input,
					directory,
					job.upload.id,
					artifactId,
					store,
					config.processingTimeoutMs,
				);
		return {
			state: "ready",
			detectedMime: mime,
			publicKey: normalized.publicKey ?? job.upload.originalKey,
			publicMime: normalized.publicMime,
			publicSize: normalized.publicSize,
		};
	} catch (error) {
		if (error instanceof UnsupportedMediaError) {
			return {
				state: "unsupported",
				detectedMime: mime,
				failureCode: "UNSAFE_MEDIA",
				failureMessage: error.message,
			};
		}
		const file = await stat(input);
		return {
			state: "ready",
			detectedMime: mime,
			publicKey: job.upload.originalKey,
			publicMime: mime,
			publicSize: file.size,
			compatibilityWarning:
				"This file could not be normalized. The safe original is being shared and may not play everywhere.",
		};
	}
}

export class MediaWorker {
	private running = false;
	private timer: NodeJS.Timeout | undefined;
	private readonly config: Config;
	private readonly control: ConvexControlPlane;
	private readonly store: ObjectStore;

	constructor(config: Config, control: ConvexControlPlane, store: ObjectStore) {
		this.config = config;
		this.control = control;
		this.store = store;
	}

	start() {
		if (!this.config.workerEnabled) return;
		void this.tick();
		this.timer = setInterval(() => void this.tick(), 2_000);
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
	}

	private async tick() {
		if (this.running) return;
		this.running = true;
		const leaseId = crypto.randomUUID();
		let job: ClaimedJob | null = null;
		try {
			job = await this.control.call<ClaimedJob | null>("claimJob", { leaseId });
			if (!job) return;
			if (job.kind === "delete") {
				await this.store.delete(job.upload.originalKey);
				if (
					job.upload.publicKey &&
					job.upload.publicKey !== job.upload.originalKey
				) {
					await this.store.delete(job.upload.publicKey);
				}
				await this.control.call("finishDelete", {
					jobId: job.jobId,
					leaseId,
				});
				return;
			}

			const directory = await mkdtemp(
				join(this.config.tempDir || tmpdir(), "job-"),
			);
			try {
				const result = await processOriginal(
					job,
					this.store,
					this.config,
					directory,
					leaseId,
				);
				const disposition = await this.control.call<{ accepted: boolean }>(
					"finishProcess",
					{
						jobId: job.jobId,
						leaseId,
						...result,
					},
				);
				if (
					!disposition.accepted &&
					result.publicKey &&
					result.publicKey !== job.upload.originalKey
				) {
					await this.store
						.delete(result.publicKey)
						.catch((deleteError) =>
							console.error(
								"[quick-share-worker] could not discard rejected derivative",
								deleteError,
							),
						);
				}
			} finally {
				await rm(directory, { recursive: true, force: true });
			}
		} catch (error) {
			console.error("[quick-share-worker] job failed", error);
			if (job?.kind === "process" && job.attempts >= 3) {
				await this.control
					.call("finishProcess", {
						jobId: job.jobId,
						leaseId,
						state: "failed",
						failureCode: "PROCESSING_FAILED",
						failureMessage: "Media processing failed after several attempts.",
					})
					.catch((finishError) =>
						console.error(
							"[quick-share-worker] could not fail job",
							finishError,
						),
					);
			}
		} finally {
			this.running = false;
		}
	}
}
