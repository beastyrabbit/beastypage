import "server-only";

import type { Identity } from "../auth/identity";
import { userVariantSettingsByTool } from "../db/contracts";
import type { Database } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import { getUserByTokenIdentifier } from "../repositories/users";
import type { UserVariantRow } from "../repositories/userVariants";
import {
  countByTool,
  deactivateByTool,
  deleteByUserToolVariant,
  findByVariantId,
  insertVariant,
  listByUser,
  updateVariant,
} from "../repositories/userVariants";

const MAX_VARIANTS_PER_TOOL = 100;

async function requireUser(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  identity: Identity,
) {
  if (!identity.tokenIdentifier)
    throw new ServiceError("forbidden", "Not authenticated");
  const user = await getUserByTokenIdentifier(tx, identity.tokenIdentifier);
  if (!user) throw new ServiceError("not_found", "User not found");
  return user;
}

function validateSettings(toolKey: string, settings: unknown) {
  const parser =
    userVariantSettingsByTool[
      toolKey as keyof typeof userVariantSettingsByTool
    ];
  if (!parser) throw new ServiceError("invalid_input", "Unknown tool key");
  const result = parser.safeParse(settings);
  if (!result.success)
    throw new ServiceError("invalid_input", "Invalid variant settings");
  return result.data;
}

function toVariant(row: UserVariantRow) {
  return {
    _id: row.id,
    _creationTime: row.createdAt.getTime(),
    userId: row.userId,
    toolKey: row.toolKey,
    variantId: row.variantId,
    name: row.name,
    slug: row.slug ?? undefined,
    settings: row.settings,
    isActive: row.isActive,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function list(db: Database, identity: Identity, toolKey?: string) {
  return withTransaction(db, async (tx) => {
    if (!identity.tokenIdentifier) return [];
    const user = await getUserByTokenIdentifier(tx, identity.tokenIdentifier);
    if (!user) return [];
    const rows = await listByUser(tx, user.id, toolKey);
    return rows.map(toVariant);
  });
}

export async function upsert(
  db: Database,
  identity: Identity,
  args: {
    toolKey: string;
    variantId: string;
    name: string;
    slug?: string;
    settings: unknown;
    isActive: boolean;
  },
) {
  return withTransaction(db, async (tx) => {
    const user = await requireUser(tx, identity);
    const settings = validateSettings(args.toolKey, args.settings);
    const existing = await findByVariantId(
      tx,
      user.id,
      args.toolKey,
      args.variantId,
    );
    if (!existing) {
      const count = await countByTool(tx, user.id, args.toolKey);
      if (count >= MAX_VARIANTS_PER_TOOL)
        throw new ServiceError("conflict", "Variant limit reached");
    }
    if (args.isActive) await deactivateByTool(tx, user.id, args.toolKey);
    if (existing) {
      const updated = await updateVariant(tx, existing.id, {
        name: args.name,
        settings,
        isActive: args.isActive,
        ...(args.slug !== undefined ? { slug: args.slug } : {}),
      });
      return updated?.id ?? existing.id;
    }
    const created = await insertVariant(tx, {
      userId: user.id,
      toolKey: args.toolKey,
      variantId: args.variantId,
      name: args.name,
      slug: args.slug,
      settings,
      isActive: args.isActive,
    });
    if (!created)
      throw new ServiceError("unavailable", "Failed to save variant");
    return created.id;
  });
}

export async function remove(
  db: Database,
  identity: Identity,
  toolKey: string,
  variantId: string,
) {
  return withTransaction(db, async (tx) => {
    const user = await requireUser(tx, identity);
    const row = await deleteByUserToolVariant(tx, user.id, toolKey, variantId);
    if (!row) throw new ServiceError("not_found", "Variant not found");
  });
}

export async function rename(
  db: Database,
  identity: Identity,
  toolKey: string,
  variantId: string,
  name: string,
) {
  return withTransaction(db, async (tx) => {
    const user = await requireUser(tx, identity);
    const existing = await findByVariantId(tx, user.id, toolKey, variantId);
    const row = existing
      ? await updateVariant(tx, existing.id, { name })
      : null;
    if (!row) throw new ServiceError("not_found", "Variant not found");
  });
}

export async function setActive(
  db: Database,
  identity: Identity,
  toolKey: string,
  variantId?: string,
) {
  return withTransaction(db, async (tx) => {
    const user = await requireUser(tx, identity);
    await deactivateByTool(tx, user.id, toolKey);
    if (variantId) {
      const variant = await findByVariantId(tx, user.id, toolKey, variantId);
      if (variant) await updateVariant(tx, variant.id, { isActive: true });
    }
  });
}

export async function importBatch(
  db: Database,
  identity: Identity,
  toolKey: string,
  variants: Array<{
    variantId: string;
    name: string;
    slug?: string;
    settings: unknown;
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
  }>,
) {
  return withTransaction(db, async (tx) => {
    const user = await requireUser(tx, identity);
    let imported = 0;
    let activeDeactivated = false;
    for (const value of variants) {
      const settings = validateSettings(toolKey, value.settings);
      const existing = await findByVariantId(
        tx,
        user.id,
        toolKey,
        value.variantId,
      );
      if (existing) continue;
      const count = await countByTool(tx, user.id, toolKey);
      if (count >= MAX_VARIANTS_PER_TOOL) break;
      const isActive = value.isActive && !activeDeactivated;
      if (isActive) {
        await deactivateByTool(tx, user.id, toolKey);
        activeDeactivated = true;
      }
      await insertVariant(tx, {
        userId: user.id,
        toolKey,
        variantId: value.variantId,
        name: value.name,
        slug: value.slug,
        settings,
        isActive,
        createdAt: new Date(value.createdAt),
        updatedAt: new Date(value.updatedAt),
      });
      imported++;
    }
    return { imported, total: variants.length };
  });
}
