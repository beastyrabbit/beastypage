import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CatParams } from '@/lib/cat-v3/types';
import { generateRandomParamsV3 } from '@/lib/cat-v3/randomGenerator';

const SAMPLE_COUNT = Number(process.env.CG3_DIST_SAMPLES ?? '2000');
const MAX_DELTA = Number(process.env.CG3_DIST_TOLERANCE ?? '0.05');

const spriteDataDir = path.resolve(__dirname, '../../public/sprite-data');
const originalFetch = globalThis.fetch;

async function loadJsonAsset(relPath: string): Promise<Response> {
  const fullPath = path.join(spriteDataDir, relPath);
  const body = await readFile(fullPath, 'utf-8');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/sprite-data/')) {
      const rel = input.replace('/sprite-data/', '');
      return loadJsonAsset(rel);
    }
    if (input instanceof URL && input.pathname.startsWith('/sprite-data/')) {
      const rel = input.pathname.replace('/sprite-data/', '');
      return loadJsonAsset(rel);
    }
    return originalFetch(input, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

async function importCatGeneratorV2() {
  const mod = await import('@/lib/single-cat/catGeneratorV2.js');
  return mod.default;
}

type SummaryKey = 'tortieCount' | 'accessoryCount' | 'scarCount' | 'whitePatches' | 'vitiligo' | 'points';

type Summary = Record<SummaryKey, Record<string, number>>;

function emptySummary(): Summary {
  return {
    tortieCount: {},
    accessoryCount: {},
    scarCount: {},
    whitePatches: {},
    vitiligo: {},
    points: {},
  };
}

function record(summary: Summary, key: SummaryKey, value: string | number | null | undefined) {
  const bucket = summary[key];
  const label = value === undefined || value === null || value === '' ? 'none' : String(value);
  bucket[label] = (bucket[label] ?? 0) + 1;
}

function summarise(params: CatParams | Record<string, unknown>): Summary {
  const summary = emptySummary();
  const tortieList = Array.isArray(params.tortie) ? params.tortie : [];
  record(summary, 'tortieCount', tortieList.length);
  const accessories = Array.isArray(params.accessories) ? params.accessories : [];
  record(summary, 'accessoryCount', accessories.length);
  const scars = Array.isArray(params.scars) ? params.scars : [];
  record(summary, 'scarCount', scars.length);
  record(summary, 'whitePatches', params.whitePatches as string | number | null | undefined);
  record(summary, 'vitiligo', params.vitiligo as string | number | null | undefined);
  record(summary, 'points', params.points as string | number | null | undefined);
  return summary;
}

function mergeSummaries(target: Summary, source: Summary) {
  (Object.keys(source) as SummaryKey[]).forEach((key) => {
    const bucket = source[key];
    Object.entries(bucket).forEach(([value, count]) => {
      target[key][value] = (target[key][value] ?? 0) + count;
    });
  });
}

function normalise(summary: Summary, total: number): Record<SummaryKey, Record<string, number>> {
  const result = {} as Record<SummaryKey, Record<string, number>>;
  (Object.keys(summary) as SummaryKey[]).forEach((key) => {
    result[key] = {};
    Object.entries(summary[key]).forEach(([value, count]) => {
      result[key][value] = count / total;
    });
  });
  return result;
}

describe('random generator parity', () => {
  it('exposes toast accessories via sprite mapper', async () => {
    const spriteMapperMod = await import('@/lib/single-cat/spriteMapper');
    const spriteMapper = spriteMapperMod.default;
    if (!spriteMapper.loaded) {
      await spriteMapper.init();
    }
    const accessories = spriteMapper.getAccessories().map((name: string) => name.toUpperCase());
    expect(accessories).toContain('TOAST');
    expect(accessories).toContain('TOASTBERRY');
    expect(accessories).toContain('TOASTGRAPE');
    expect(accessories).toContain('TOASTNUTELLA');
    expect(accessories).toContain('TOASTPB');
  });

  it('roughly matches v2 distributions on key metrics', async () => {
    const catGenerator = await importCatGeneratorV2();
    const summaryV2 = emptySummary();
    const summaryV3 = emptySummary();

    for (let i = 0; i < SAMPLE_COUNT; i += 1) {
      const v2Params = await (
        catGenerator.generateRandomParams as (options?: { ignoreForbiddenSprites?: boolean }) => Promise<Record<string, unknown>>
      )({ ignoreForbiddenSprites: true });
      mergeSummaries(summaryV2, summarise(v2Params));

      const v3Params = await generateRandomParamsV3({ ignoreForbiddenSprites: true });
      mergeSummaries(summaryV3, summarise(v3Params));
    }

    const normalisedV2 = normalise(summaryV2, SAMPLE_COUNT);
    const normalisedV3 = normalise(summaryV3, SAMPLE_COUNT);

    const outliers: Array<{ metric: SummaryKey; value: string; ref: number; observed: number; delta: number; tolerance: number }> = [];

    (Object.keys(normalisedV2) as SummaryKey[]).forEach((key) => {
      const base = normalisedV2[key];
      const sample = normalisedV3[key];
      const values = new Set([...Object.keys(base), ...Object.keys(sample)]);
      values.forEach((value) => {
        const ref = base[value] ?? 0;
        const observed = sample[value] ?? 0;
        const variance = Math.max(ref * (1 - ref), observed * (1 - observed));
        const dynamicTol = Math.sqrt(variance / SAMPLE_COUNT) * 4 + 0.01; // 4σ + small cushion
        const tolerance = Math.max(MAX_DELTA, dynamicTol);
        const delta = Math.abs(observed - ref);
        if (delta > tolerance) {
          outliers.push({ metric: key, value, ref, observed, delta, tolerance });
        }
      });
    });

    if (outliers.length) {
      console.table(outliers);
    }

    expect(outliers).toHaveLength(0);
  }, 120_000);
});
