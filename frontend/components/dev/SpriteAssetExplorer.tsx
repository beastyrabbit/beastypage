'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Image from "next/image";

import spriteSheetLoader from '@/lib/single-cat/spriteSheetLoader';
import { ensureSpriteMapper } from '@/lib/cat-v3/randomGenerator';
import exclusiveManifest from '@/public/sprite-data/v3-exclusive.json';

type SpriteIndexEntry = {
  spritesheet: string;
  xOffset: number;
  yOffset: number;
  width?: number;
  height?: number;
};

type SpritePreview = {
  spriteNumber: number;
  dataUrl: string | null;
};

type SpriteSheetLoaderInstance = {
  init(): Promise<boolean>;
  getSprite(spriteName: string, spriteNumber: number): Promise<HTMLCanvasElement | OffscreenCanvas | null>;
  spritesIndex?: Record<string, SpriteIndexEntry>;
};

type SpriteMapperLike = {
  spritesIndex?: Record<string, SpriteIndexEntry>;
};

const loader = spriteSheetLoader as unknown as SpriteSheetLoaderInstance;

type CategoryId =
  | 'all'
  | 'pelts'
  | 'tortie'
  | 'white'
  | 'lineart'
  | 'accessories'
  | 'scars'
  | 'genemod'
  | 'misc';

const SPRITE_NUMBERS = Array.from({ length: 21 }, (_, i) => i);

const CATEGORIES: Array<{ id: CategoryId; label: string; predicate: (key: string) => boolean }> = [
  { id: 'all', label: 'All keys', predicate: () => true },
  {
    id: 'pelts',
    label: 'Pelts & base colours',
    predicate: (key) =>
      /(single|tabby|marbled|rosette|smoke|ticked|speckled|bengal|mackerel|classic|sokoke|agouti|singlestripe|masked)/.test(
        key
      ),
  },
  {
    id: 'tortie',
    label: 'Tortie masks & overlays',
    predicate: (key) => key.startsWith('tortiemask'),
  },
  {
    id: 'white',
    label: 'White patches / vitiligo / points',
    predicate: (key) => key.startsWith('white') || key.startsWith('points') || key.startsWith('vitiligo'),
  },
  {
    id: 'lineart',
    label: 'Lineart & shading',
    predicate: (key) => key.includes('lineart') || key.includes('shading') || key.includes('lighting'),
  },
  {
    id: 'accessories',
    label: 'Accessories & collars',
    predicate: (key) => key.includes('accessories') || key.includes('collars') || key.includes('bow'),
  },
  {
    id: 'scars',
    label: 'Scars & missing parts',
    predicate: (key) => key.startsWith('scars') || key.startsWith('missingscar') || key.includes('scar'),
  },
  {
    id: 'genemod',
    label: 'Genemod / borders',
    predicate: (key) => key.startsWith('genemod') || key.includes('bord'),
  },
  {
    id: 'misc',
    label: 'Other',
    predicate: (key) =>
      !(
        /(single|tabby|marbled|rosette|smoke|ticked|speckled|bengal|mackerel|classic|sokoke|agouti|singlestripe|masked)/.test(
          key
        ) ||
        key.startsWith('tortiemask') ||
        key.startsWith('white') ||
        key.startsWith('points') ||
        key.startsWith('vitiligo') ||
        key.includes('lineart') ||
        key.includes('shading') ||
        key.includes('lighting') ||
        key.includes('accessories') ||
        key.includes('collars') ||
        key.includes('bow') ||
        key.startsWith('scars') ||
        key.startsWith('missingscar') ||
        key.includes('scar') ||
        key.startsWith('genemod') ||
        key.includes('bord')
      ),
  },
];

const EXCLUSIVE_FILES = (exclusiveManifest as { files?: string[] }).files ?? [];

interface ExclusiveGroup {
  group: string;
  count: number;
  examples: string[];
}

function toTitle(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function canvasToDataUrl(canvas: HTMLCanvasElement | OffscreenCanvas | null): string | null {
  if (!canvas) return null;
  if (canvas instanceof HTMLCanvasElement) {
    return canvas.toDataURL();
  }

  try {
    const tempCanvas = document.createElement('canvas');
    const width =
      'width' in canvas && typeof (canvas as OffscreenCanvas).width === 'number'
        ? (canvas as OffscreenCanvas).width
        : 50;
    const height =
      'height' in canvas && typeof (canvas as OffscreenCanvas).height === 'number'
        ? (canvas as OffscreenCanvas).height
        : 50;
    tempCanvas.width = width;
    tempCanvas.height = height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas as unknown as CanvasImageSource, 0, 0);
    return tempCanvas.toDataURL();
  } catch (error) {
    console.error('Failed to convert sprite to data URL', error);
    return null;
  }
}

export function SpriteAssetExplorer() {
  const [availableKeys, setAvailableKeys] = useState<string[]>([]);
  const [indexEntries, setIndexEntries] = useState<Record<string, SpriteIndexEntry>>({});
  const [category, setCategory] = useState<CategoryId>('all');
  const [filter, setFilter] = useState<string>('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [previews, setPreviews] = useState<SpritePreview[]>([]);
  const [loadingKey, setLoadingKey] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const loadTokenRef = useRef(0);
  const filterInputId = useId();
  const exclusiveTotal = EXCLUSIVE_FILES.length;

  const exclusiveGroups = useMemo<ExclusiveGroup[]>(() => {
    if (!exclusiveTotal) return [];
    const groups = new Map<string, ExclusiveGroup>();
    for (const rel of EXCLUSIVE_FILES) {
      const parts = rel.split('/');
      const groupKey = parts.length > 1 ? parts[0] : rel.replace(/\.png$/i, '');
      const entry = groups.get(groupKey) ?? { group: groupKey, count: 0, examples: [] };
      entry.count += 1;
      if (entry.examples.length < 3) {
        entry.examples.push(parts.length > 1 ? parts.slice(1).join('/') : rel);
      }
      groups.set(groupKey, entry);
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [exclusiveTotal]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mapper = (await ensureSpriteMapper()) as SpriteMapperLike;
        await loader.init();
        const index = loader.spritesIndex ?? mapper.spritesIndex ?? {};
        const keys = Object.keys(index).sort((a, b) => a.localeCompare(b));
        if (!cancelled) {
          setAvailableKeys(keys);
          setIndexEntries(index);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredKeys = useMemo(() => {
    const predicate = CATEGORIES.find((entry) => entry.id === category)?.predicate ?? (() => true);
    const search = filter.trim().toLowerCase();
    return availableKeys.filter((key) => predicate(key) && (!search || key.toLowerCase().includes(search)));
  }, [availableKeys, category, filter]);

  const handleSelectKey = useCallback((key: string) => {
    if (key === selectedKey) return;
    setSelectedKey(key);
    setPreviews([]);
    setLoadingKey(true);
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;

    (async () => {
      const previewsList: SpritePreview[] = [];
      for (const spriteNumber of SPRITE_NUMBERS) {
        try {
          const sprite = await loader.getSprite(key, spriteNumber);
          const dataUrl = canvasToDataUrl(sprite);
          previewsList.push({ spriteNumber, dataUrl });
        } catch (err) {
          console.warn(`Failed to load sprite ${key} #${spriteNumber}`, err);
          previewsList.push({ spriteNumber, dataUrl: null });
        }
      }
      if (loadTokenRef.current === token) {
        setPreviews(previewsList);
        setLoadingKey(false);
      }
    })();
  }, [selectedKey]);

  const selectedMeta = selectedKey ? indexEntries[selectedKey] : null;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold text-white">Sprite Asset Explorer</h1>
        <p className="text-sm text-neutral-300">
          Browse the sprite sheets currently bundled for the V3 renderer. Filter by category or search keys, then preview
          the 21 sprite frames directly in the browser.
        </p>
      </header>

      {exclusiveGroups.length > 0 && (
        <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Backend-only sprite sheets</h2>
              <p className="text-xs text-neutral-400">
                {exclusiveTotal} PNGs live in the FastAPI renderer bundle but aren’t in the legacy V2 sprites folder yet.
                These cover seasonal accessories, raincoats, crowns, fruit/flower sets, small animals, new genemod bases, and the paralyzed lineart variants.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {exclusiveGroups.slice(0, 9).map((group) => (
              <div key={group.group} className="rounded-lg border border-slate-800/70 bg-slate-950/50 p-3 text-xs text-neutral-300">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{toTitle(group.group)}</span>
                  <span className="font-mono text-[11px] text-neutral-400">{group.count}</span>
                </div>
                {group.examples.length > 0 && (
                  <div className="mt-1 text-[11px] text-neutral-400">
                    Examples: {group.examples.map((example) => example.replace(/\.png$/i, '')).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-neutral-500">
            Heads-up: because these files are only on the backend, the previewer can’t display them yet. Promote any groups you want in the web bundle by copying the sheets into{' '}
            <code className="ml-1 rounded bg-slate-800 px-1 py-0.5 text-[10px] text-neutral-200">frontend/public/sprites</code>. 
            No bread/toast/blanket accessories showed up in this drop—the new material is mostly crowns, rain gear, fruit/flower sets, snakes, insects, and genemod overlays.
          </p>
        </section>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/60 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      )}

      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-4">
        <div className="md:col-span-1 space-y-4">
          <div>
            <p className="block text-xs font-semibold uppercase tracking-wide text-neutral-400">Category</p>
            <div className="mt-2 flex flex-col gap-2 text-sm text-neutral-100">
              {CATEGORIES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setCategory(entry.id)}
                  className={`rounded-md px-3 py-1 text-left ${
                    category === entry.id
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'bg-slate-950/50 text-neutral-200 hover:bg-slate-800/70'
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor={filterInputId} className="block text-xs font-semibold uppercase tracking-wide text-neutral-400">Filter</label>
            <input
              id={filterInputId}
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="e.g. tortiemask, bord, collar…"
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="md:col-span-3">
          <div className="mb-2 text-xs text-neutral-400">
            {filteredKeys.length.toLocaleString()} of {availableKeys.length.toLocaleString()} sprite groups
          </div>
          <div className="max-h-[320px] overflow-y-auto rounded-md border border-slate-800 bg-slate-950/40 text-sm text-neutral-100">
            <ul>
              {filteredKeys.map((key) => {
                const active = key === selectedKey;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => handleSelectKey(key)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left ${
                        active ? 'bg-emerald-500/20 text-emerald-200' : 'hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="font-mono text-xs">{key}</span>
                      {active && <span className="text-[10px] uppercase tracking-wide text-emerald-300">selected</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {selectedKey && (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{selectedKey}</h2>
              {selectedMeta && (
                <p className="text-xs text-neutral-400">
                  Sheet: {selectedMeta.spritesheet} · offset ({selectedMeta.xOffset}, {selectedMeta.yOffset})
                  {selectedMeta.width ? ` · ${selectedMeta.width}×${selectedMeta.height}` : ''}
                </p>
              )}
            </div>
            {loadingKey && <div className="text-xs text-neutral-400">Loading frames…</div>}
          </div>

          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            {previews.map((preview) => (
              <div
                key={`${selectedKey}-${preview.spriteNumber}`}
                className="flex flex-col items-center rounded-lg border border-slate-800/70 bg-slate-950/40 p-3"
              >
                <div className="text-xs text-neutral-400">#{preview.spriteNumber}</div>
                <div className="mt-2 h-20 w-20 rounded-md border border-slate-800 bg-slate-900/80">
                  {preview.dataUrl ? (
                    <Image
                      src={preview.dataUrl}
                      alt={`${selectedKey} sprite ${preview.spriteNumber}`}
                      width={80}
                      height={80}
                      unoptimized
                      className="h-20 w-20"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-500">—</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
