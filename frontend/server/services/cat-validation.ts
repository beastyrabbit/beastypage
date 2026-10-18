import "server-only";

import { z } from "zod";
import {
  adoptionBatchCat,
  adoptionBatchSettingsShape,
  catProfileData,
  catShareData,
} from "../db/contracts";

const optionalNumber = (max: number) =>
  z
    .preprocess(
      (value) => (value === "" || value === undefined ? undefined : value),
      z.coerce.number().int().min(1).max(max),
    )
    .optional();

export const slugQuerySchema = z.object({
  slug: z.string().min(1).max(128),
});

export const slugOrIdQuerySchema = z.object({
  slugOrId: z.string().min(1).max(128),
});

export const listQuerySchema = z.object({
  limit: optionalNumber(500),
  pageSize: optionalNumber(500),
  cursor: z.string().max(512).optional(),
});

export const previewListQuerySchema = z.object({
  limit: optionalNumber(200),
  staleBefore: z
    .preprocess(
      (value) => (value === "" || value === undefined ? undefined : value),
      z.coerce.number().finite(),
    )
    .optional(),
  force: z
    .preprocess(
      (value) => (value === "" || value === undefined ? undefined : value),
      z.enum(["true", "false"]),
    )
    .optional(),
});

const optionalName = z.string().max(80).optional();
const optionalToken = z.string().max(512).optional();

export const profileCreateSchema = z
  .object({
    catData: catProfileData,
    catName: optionalName,
    creatorName: optionalName,
  })
  .strict();

export const profileUpdateSchema = z
  .object({
    id: z.string().min(1).max(128),
    catName: optionalName,
    creatorName: optionalName,
    editToken: optionalToken,
  })
  .strict();

export const adoptionCreateSchema = z
  .object({
    cats: z.array(adoptionBatchCat).min(1).max(200),
    title: optionalName,
    creatorName: optionalName,
    settings: adoptionBatchSettingsShape.optional(),
  })
  .strict();

export const adoptionUpdateSchema = z
  .object({
    id: z.string().min(1).max(128),
    editToken: optionalToken,
    title: optionalName,
    creatorName: optionalName,
  })
  .strict();

export const ancestryCheckSchema = z.object({
  slug: z.string().min(1).max(40),
});

const ancestryBase = {
  slug: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  foundingMotherId: z.string().min(1).max(256),
  foundingFatherId: z.string().min(1).max(256),
  cats: z.array(z.unknown()).max(500),
  config: z.unknown(),
  creatorName: optionalName,
  password: z.string().max(512).optional(),
  editToken: optionalToken,
};

export const ancestrySaveSchema = z
  .object({ operation: z.literal("save"), ...ancestryBase })
  .strict();
export const ancestrySaveAsNewSchema = z
  .object({ operation: z.literal("saveAsNew"), ...ancestryBase })
  .strict();
export const ancestryUpdateSchema = z
  .object({
    operation: z.literal("update"),
    slug: ancestryBase.slug,
    name: ancestryBase.name.optional(),
    cats: ancestryBase.cats.optional(),
    config: ancestryBase.config.optional(),
    creatorName: ancestryBase.creatorName,
    password: ancestryBase.password,
    editToken: ancestryBase.editToken,
  })
  .strict();
export const ancestryRemoveSchema = z
  .object({
    operation: z.literal("remove"),
    slug: ancestryBase.slug,
    password: ancestryBase.password,
    editToken: ancestryBase.editToken,
  })
  .strict();
export const ancestryMutationSchema = z.discriminatedUnion("operation", [
  ancestrySaveSchema,
  ancestrySaveAsNewSchema,
  ancestryUpdateSchema,
  ancestryRemoveSchema,
]);

export const catShareCreateSchema = z
  .object({
    data: catShareData,
    slug: z
      .string()
      .regex(/^[A-Za-z0-9]{1,20}$/)
      .optional(),
    editToken: optionalToken,
  })
  .strict();

export const previewUpdateSchema = z
  .object({
    id: z.string().min(1).max(128),
    adminToken: z.string().max(512).optional(),
    tiny: z
      .object({
        dataUrl: z.string().max(24 * 1024 * 1024),
        filename: z.string().max(255).optional(),
      })
      .strict()
      .optional(),
    preview: z
      .object({
        dataUrl: z.string().max(24 * 1024 * 1024),
        filename: z.string().max(255).optional(),
      })
      .strict()
      .optional(),
    full: z
      .object({
        dataUrl: z.string().max(24 * 1024 * 1024),
        filename: z.string().max(255).optional(),
      })
      .strict()
      .optional(),
    spriteSheet: z
      .object({
        dataUrl: z.string().max(24 * 1024 * 1024),
        filename: z.string().max(255).optional(),
        meta: z.unknown().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const encodedPreviewQuerySchema = z.object({
  cat: z
    .string()
    .max(512 * 1024)
    .optional(),
});

export const paletteImageQuerySchema = z.object({
  slug: z.string().min(1).max(128),
});

export const discordPaletteSchema = z
  .object({
    imageUrl: z.string().url().max(2048),
    colors: z.coerce.number().int().min(2).max(12).optional(),
  })
  .strict();

export const discordRandomCatSchema = z
  .object({
    sprite: z.number().finite().optional(),
    pelt: z.string().max(128).optional(),
    colour: z.string().max(128).optional(),
    eye_colour: z.string().max(128).optional(),
    shading: z.boolean().optional(),
    trait: z.string().max(128).optional(),
    value: z.string().max(256).optional(),
    discord_user_id: z.string().max(128).optional(),
    discord_username: z.string().max(128).optional(),
  })
  .strict();
