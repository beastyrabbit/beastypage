import type { Id, TableNames } from "./_generated/dataModel.js";

export type AnyId = Id<TableNames>;

export function docIdToString(id: AnyId): string {
  return id as unknown as string;
}

export function toId<TableName extends TableNames>(
  _table: TableName,
  value: string | Id<TableName>
): Id<TableName> {
  return (value as unknown) as Id<TableName>;
}

export function buildFileUrl(collection: string, id: string, filename: string): string {
  return `/api/files/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`;
}

const STORAGE_BASE =
  process.env.CONVEX_STORAGE_ORIGIN ||
  process.env.CONVEX_SITE_ORIGIN ||
  process.env.CONVEX_SELF_HOSTED_URL ||
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  null;

export function normalizeStorageUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    if (STORAGE_BASE) {
      const base = new URL(STORAGE_BASE);
      const resolved = new URL(url, base);
      resolved.protocol = base.protocol;
      resolved.host = base.host;
      return resolved.toString();
    }
    const parsed = new URL(url, "http://placeholder");
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return path.startsWith("/") ? path : `/${path}`;
  } catch (error) {
    if (STORAGE_BASE && url.startsWith("/")) {
      return `${STORAGE_BASE.replace(/\/$/, "")}${url}`;
    }
    return url;
  }
}
