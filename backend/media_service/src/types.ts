export type PolicyResponse = {
	tier: "anonymous" | "signedIn";
	maxBytes: number;
	hourlyStarts: number;
	dailyBytes: number;
	active: number;
	smallCutoffBytes: number;
	smallLifetimeMs: number;
	largeLifetimeMs: number;
	chunkBytes: number;
};

export type UploadStatus = {
	id: string;
	slug: string;
	source: "file" | "url";
	originalName: string;
	originalSize: number;
	declaredMime: string | null;
	detectedMime: string | null;
	publicMime: string | null;
	publicSize: number | null;
	state:
		| "uploading"
		| "processing"
		| "ready"
		| "unsupported"
		| "failed"
		| "removed";
	publicExpiresAt: number;
	retainedUntil: number;
	extendedAt: number | null;
	completedAt: number | null;
	failureCode: string | null;
	failureMessage: string | null;
	compatibilityWarning: string | null;
	createdAt: number;
	updatedAt: number;
	originalKey?: string;
	multipartUploadId?: string | null;
	parts?: Array<{ partNumber: number; etag: string; size: number }>;
};

export type ClaimedJob = {
	jobId: string;
	kind: "process" | "delete";
	attempts: number;
	leaseExpiresAt: number;
	upload: {
		id: string;
		originalKey: string;
		publicKey: string | null;
		originalName: string;
		originalSize: number;
		declaredMime: string | null;
		retainedUntil: number;
	};
};

export type PublicUpload = {
	key: string;
	mime: string;
	size: number;
	name: string;
	expiresAt: number;
};

export type AdminUpload = UploadStatus & {
	rawIp: string;
	ipHash: string;
	ownerTokenIdentifier: string | null;
	originalKey: string;
};
