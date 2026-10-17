import { sql } from "drizzle-orm";
import type { z } from "zod";
import { importedId } from "./ids";

/** Thrown by field readers; the importer quarantines the document. */
export class Reject extends Error {}

export type ConvexDocument = Record<string, unknown> & {
  _id: string;
  _creationTime: number;
};

export interface MapContext {
  freezeAt: Date;
  /** Clerk issuer that every token identifier must carry, when known. */
  expectedIssuer: string | null;
  /** Whether a parent document was imported (not missing or quarantined). */
  imported(table: string, convexId: string): boolean;
  /** Target file id for a Convex `_storage` id, when the file was imported. */
  fileFor(storageId: string): string | null;
  /** Explicit, counted repairs (never silent). */
  repair(kind: string): void;
  /** Extra per-document facts preloaded for a step (e.g. upload state). */
  facts: Map<string, string>;
}

const MIN_TIME = Date.UTC(2000, 0, 1);
const MAX_TIME = Date.UTC(2100, 0, 1);

export function asDocument(value: unknown): ConvexDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Reject("document is not an object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record._id !== "string" || record._id === "")
    throw new Reject("missing _id");
  if (
    typeof record._creationTime !== "number" ||
    !Number.isFinite(record._creationTime)
  ) {
    throw new Reject("missing _creationTime");
  }
  return record as ConvexDocument;
}

/** Convex schemas forbid undeclared fields; anything else means the export is not what we modelled. */
export function onlyFields(
  doc: ConvexDocument,
  allowed: readonly string[],
): void {
  const known = new Set([...allowed, "_id", "_creationTime"]);
  const unexpected = Object.keys(doc).filter((key) => !known.has(key));
  if (unexpected.length > 0)
    throw new Reject(`unexpected fields: ${unexpected.join(", ")}`);
}

function fail(field: string, expected: string): never {
  throw new Reject(`${field}: expected ${expected}`);
}

export const read = {
  str(doc: ConvexDocument, field: string): string {
    const value = doc[field];
    return typeof value === "string" ? value : fail(field, "string");
  },
  optStr(doc: ConvexDocument, field: string): string | null {
    const value = doc[field];
    if (value === undefined) return null;
    return typeof value === "string" ? value : fail(field, "string or absent");
  },
  num(doc: ConvexDocument, field: string): number {
    const value = doc[field];
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : fail(field, "finite number");
  },
  optNum(doc: ConvexDocument, field: string): number | null {
    return doc[field] === undefined ? null : read.num(doc, field);
  },
  int(doc: ConvexDocument, field: string): number {
    const value = read.num(doc, field);
    return Number.isSafeInteger(value) ? value : fail(field, "integer");
  },
  optInt(doc: ConvexDocument, field: string): number | null {
    return doc[field] === undefined ? null : read.int(doc, field);
  },
  bool(doc: ConvexDocument, field: string): boolean {
    const value = doc[field];
    return typeof value === "boolean" ? value : fail(field, "boolean");
  },
  optBool(doc: ConvexDocument, field: string): boolean | null {
    return doc[field] === undefined ? null : read.bool(doc, field);
  },
  time(doc: ConvexDocument, field: string): Date {
    const value = read.num(doc, field);
    if (value < MIN_TIME || value > MAX_TIME)
      fail(field, "epoch milliseconds between 2000 and 2100");
    return new Date(value);
  },
  optTime(doc: ConvexDocument, field: string): Date | null {
    return doc[field] === undefined ? null : read.time(doc, field);
  },
  oneOf<T extends string>(
    doc: ConvexDocument,
    field: string,
    values: readonly T[],
  ): T {
    const value = doc[field];
    return typeof value === "string" &&
      (values as readonly string[]).includes(value)
      ? (value as T)
      : fail(field, values.join(" | "));
  },
  optOneOf<T extends string>(
    doc: ConvexDocument,
    field: string,
    values: readonly T[],
  ): T | null {
    return doc[field] === undefined ? null : read.oneOf(doc, field, values);
  },
  strArray(doc: ConvexDocument, field: string): string[] {
    const value = doc[field];
    return Array.isArray(value) &&
      value.every((item) => typeof item === "string")
      ? (value as string[])
      : fail(field, "string[]");
  },
  optStrArray(doc: ConvexDocument, field: string): string[] | null {
    return doc[field] === undefined ? null : read.strArray(doc, field);
  },
};

/** Validates a formerly `v.any()` value against its contract. */
export function contract<T extends z.ZodType>(
  schema: T,
  value: unknown,
  field: string,
): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `.${issue.path.join(".")}` : "";
    throw new Reject(`${field}${where}: ${issue?.message ?? "invalid"}`);
  }
  return result.data;
}

/**
 * `_creationTime` is float milliseconds; a JS Date would drop the fraction,
 * so PostgreSQL converts it at microsecond precision.
 */
export function creationTime(milliseconds: number) {
  return sql`to_timestamp(${milliseconds}::float8 / 1000)`;
}

export function baseColumns(table: string, doc: ConvexDocument) {
  return {
    id: importedId(table, doc._id),
    legacyId: doc._id,
    legacyCreatedAt: creationTime(doc._creationTime),
  };
}

/** Owner columns keep the Convex `<issuer>|<subject>` token identifier. */
export function tokenIdentifier(
  ctx: MapContext,
  value: string | null,
  field: string,
): string | null {
  if (value === null) return null;
  if (!value.includes("|"))
    throw new Reject(`${field}: not an <issuer>|<subject> identifier`);
  if (ctx.expectedIssuer && !value.startsWith(`${ctx.expectedIssuer}|`)) {
    throw new Reject(`${field}: issued by an unexpected identity provider`);
  }
  return value;
}

/** A `v.id()` that must resolve; dangling references quarantine the row. */
export function requiredRef(
  ctx: MapContext,
  table: string,
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string") fail(field, `${table} id`);
  if (!ctx.imported(table, value))
    throw new Reject(`${field}: dangling reference to ${table}`);
  return importedId(table, value);
}

/**
 * An optional `v.id()`. A dangling one becomes NULL — the same effect as the
 * target schema's ON DELETE SET NULL — and is counted as a repair.
 */
export function optionalRef(
  ctx: MapContext,
  table: string,
  value: unknown,
  field: string,
): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") fail(field, `${table} id or absent`);
  if (ctx.imported(table, value)) return importedId(table, value);
  ctx.repair(`${field}: dangling ${table} reference set to null`);
  return null;
}

export function fileRef(
  ctx: MapContext,
  value: unknown,
  field: string,
  required: boolean,
): string | null {
  if (value === undefined && !required) return null;
  if (typeof value !== "string") fail(field, "_storage id");
  const fileId = ctx.fileFor(value);
  if (!fileId)
    throw new Reject(`${field}: storage object missing or quarantined`);
  return fileId;
}
