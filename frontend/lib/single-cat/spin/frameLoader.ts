import type { CatGeneratorApi } from "@/components/cat-builder/types";
import { decodeImageFromDataUrl } from "@/lib/cat-v3/api";
import type { CatParams, SpritesheetFrameMeta } from "@/lib/cat-v3/types";
import type {
  SpinFrameLoader,
  VariantDescriptor,
  VariationFrame,
} from "./types";

/** Renderer caps batches at 256 variants and a 16M-pixel budget. */
const DEFAULT_CHUNK_SIZE = 128;
/** Matches the renderer's worker count. */
const DEFAULT_CONCURRENCY = 4;

export interface SpinFrameLoaderOptions {
  chunkSize?: number;
  concurrency?: number;
  /** Decodes a batch sheet data URL; injectable for tests. */
  decode?: (dataUrl: string) => Promise<CanvasImageSource>;
  /** Creates a blank canvas; injectable for tests. */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
}

export class SpinLoaderDisposedError extends Error {
  constructor() {
    super("Spin frame loader was disposed");
    this.name = "SpinLoaderDisposedError";
  }
}

interface Task {
  started: boolean;
  run: () => Promise<void>;
}

interface Entry {
  promise: Promise<HTMLCanvasElement>;
  resolve: (canvas: HTMLCanvasElement) => void;
  reject: (error: unknown) => void;
  settled: boolean;
  task: Task | null;
}

interface PendingFrame {
  key: string;
  entry: Entry;
  params: Partial<CatParams>;
  descriptor: VariantDescriptor;
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = normalize(record[key]);
    }
    return sorted;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value)) ?? "undefined";
}

function defaultCreateCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function noop() {}

export function createSpinFrameLoader(
  generator: CatGeneratorApi,
  options: SpinFrameLoaderOptions = {},
): SpinFrameLoader {
  const chunkSize = Math.max(1, options.chunkSize ?? DEFAULT_CHUNK_SIZE);
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const decode = options.decode ?? decodeImageFromDataUrl;
  const createCanvas = options.createCanvas ?? defaultCreateCanvas;

  const cache = new Map<string, Entry>();
  const queue: Task[] = [];
  let active = 0;
  let disposed = false;

  function pump() {
    while (!disposed && active < concurrency && queue.length > 0) {
      const task = queue.shift() as Task;
      task.started = true;
      active += 1;
      void task
        .run()
        .catch(noop)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  /** Moves queued, not-yet-started tasks to the front, keeping their order. */
  function promote(entries: Entry[]) {
    const tasks = new Set<Task>();
    for (const entry of entries) {
      if (entry.task && !entry.task.started) {
        tasks.add(entry.task);
      }
    }
    if (tasks.size === 0) {
      return;
    }
    const rest = queue.filter((task) => !tasks.has(task));
    const promoted = queue.filter((task) => tasks.has(task));
    queue.length = 0;
    queue.push(...promoted, ...rest);
  }

  function createEntry(key: string): Entry {
    let resolve!: (canvas: HTMLCanvasElement) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<HTMLCanvasElement>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // Prefetched entries may never be awaited; keep their failures quiet.
    promise.catch(noop);
    const entry: Entry = {
      promise,
      resolve,
      reject,
      settled: false,
      task: null,
    };
    cache.set(key, entry);
    return entry;
  }

  function fulfill(entry: Entry, canvas: HTMLCanvasElement) {
    if (disposed || entry.settled) {
      return;
    }
    entry.settled = true;
    entry.task = null;
    entry.resolve(canvas);
  }

  function fail(key: string, entry: Entry, error: unknown) {
    if (entry.settled) {
      return;
    }
    entry.settled = true;
    entry.task = null;
    // Evict so a later request retries instead of replaying the failure.
    if (cache.get(key) === entry) {
      cache.delete(key);
    }
    entry.reject(error);
  }

  function getContext(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to acquire 2D context for spin frame");
    }
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  function cloneCanvas(source: HTMLCanvasElement | OffscreenCanvas) {
    const canvas = createCanvas(source.width, source.height);
    getContext(canvas).drawImage(source, 0, 0);
    return canvas;
  }

  function cutFrame(sheet: CanvasImageSource, meta: SpritesheetFrameMeta) {
    const canvas = createCanvas(meta.width, meta.height);
    getContext(canvas).drawImage(
      sheet,
      meta.x,
      meta.y,
      meta.width,
      meta.height,
      0,
      0,
      meta.width,
      meta.height,
    );
    return canvas;
  }

  function singleTask(
    key: string,
    entry: Entry,
    params: Partial<CatParams>,
  ): Task {
    const task: Task = {
      started: false,
      run: async () => {
        try {
          const result = await generator.generateCat(params);
          if (disposed) {
            return;
          }
          fulfill(entry, cloneCanvas(result.canvas));
        } catch (error) {
          fail(key, entry, error);
        }
      },
    };
    entry.task = task;
    return task;
  }

  function fallBack(items: PendingFrame[]) {
    const tasks = items.map((item) =>
      singleTask(item.key, item.entry, item.params),
    );
    // The chunk already reached the front of the queue; keep its frames there.
    queue.unshift(...tasks);
    pump();
  }

  function chunkTask(
    baseParams: Partial<CatParams>,
    items: PendingFrame[],
  ): Task {
    const generateVariantSheet = generator.generateVariantSheet;
    const usedIds = new Set<string>();
    const ids = items.map((item, index) => {
      const id = usedIds.has(item.descriptor.id)
        ? `${item.descriptor.id}#${index}`
        : item.descriptor.id;
      usedIds.add(id);
      return id;
    });

    const task: Task = {
      started: false,
      run: async () => {
        try {
          if (!generateVariantSheet) {
            throw new Error("generateVariantSheet is unavailable");
          }
          const sheet = await generateVariantSheet.call(
            generator,
            baseParams,
            items.map(({ descriptor }, index) => ({
              id: ids[index],
              params: descriptor.params,
              label: descriptor.label,
              group: descriptor.group,
            })),
            { includeSources: false, includeBase: false },
          );
          if (disposed) {
            return;
          }
          if (sheet.frames.length < items.length) {
            throw new Error(
              `Batch returned ${sheet.frames.length} of ${items.length} frames`,
            );
          }
          const image = await decode(sheet.sheetDataUrl);
          if (disposed) {
            return;
          }
          const metaById = new Map(sheet.frames.map((meta) => [meta.id, meta]));
          items.forEach((item, index) => {
            const meta = metaById.get(ids[index]);
            if (meta) {
              fulfill(item.entry, cutFrame(image, meta));
            }
          });
          const missing = items.filter((item) => !item.entry.settled);
          if (missing.length > 0) {
            throw new Error(
              `Batch response is missing ${missing.length} frame(s)`,
            );
          }
        } catch (error) {
          if (disposed) {
            return;
          }
          console.warn(
            "Spin batch render failed; falling back to single renders",
            error,
          );
          fallBack(items.filter((item) => !item.entry.settled));
        }
      },
    };
    for (const item of items) {
      item.entry.task = task;
    }
    return task;
  }

  /** Returns entries in descriptor order, queueing whatever is missing. */
  function request(
    baseParams: Partial<CatParams>,
    descriptors: VariantDescriptor[],
  ): Entry[] {
    const missing: PendingFrame[] = [];
    const entries = descriptors.map((descriptor) => {
      const key = `frame:${stableStringify({ base: baseParams, params: descriptor.params })}`;
      const cached = cache.get(key);
      if (cached) {
        return cached;
      }
      const entry = createEntry(key);
      missing.push({ key, entry, params: descriptor.params, descriptor });
      return entry;
    });

    if (generator.generateVariantSheet) {
      for (let start = 0; start < missing.length; start += chunkSize) {
        queue.push(
          chunkTask(baseParams, missing.slice(start, start + chunkSize)),
        );
      }
    } else {
      for (const item of missing) {
        queue.push(singleTask(item.key, item.entry, item.params));
      }
    }
    return entries;
  }

  function requestSingle(params: Partial<CatParams>): Entry {
    const key = `single:${stableStringify(params)}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const entry = createEntry(key);
    queue.push(singleTask(key, entry, params));
    return entry;
  }

  return {
    async frames(baseParams, descriptors): Promise<VariationFrame[]> {
      if (disposed) {
        throw new SpinLoaderDisposedError();
      }
      const entries = request(baseParams, descriptors);
      promote(entries);
      pump();
      const canvases = await Promise.all(entries.map((entry) => entry.promise));
      return descriptors.map((descriptor, index) => ({
        option: descriptor.option,
        canvas: canvases[index],
      }));
    },

    prefetch(baseParams, descriptors) {
      if (disposed) {
        return;
      }
      request(baseParams, descriptors);
      pump();
    },

    async single(params) {
      if (disposed) {
        throw new SpinLoaderDisposedError();
      }
      const entry = requestSingle(params);
      promote([entry]);
      pump();
      return entry.promise;
    },

    prefetchSingle(params) {
      if (disposed) {
        return;
      }
      requestSingle(params);
      pump();
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      queue.length = 0;
      for (const entry of cache.values()) {
        if (!entry.settled) {
          entry.settled = true;
          entry.task = null;
          entry.reject(new SpinLoaderDisposedError());
        }
      }
      cache.clear();
    },
  };
}
