import { createHash } from "node:crypto";

/** Fixed namespace for every BeastyPage import id. Never change it. */
export const IMPORT_NAMESPACE = "026d2ffc-0943-4eb1-9c15-a2460794047e";

function uuidBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replaceAll("-", ""), "hex");
}

/** RFC 4122 version 5 (SHA-1, name-based) UUID. */
export function uuidv5(
  name: string,
  namespace: string = IMPORT_NAMESPACE,
): string {
  const hash = createHash("sha1")
    .update(uuidBytes(namespace))
    .update(name, "utf8")
    .digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Target primary key for an imported Convex document. Pure, so embedded
 * references are rewritten without a lookup table and reruns are identical.
 */
export function importedId(table: string, convexId: string): string {
  return uuidv5(`${table}:${convexId}`);
}

/** Files are content-addressed: identical bytes share one row. */
export function importedFileId(sha256Hex: string): string {
  return uuidv5(`files:${sha256Hex}`);
}
