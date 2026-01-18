import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

/**
 * Password hashing utilities using Web Crypto PBKDF2
 *
 * - Uses PBKDF2 with SHA-256 and 100,000 iterations
 * - Random 16-byte salt per password
 * - Constant-time comparison to prevent timing attacks
 * - Stored format: "pbkdf2$<iterations>$<base64-salt>$<base64-hash>"
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Generate a cryptographically secure random salt
 */
function generateSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * Convert Uint8Array to base64 string
 */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 */
function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to ArrayBuffer (needed for Web Crypto API)
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  const view = new Uint8Array(buffer);
  view.set(bytes);
  return buffer;
}

/**
 * Derive a key from password and salt using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH * 8
  );

  return new Uint8Array(derivedBits);
}

/**
 * Hash a password with a random salt
 * Returns format: "pbkdf2$<iterations>$<base64-salt>$<base64-hash>"
 */
async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const hash = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/**
 * Constant-time comparison of two byte arrays
 * Prevents timing attacks by always comparing all bytes
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Verify a password against a stored hash
 * Supports both new PBKDF2 format and legacy simple hash format
 */
async function verifyPassword(provided: string, stored: string): Promise<boolean> {
  // Handle legacy simple hash format (for backwards compatibility)
  if (!stored.startsWith("pbkdf2$")) {
    // Legacy format: "hash-salt" from simpleHash
    // Temporarily support old hashes during migration
    const legacyHash = legacySimpleHash(provided);
    // Use constant-time comparison even for legacy
    const encoder = new TextEncoder();
    const a = encoder.encode(legacyHash);
    const b = encoder.encode(stored);
    return constantTimeEqual(a, b);
  }

  // Parse PBKDF2 format: "pbkdf2$iterations$salt$hash"
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }

  const iterations = parseInt(parts[1], 10);
  if (isNaN(iterations) || iterations < 1) {
    return false;
  }

  const salt = fromBase64(parts[2]);
  const storedHash = fromBase64(parts[3]);

  // Derive key from provided password
  const derivedHash = await deriveKey(provided, salt, iterations);

  // Constant-time comparison
  return constantTimeEqual(derivedHash, storedHash);
}

/**
 * Legacy hash function for backwards compatibility during migration
 * @deprecated Use hashPassword instead
 */
function legacySimpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const salt = str.length + (str.charCodeAt(0) || 0) + (str.charCodeAt(str.length - 1) || 0);
  return `${hash.toString(36)}-${salt.toString(36)}`;
}

const catValidator = v.object({
  id: v.string(),
  name: v.object({
    prefix: v.string(),
    suffix: v.string(),
    full: v.string()
  }),
  gender: v.union(v.literal("M"), v.literal("F")),
  lifeStage: v.string(),
  params: v.any(),
  motherId: v.union(v.string(), v.null()),
  fatherId: v.union(v.string(), v.null()),
  partnerIds: v.array(v.string()),
  childrenIds: v.array(v.string()),
  genetics: v.any(),
  source: v.string(),
  historyProfileId: v.optional(v.string()),
  generation: v.number()
});

const configValidator = v.object({
  minChildren: v.number(),
  maxChildren: v.number(),
  depth: v.number(),
  genderRatio: v.number(),
  partnerChance: v.optional(v.number()),
  paletteModes: v.optional(v.array(v.string())),
  offspringOptions: v.optional(v.object({
    accessoryChance: v.number(),
    maxAccessories: v.number(),
    scarChance: v.number(),
    maxScars: v.number()
  }))
});

export const save = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    foundingMotherId: v.string(),
    foundingFatherId: v.string(),
    cats: v.array(catValidator),
    config: configValidator,
    creatorName: v.optional(v.string()),
    password: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if tree with this slug already exists
    const existing = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      // Tree exists - check password if it has one
      if (existing.passwordHash) {
        if (!args.password) {
          return { success: false, error: "password_required" } as const;
        }
        const isValid = await verifyPassword(args.password, existing.passwordHash);
        if (!isValid) {
          return { success: false, error: "invalid_password" } as const;
        }
      }

      // Update existing tree
      const patch: {
        name: string;
        foundingMotherId: string;
        foundingFatherId: string;
        cats: typeof args.cats;
        config: typeof args.config;
        updatedAt: number;
        creatorName?: string;
        passwordHash?: string;
      } = {
        name: args.name,
        foundingMotherId: args.foundingMotherId,
        foundingFatherId: args.foundingFatherId,
        cats: args.cats,
        config: args.config,
        updatedAt: now
      };

      if (args.creatorName !== undefined) {
        patch.creatorName = args.creatorName;
      }

      // If setting a new password on an unprotected tree
      if (args.password && !existing.passwordHash) {
        patch.passwordHash = await hashPassword(args.password);
      }

      await ctx.db.patch(existing._id, patch);
      return { success: true, id: existing._id, slug: args.slug, isNew: false } as const;
    }

    // Create new tree
    const insertData: {
      slug: string;
      name: string;
      foundingMotherId: string;
      foundingFatherId: string;
      cats: typeof args.cats;
      config: typeof args.config;
      createdAt: number;
      updatedAt: number;
      creatorName?: string;
      passwordHash?: string;
    } = {
      slug: args.slug,
      name: args.name,
      foundingMotherId: args.foundingMotherId,
      foundingFatherId: args.foundingFatherId,
      cats: args.cats,
      config: args.config,
      createdAt: now,
      updatedAt: now,
    };

    if (args.creatorName !== undefined) {
      insertData.creatorName = args.creatorName;
    }

    if (args.password) {
      insertData.passwordHash = await hashPassword(args.password);
    }

    const id = await ctx.db.insert("ancestry_tree", insertData);

    return { success: true, id, slug: args.slug, isNew: true } as const;
  }
});

// Check if a tree exists and whether it has a password
export const checkSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const tree = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (!tree) {
      return { exists: false, hasPassword: false };
    }

    return { exists: true, hasPassword: !!tree.passwordHash };
  }
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const tree = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (!tree) return null;

    // Return tree data with hasPassword flag, but not the actual hash
    const { passwordHash, ...treeData } = tree;
    return { ...treeData, hasPassword: !!passwordHash };
  }
});

export const list = query({
  args: {
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const trees = await ctx.db
      .query("ancestry_tree")
      .withIndex("byCreated")
      .order("desc")
      .take(limit);

    return trees.map((tree) => ({
      id: tree._id,
      slug: tree.slug,
      name: tree.name,
      catCount: tree.cats.length,
      config: tree.config,
      creatorName: tree.creatorName,
      hasPassword: !!tree.passwordHash,
      createdAt: tree.createdAt,
      updatedAt: tree.updatedAt,
      // Include first 6 cats for preview thumbnails in history
      previewCats: tree.cats.slice(0, 6).map((c) => ({
        id: c.id,
        name: c.name.full,
        params: c.params
      }))
    }));
  }
});

export const update = mutation({
  args: {
    slug: v.string(),
    name: v.optional(v.string()),
    cats: v.optional(v.array(catValidator)),
    config: v.optional(configValidator),
    creatorName: v.optional(v.string()),
    password: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (!existing) {
      return { success: false, error: "not_found" } as const;
    }

    // Check password if tree has one
    if (existing.passwordHash) {
      if (!args.password) {
        return { success: false, error: "password_required" } as const;
      }
      const isValid = await verifyPassword(args.password, existing.passwordHash);
      if (!isValid) {
        return { success: false, error: "invalid_password" } as const;
      }
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now()
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.cats !== undefined) updates.cats = args.cats;
    if (args.config !== undefined) updates.config = args.config;
    if (args.creatorName !== undefined) updates.creatorName = args.creatorName;

    await ctx.db.patch(existing._id, updates);
    return { success: true, id: existing._id, slug: args.slug } as const;
  }
});

export const remove = mutation({
  args: {
    slug: v.string(),
    password: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ancestry_tree")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .first();

    if (!existing) {
      return { success: false, error: "not_found" } as const;
    }

    // Check password if tree is protected
    if (existing.passwordHash) {
      if (!args.password) {
        return { success: false, error: "password_required" } as const;
      }
      const isValid = await verifyPassword(args.password, existing.passwordHash);
      if (!isValid) {
        return { success: false, error: "invalid_password" } as const;
      }
    }

    await ctx.db.delete(existing._id);
    return { success: true } as const;
  }
});
