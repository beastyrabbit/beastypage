import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type { Identity } from "../auth/identity";
import { userVariantSettingsByTool } from "../db/contracts";
import type { Database } from "../db/pool";
import { userVariants } from "../db/schema";
import { withTransaction } from "../db/transaction";
import { ServiceError } from "../errors";
import { getUserByTokenIdentifier } from "../repositories/users";

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

function toVariant(row: typeof userVariants.$inferSelect) {
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
    const conditions = [eq(userVariants.userId, user.id)];
    if (toolKey) conditions.push(eq(userVariants.toolKey, toolKey));
    const rows = await tx
      .select()
      .from(userVariants)
      .where(and(...conditions));
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
    const [existing] = await tx
      .select()
      .from(userVariants)
      .where(
        and(
          eq(userVariants.userId, user.id),
          eq(userVariants.toolKey, args.toolKey),
          eq(userVariants.variantId, args.variantId),
        ),
      )
      .limit(1);
    if (!existing) {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(userVariants)
        .where(
          and(
            eq(userVariants.userId, user.id),
            eq(userVariants.toolKey, args.toolKey),
          ),
        );
      if (count >= MAX_VARIANTS_PER_TOOL)
        throw new ServiceError("conflict", "Variant limit reached");
    }
    if (args.isActive)
      await tx
        .update(userVariants)
        .set({ isActive: false })
        .where(
          and(
            eq(userVariants.userId, user.id),
            eq(userVariants.toolKey, args.toolKey),
          ),
        );
    if (existing) {
      const [updated] = await tx
        .update(userVariants)
        .set({
          name: args.name,
          settings,
          isActive: args.isActive,
          ...(args.slug !== undefined ? { slug: args.slug } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(userVariants.id, existing.id))
        .returning();
      return updated?.id ?? existing.id;
    }
    const [created] = await tx
      .insert(userVariants)
      .values({
        userId: user.id,
        toolKey: args.toolKey,
        variantId: args.variantId,
        name: args.name,
        slug: args.slug,
        settings,
        isActive: args.isActive,
      })
      .returning();
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
    const [row] = await tx
      .select({ id: userVariants.id })
      .from(userVariants)
      .where(
        and(
          eq(userVariants.userId, user.id),
          eq(userVariants.toolKey, toolKey),
          eq(userVariants.variantId, variantId),
        ),
      )
      .limit(1);
    if (!row) throw new ServiceError("not_found", "Variant not found");
    await tx.delete(userVariants).where(eq(userVariants.id, row.id));
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
    const [row] = await tx
      .update(userVariants)
      .set({ name, updatedAt: sql`now()` })
      .where(
        and(
          eq(userVariants.userId, user.id),
          eq(userVariants.toolKey, toolKey),
          eq(userVariants.variantId, variantId),
        ),
      )
      .returning();
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
    await tx
      .update(userVariants)
      .set({ isActive: false })
      .where(
        and(
          eq(userVariants.userId, user.id),
          eq(userVariants.toolKey, toolKey),
        ),
      );
    if (variantId)
      await tx
        .update(userVariants)
        .set({ isActive: true })
        .where(
          and(
            eq(userVariants.userId, user.id),
            eq(userVariants.toolKey, toolKey),
            eq(userVariants.variantId, variantId),
          ),
        );
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
      const [existing] = await tx
        .select({ id: userVariants.id })
        .from(userVariants)
        .where(
          and(
            eq(userVariants.userId, user.id),
            eq(userVariants.toolKey, toolKey),
            eq(userVariants.variantId, value.variantId),
          ),
        )
        .limit(1);
      if (existing) continue;
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(userVariants)
        .where(
          and(
            eq(userVariants.userId, user.id),
            eq(userVariants.toolKey, toolKey),
          ),
        );
      if (count >= MAX_VARIANTS_PER_TOOL) break;
      const isActive = value.isActive && !activeDeactivated;
      if (isActive) {
        await tx
          .update(userVariants)
          .set({ isActive: false })
          .where(
            and(
              eq(userVariants.userId, user.id),
              eq(userVariants.toolKey, toolKey),
            ),
          );
        activeDeactivated = true;
      }
      await tx.insert(userVariants).values({
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
