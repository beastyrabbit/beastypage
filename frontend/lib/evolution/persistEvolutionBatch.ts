/**
 * Persistence for a generated evolution batch: saves every cat to
 * cat_profile, then the batch itself (adoption_batch) with evolution
 * settings. Shared by the evolution generator page and the stream control
 * panel — both pass in their Convex mutation handles.
 */

import type { Id } from "@/convex/_generated/dataModel";
import { toId } from "@/convex/utils";
import { encodeCatShare } from "@/lib/catShare";
import {
  buildEvolutionBatchSettings,
  type EvolutionBatchResult,
  type EvolutionCatData,
  type EvolutionStarterSource,
} from "./evolutionGenerator";

export type PersistedEvolutionCat = {
  key: string;
  profileId: string;
  shareToken: string;
  editToken?: string | null;
};

export type PersistEvolutionBatchOutcome = {
  batchId: string | null;
  batchSlug: string | null;
  persistedCats: PersistedEvolutionCat[];
};

type CreateMapperFn = (args: { catData: EvolutionCatData }) => Promise<{
  id: string;
  slug?: string | null;
  shareToken?: string | null;
  editToken?: string | null;
}>;

type CreateBatchFn = (args: {
  cats: Array<{
    label: string;
    catData: EvolutionCatData;
    profileId: Id<"cat_profile">;
    encoded: string;
    shareToken: string;
    editToken?: string;
  }>;
  settings: Record<string, unknown>;
  title: string;
  creatorName: string;
}) => Promise<{
  id?: string | null;
  slug?: string | null;
  shareToken?: string | null;
}>;

export async function persistEvolutionBatch(options: {
  result: EvolutionBatchResult;
  starterSource: EvolutionStarterSource;
  title: string;
  creator: string;
  createMapper: CreateMapperFn;
  createBatch: CreateBatchFn;
}): Promise<PersistEvolutionBatchOutcome> {
  const { result, starterSource, title, creator, createMapper, createBatch } =
    options;
  const persistedCats: PersistedEvolutionCat[] = [];
  const catsPayload = await Promise.all(
    result.cats.map(async (cat, index) => {
      const encoded = encodeCatShare(
        cat.catData as unknown as Parameters<typeof encodeCatShare>[0],
      );
      const mapperResult = await createMapper({
        catData: cat.catData,
      });
      const profileId = mapperResult.id;
      const shareToken =
        mapperResult.shareToken ?? mapperResult.slug ?? mapperResult.id;
      persistedCats.push({
        key: cat.key,
        profileId,
        shareToken,
        editToken: mapperResult.editToken ?? null,
      });
      return {
        label: cat.label || `Evolution ${index + 1}`,
        catData: cat.catData,
        profileId: toId("cat_profile", profileId),
        encoded,
        shareToken,
        editToken: mapperResult.editToken ?? undefined,
      };
    }),
  );
  const settings = buildEvolutionBatchSettings(result, starterSource);
  const batch = await createBatch({
    cats: catsPayload,
    settings: {
      ...settings,
      batchTitle: title,
      batchCreator: creator,
    },
    title,
    creatorName: creator,
  });
  return {
    batchId: batch.id ?? null,
    batchSlug: batch.slug ?? batch.shareToken ?? null,
    persistedCats,
  };
}
