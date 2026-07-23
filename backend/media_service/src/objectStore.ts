import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateBucketCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	PutBucketLifecycleConfigurationCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import type { Config } from "./config.ts";

export type StoredObject = {
	body: ReadableStream<Uint8Array>;
	contentLength: number;
	contentRange?: string;
	etag?: string;
	lastModified?: Date;
};

export class ObjectStore {
	readonly client: S3Client;
	private readonly config: Config;

	constructor(config: Config) {
		this.config = config;
		this.client = new S3Client({
			endpoint: config.s3Endpoint,
			region: config.s3Region,
			forcePathStyle: true,
			credentials: {
				accessKeyId: config.s3AccessKeyId,
				secretAccessKey: config.s3SecretAccessKey,
			},
		});
	}

	async ensureBucket() {
		try {
			await this.client.send(
				new HeadBucketCommand({ Bucket: this.config.s3Bucket }),
			);
		} catch {
			await this.client.send(
				new CreateBucketCommand({ Bucket: this.config.s3Bucket }),
			);
		}
		await this.client.send(
			new PutBucketLifecycleConfigurationCommand({
				Bucket: this.config.s3Bucket,
				LifecycleConfiguration: {
					Rules: [
						{
							ID: "quick-share-retention",
							Status: "Enabled",
							Filter: { Prefix: "" },
							Expiration: { Days: 30 },
							AbortIncompleteMultipartUpload: {
								DaysAfterInitiation: 1,
							},
						},
					],
				},
			}),
		);
	}

	async createMultipart(key: string) {
		const response = await this.client.send(
			new CreateMultipartUploadCommand({
				Bucket: this.config.s3Bucket,
				Key: key,
				ContentType: "application/octet-stream",
			}),
		);
		if (!response.UploadId)
			throw new Error("Object store did not return upload ID");
		return response.UploadId;
	}

	async uploadPart(
		key: string,
		uploadId: string,
		partNumber: number,
		body: Uint8Array,
	) {
		const response = await this.client.send(
			new UploadPartCommand({
				Bucket: this.config.s3Bucket,
				Key: key,
				UploadId: uploadId,
				PartNumber: partNumber,
				Body: body,
				ContentLength: body.byteLength,
			}),
		);
		if (!response.ETag)
			throw new Error("Object store did not return part ETag");
		return response.ETag;
	}

	async completeMultipart(
		key: string,
		uploadId: string,
		parts: Array<{ partNumber: number; etag: string }>,
	) {
		await this.client.send(
			new CompleteMultipartUploadCommand({
				Bucket: this.config.s3Bucket,
				Key: key,
				UploadId: uploadId,
				MultipartUpload: {
					Parts: [...parts]
						.sort((a, b) => a.partNumber - b.partNumber)
						.map((part) => ({
							PartNumber: part.partNumber,
							ETag: part.etag,
						})),
				},
			}),
		);
	}

	async abortMultipart(key: string, uploadId: string) {
		await this.client.send(
			new AbortMultipartUploadCommand({
				Bucket: this.config.s3Bucket,
				Key: key,
				UploadId: uploadId,
			}),
		);
	}

	async putFile(key: string, path: string, contentType: string) {
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.config.s3Bucket,
				Key: key,
				Body: createReadStream(path),
				ContentType: contentType,
			}),
		);
	}

	async downloadToFile(key: string, path: string) {
		const response = await this.client.send(
			new GetObjectCommand({ Bucket: this.config.s3Bucket, Key: key }),
		);
		if (!response.Body) throw new Error("Stored original is empty");
		const source = Readable.from(
			response.Body as unknown as AsyncIterable<Uint8Array>,
		);
		await pipeline(source, createWriteStream(path, { flags: "wx" }));
	}

	async head(key: string) {
		const response = await this.client.send(
			new HeadObjectCommand({ Bucket: this.config.s3Bucket, Key: key }),
		);
		return {
			contentLength: response.ContentLength ?? 0,
			etag: response.ETag,
			lastModified: response.LastModified,
		};
	}

	async get(key: string, range?: string): Promise<StoredObject> {
		const response = await this.client.send(
			new GetObjectCommand({
				Bucket: this.config.s3Bucket,
				Key: key,
				Range: range,
			}),
		);
		if (!response.Body) throw new Error("Stored object is empty");
		return {
			body: response.Body.transformToWebStream() as ReadableStream<Uint8Array>,
			contentLength: response.ContentLength ?? 0,
			contentRange: response.ContentRange,
			etag: response.ETag,
			lastModified: response.LastModified,
		};
	}

	async delete(key: string) {
		await this.client.send(
			new DeleteObjectCommand({ Bucket: this.config.s3Bucket, Key: key }),
		);
	}
}
