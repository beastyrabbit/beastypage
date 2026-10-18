import "server-only";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Identity } from "../auth/identity";
import {
  dashConfig,
  jsonByteLength,
  paletteGeneratorConfig,
  pixelatorConfig,
  singleCatConfig,
} from "../db/contracts";
import type { Database } from "../db/pool";
import {
  dashSettings,
  paletteGeneratorSettings,
  pixelatorSettings,
  singleCatSettings,
} from "../db/schema";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";

/**
 * Shareable settings by slug. Port of postgresql/settings.ts: same slug rules,
 * size cap and capability checks (owner token identifier or edit token).
 */
export type SettingsKind =
  | "singleCat"
  | "pixelator"
  | "dash"
  | "paletteGenerator";

// All four tables share these columns; palette adds image_file_id.
type SettingsTable = typeof singleCatSettings;

const TABLES: Record<SettingsKind, SettingsTable> = {
  singleCat: singleCatSettings,
  pixelator: pixelatorSettings,
  dash: dashSettings,
  paletteGenerator: paletteGeneratorSettings as unknown as SettingsTable,
};

const CONTRACTS: Record<SettingsKind, z.ZodType> = {
  singleCat: singleCatConfig,
  pixelator: pixelatorConfig,
  dash: dashConfig,
  paletteGenerator: paletteGeneratorConfig,
};

// Omit visually ambiguous characters from public settings URLs.
const SLUG_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SLUG_LENGTH = 7;
const SLUG_ATTEMPTS = 6;
const MAX_CONFIG_BYTES = 256 * 1024;

export interface SettingsRecord {
  slug: string;
  config: unknown;
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface SettingsSaveResult {
  slug: string;
  id: string;
  updated: boolean;
  editToken?: string;
}

export interface SettingsSaveArgs {
  config: unknown;
  slug?: string;
  editToken?: string;
}

function randomSlug(): string {
  let slug = "";
  for (let i = 0; i < SLUG_LENGTH; i++)
    slug += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  return slug;
}

function tokensMatch(
  given: string | undefined,
  stored: string | null,
): boolean {
  if (!given || !stored) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validateConfig(kind: SettingsKind, config: unknown): unknown {
  let size: number;
  try {
    size = jsonByteLength(config);
  } catch {
    throw new ServiceError("invalid_input", "Invalid settings payload");
  }
  if (size > MAX_CONFIG_BYTES) {
    throw new ServiceError("invalid_input", "Settings payload is too large");
  }
  const parsed = CONTRACTS[kind].safeParse(config);
  if (!parsed.success)
    throw new ServiceError("invalid_input", "Invalid config");
  return parsed.data;
}

export async function getSettings(
  db: Database,
  kind: SettingsKind,
  slug: string,
): Promise<SettingsRecord | null> {
  const table = TABLES[kind];
  const [row] = await db
    .select({
      slug: table.slug,
      config: table.config,
      id: table.id,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt,
    })
    .from(table)
    .where(eq(table.slug, slug))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

/**
 * Creates a settings row, or updates an existing slug when the caller owns
 * it or presents its edit token. A concurrent create of the same slug falls
 * through to the update path, which applies the same capability check.
 */
export async function saveSettings(
  db: Database,
  kind: SettingsKind,
  args: SettingsSaveArgs,
  identity: Identity,
): Promise<SettingsSaveResult> {
  // Validated against this kind's contract; the shared table type only
  // differs in the JSON type parameter.
  const config = validateConfig(
    kind,
    args.config,
  ) as SettingsTable["$inferInsert"]["config"];
  const trimmed = args.slug?.trim();
  if (trimmed && !/^[A-Za-z0-9]{1,20}$/.test(trimmed)) {
    throw new ServiceError("invalid_input", "Invalid slug format");
  }
  const table = TABLES[kind];

  return withTransaction(db, async (tx) => {
    const update = async (slug: string) => {
      const [existing] = await tx
        .select()
        .from(table)
        .where(eq(table.slug, slug))
        .for("update")
        .limit(1);
      if (!existing) return null;
      const owned =
        existing.ownerTokenIdentifier !== null &&
        identity.tokenIdentifier === existing.ownerTokenIdentifier;
      if (!owned && !tokensMatch(args.editToken, existing.editToken)) {
        throw new ServiceError("forbidden", "Not authorized to edit settings");
      }
      await tx
        .update(table)
        .set({ config, updatedAt: sql`now()` })
        .where(eq(table.id, existing.id));
      return {
        slug: existing.slug,
        id: existing.id,
        updated: true,
        editToken: existing.editToken ?? undefined,
      } satisfies SettingsSaveResult;
    };

    if (trimmed) {
      const updated = await update(trimmed);
      if (updated) return updated;
    }

    const editToken = randomUUID();
    const candidates = trimmed
      ? [trimmed]
      : Array.from({ length: SLUG_ATTEMPTS }, randomSlug);
    for (const slug of candidates) {
      const [inserted] = await tx
        .insert(table)
        .values({
          slug,
          config,
          editToken,
          ownerTokenIdentifier: identity.tokenIdentifier,
        })
        .onConflictDoNothing({ target: table.slug })
        .returning({ id: table.id });
      if (inserted) return { slug, id: inserted.id, updated: false, editToken };
      // Someone created this explicit slug concurrently: same rules as an edit.
      if (trimmed) {
        const updated = await update(trimmed);
        if (updated) return updated;
      }
    }
    throw new ServiceError(
      "conflict",
      "Failed to generate unique settings slug",
    );
  });
}
