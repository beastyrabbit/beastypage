import { z } from "zod";

const booleanFromEnv = z
	.string()
	.optional()
	.transform((value) => value !== "false" && value !== "0");

const schema = z.object({
	PORT: z.coerce.number().int().min(1).max(65535).default(8003),
	PUBLIC_BASE_URL: z.url().default("https://beastyrabbit.com"),
	CONVEX_SITE_URL: z.url(),
	QUICK_SHARE_INTERNAL_TOKEN: z.string().min(24),
	QUICK_SHARE_HMAC_KEY: z.string().min(32),
	S3_ENDPOINT: z.url(),
	S3_REGION: z.string().min(1).default("garage"),
	S3_BUCKET: z.string().min(3).default("beastypage-media"),
	S3_ACCESS_KEY_ID: z.string().min(1),
	S3_SECRET_ACCESS_KEY: z.string().min(1),
	CORS_ORIGINS: z.string().default("http://frontend.localhost:1355"),
	TRUSTED_PROXY_CIDRS: z.string().default("10.0.0.0/8"),
	WORKER_ENABLED: booleanFromEnv,
	TEMP_DIR: z.string().default("/tmp/quick-share"),
	PROCESSING_TIMEOUT_MS: z.coerce
		.number()
		.int()
		.positive()
		.default(20 * 60 * 1000),
});

export type Config = {
	port: number;
	publicBaseUrl: string;
	convexSiteUrl: string;
	internalToken: string;
	hmacKey: string;
	s3Endpoint: string;
	s3Region: string;
	s3Bucket: string;
	s3AccessKeyId: string;
	s3SecretAccessKey: string;
	corsOrigins: string[];
	trustedProxyCidrs: string[];
	workerEnabled: boolean;
	tempDir: string;
	processingTimeoutMs: number;
};

export function loadConfig(environment = process.env): Config {
	const parsed = schema.parse(environment);
	return {
		port: parsed.PORT,
		publicBaseUrl: parsed.PUBLIC_BASE_URL.replace(/\/+$/, ""),
		convexSiteUrl: parsed.CONVEX_SITE_URL.replace(/\/+$/, ""),
		internalToken: parsed.QUICK_SHARE_INTERNAL_TOKEN,
		hmacKey: parsed.QUICK_SHARE_HMAC_KEY,
		s3Endpoint: parsed.S3_ENDPOINT,
		s3Region: parsed.S3_REGION,
		s3Bucket: parsed.S3_BUCKET,
		s3AccessKeyId: parsed.S3_ACCESS_KEY_ID,
		s3SecretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
		corsOrigins: parsed.CORS_ORIGINS.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		trustedProxyCidrs: parsed.TRUSTED_PROXY_CIDRS.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
		workerEnabled: parsed.WORKER_ENABLED,
		tempDir: parsed.TEMP_DIR,
		processingTimeoutMs: parsed.PROCESSING_TIMEOUT_MS,
	};
}
