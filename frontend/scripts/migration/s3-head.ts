import { createHash, createHmac } from "node:crypto";

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer | string, value: string) =>
  createHmac("sha256", key).update(value).digest();
function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** RFC 3986 encoding per S3 path segment, keeping `/`. */
export function encodeS3Path(path: string): string {
  return path
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.codePointAt(0)?.toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

/** AWS Signature Version 4 `Authorization` header for a request without a body. */
export function signV4(
  method: string,
  url: URL,
  headers: Record<string, string>,
  credentials: S3Credentials,
  now: Date,
): string {
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const lowered = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
  );
  const signedHeaders = Object.keys(lowered).sort(compareCodeUnits);
  const canonicalRequest = [
    method,
    url.pathname,
    [...url.searchParams.entries()]
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .sort((a, b) => compareCodeUnits(`${a[0]},${a[1]}`, `${b[0]},${b[1]}`))
      .join("&"),
    ...signedHeaders.map((name) => `${name}:${lowered[name]}`),
    "",
    signedHeaders.join(";"),
    lowered["x-amz-content-sha256"] ?? EMPTY_SHA256,
  ].join("\n");
  const scope = `${day}/${credentials.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const key = hmac(
    hmac(
      hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), credentials.region),
      "s3",
    ),
    "aws4_request",
  );
  const signature = createHmac("sha256", key)
    .update(stringToSign)
    .digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`;
}

export interface HeadResult {
  status: number;
  size: number | null;
  contentType: string | null;
}

/**
 * HEAD one object (path-style, as the media service uses). Read-only by
 * construction: this module issues no other method.
 */
export async function headObject(
  endpoint: string,
  bucket: string,
  key: string,
  credentials: S3Credentials,
): Promise<HeadResult> {
  const objectPath = encodeS3Path(`/${bucket}/${key}`);
  const url = new URL(objectPath, endpoint);
  const now = new Date();
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": EMPTY_SHA256,
    "x-amz-date": now.toISOString().replace(/[-:]|\.\d{3}/g, ""),
  };
  const response = await fetch(url, {
    method: "HEAD",
    headers: {
      ...headers,
      authorization: signV4("HEAD", url, headers, credentials, now),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const length = response.headers.get("content-length");
  return {
    status: response.status,
    size: length === null ? null : Number(length),
    contentType: response.headers.get("content-type"),
  };
}
