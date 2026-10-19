import { catSystem } from "@/lib/cat-system/registry";
import type { CatParams } from "@/lib/cat-v3/types";

export const VISUAL_BUILDER_PREVIEW_BATCH_SIZE = 64;
export const VISUAL_BUILDER_PREVIEW_CONCURRENCY = 3;

export const OPTIONAL_DIRECT_TRAITS = catSystem.traits.flatMap((trait) => {
  if (
    trait.legacy.strategy !== "direct" ||
    trait.value.kind !== "string" ||
    trait.value.required ||
    trait.value.default !== undefined ||
    trait.legacy.key === "coatPattern"
  ) {
    return [];
  }
  return [trait.legacy.key];
}) as (keyof CatParams)[];

/**
 * Batch variants are merged over the base legacy params by the renderer.
 * Explicit nulls are needed when a direct optional trait is cleared because
 * JSON serialization omits the undefined value otherwise.
 */
export function preparePreviewBatchParams(
  params: CatParams,
): Partial<CatParams> {
  const prepared = { ...params } as Partial<CatParams> &
    Record<string, unknown>;
  for (const trait of OPTIONAL_DIRECT_TRAITS) {
    if (prepared[trait] === undefined) {
      (prepared as Record<string, unknown>)[trait] = null;
    }
  }
  return prepared;
}

export interface PreviewBatchItem<T> {
  key: string;
  value: T;
}

export interface PreviewBatcherOptions<T> {
  batchSize?: number;
  concurrency?: number;
  getCached: (key: string) => string | null | undefined;
  setCached: (key: string, value: string) => void;
  renderBatch: (
    items: readonly PreviewBatchItem<T>[],
  ) => Promise<ReadonlyMap<string, string>>;
  renderSingle: (item: PreviewBatchItem<T>) => Promise<string | null>;
  onBatchError?: (
    error: unknown,
    items: readonly PreviewBatchItem<T>[],
  ) => void;
}

export interface PreviewBatcher<T> {
  request(key: string, value: T): Promise<string | null>;
}

interface PendingPreview<T> extends PreviewBatchItem<T> {
  resolve: (value: string | null) => void;
}

/**
 * Queues tile previews into bounded batch requests while preserving the
 * per-tile promise and cache behaviour used by the visual builder.
 */
export function createPreviewBatcher<T>(
  options: PreviewBatcherOptions<T>,
): PreviewBatcher<T> {
  const batchSize = Math.max(1, Math.trunc(options.batchSize ?? 1));
  const concurrency = Math.max(1, Math.trunc(options.concurrency ?? 1));
  const pendingByKey = new Map<string, Promise<string | null>>();
  const queue: PendingPreview<T>[] = [];
  let active = 0;
  let scheduled = false;

  const resolveSingle = async (item: PendingPreview<T>) => {
    try {
      const preview = await options.renderSingle(item);
      if (preview) options.setCached(item.key, preview);
      item.resolve(preview);
    } catch (error) {
      options.onBatchError?.(error, [item]);
      item.resolve(null);
    }
  };

  const processChunk = async (items: PendingPreview<T>[]) => {
    const uncached = items.filter((item) => !options.getCached(item.key));
    for (const item of items) {
      const cached = options.getCached(item.key);
      if (cached) item.resolve(cached);
    }
    if (uncached.length === 0) return;

    try {
      const previews = await options.renderBatch(uncached);
      const missing: PendingPreview<T>[] = [];
      for (const item of uncached) {
        const preview = previews.get(item.key);
        if (preview) {
          options.setCached(item.key, preview);
          item.resolve(preview);
        } else {
          missing.push(item);
        }
      }
      for (const item of missing) {
        await resolveSingle(item);
      }
    } catch (error) {
      options.onBatchError?.(error, uncached);
      // A failed batch is recovered one tile at a time. This keeps the
      // renderer load bounded while allowing successful tiles to appear.
      for (const item of uncached) {
        await resolveSingle(item);
      }
    }
  };

  const drain = () => {
    while (active < concurrency && queue.length > 0) {
      const chunk = queue.splice(0, batchSize);
      active += 1;
      void processChunk(chunk).finally(() => {
        active -= 1;
        drain();
      });
    }
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    void Promise.resolve().then(() => {
      scheduled = false;
      drain();
    });
  };

  return {
    request(key, value) {
      const cached = options.getCached(key);
      if (cached) return Promise.resolve(cached);

      const existing = pendingByKey.get(key);
      if (existing) return existing;

      const promise = new Promise<string | null>((resolve) => {
        queue.push({ key, value, resolve });
      });
      pendingByKey.set(key, promise);
      void promise.finally(() => {
        pendingByKey.delete(key);
      });
      schedule();
      return promise;
    },
  };
}
