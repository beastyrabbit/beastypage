'use client';

import Image from 'next/image';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import pixelmatch from 'pixelmatch';

import { decodeImageFromDataUrl, renderCatV3 } from '@/lib/cat-v3/api';
import type { RendererResponse } from '@/lib/cat-v3/types';

interface LayerDebugEntry {
  id: string;
  label: string;
  diagnostics: string[];
  blendMode?: string | null;
  imageDataUrl: string;
  canvas: HTMLCanvasElement;
  enabled: boolean;
}

type MultiCountKey = 'accessories' | 'scars' | 'tortie';

const DEFAULT_SPRITE_NUMBER = 5;
const DEFAULT_PAYLOAD = {
  spriteNumber: DEFAULT_SPRITE_NUMBER,
  params: {
    spriteNumber: DEFAULT_SPRITE_NUMBER,
    peltName: 'SingleColour',
    colour: 'GINGER',
    eyeColour: 'GREEN',
    skinColour: 'PEACH',
    shading: false,
  },
};

const CANVAS_SIZE = 50;
const DISPLAY_SCALE = 8;
const DISPLAY_SIZE = CANVAS_SIZE * DISPLAY_SCALE;
const PIXELMATCH_THRESHOLD = 0.12;
const MAX_DIFF_PIXELS = CANVAS_SIZE * CANVAS_SIZE;

const blendToComposite = (blend?: string | null): { op: GlobalCompositeOperation; reset?: boolean } => {
  switch (blend?.toLowerCase()) {
    case 'multiply':
      return { op: 'multiply' };
    case 'screen':
      return { op: 'screen' };
    case 'add':
      return { op: 'lighter' };
    case 'replace':
      return { op: 'copy', reset: true };
    default:
      return { op: 'source-over' };
  }
};

export function RenderLayerDebugger() {
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [v2DataUrl, setV2DataUrl] = useState<string | null>(null);
  const [v3DataUrl, setV3DataUrl] = useState<string | null>(null);
  const [diffDataUrl, setDiffDataUrl] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerDebugEntry[]>([]);
  const [autoRunDiff, setAutoRunDiff] = useState(false);
  const autoRunDiffRef = useRef(false);
  const [diffPixelFloor, setDiffPixelFloor] = useState(1);
  const [lastMismatch, setLastMismatch] = useState<number | null>(null);
  const [multiCounts, setMultiCounts] = useState<Record<MultiCountKey, { enabled: boolean; count: number }>>({
    accessories: { enabled: false, count: 2 },
    scars: { enabled: false, count: 2 },
    tortie: { enabled: false, count: 2 },
  });
  const payloadInputId = useId();

  const recomposedRef = useRef<HTMLCanvasElement>(null);

  const activeLayerCount = layers.filter((layer) => layer.enabled).length;

  const normaliseCanvas = useCallback((source: HTMLCanvasElement | OffscreenCanvas): HTMLCanvasElement => {
    if (source instanceof HTMLCanvasElement) {
      return source;
    }

    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return canvas;
    }

    try {
      ctx.drawImage(source as unknown as CanvasImageSource, 0, 0);
    } catch (error) {
      if ('transferToImageBitmap' in source && typeof source.transferToImageBitmap === 'function') {
        try {
          const bitmap = source.transferToImageBitmap();
          ctx.drawImage(bitmap, 0, 0);
        } catch (err) {
          console.error('Failed to draw OffscreenCanvas bitmap', err);
        }
      } else {
        console.error('Unable to normalise OffscreenCanvas', error);
      }
    }

    return canvas;
  }, []);

  const recomputeComposite = useCallback(() => {
    const canvas = recomposedRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const layer of layers) {
      if (!layer.enabled) continue;
      const { op, reset } = blendToComposite(layer.blendMode);
      ctx.globalCompositeOperation = op;
      ctx.drawImage(layer.canvas, 0, 0);
      if (reset) {
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }, [layers]);

  useEffect(() => {
    if (!recomposedRef.current) return;
    recomposedRef.current.width = CANVAS_SIZE;
    recomposedRef.current.height = CANVAS_SIZE;
  }, []);

useEffect(() => {
  recomputeComposite();
}, [recomputeComposite]);

useEffect(() => {
  autoRunDiffRef.current = autoRunDiff;
}, [autoRunDiff]);

  const runComparison = useCallback(async (payload: { spriteNumber: number; params: Record<string, unknown> }) => {
    setLoading(true);
    setError(null);
    try {
      const spriteNumber = Number(payload.spriteNumber ?? DEFAULT_SPRITE_NUMBER);
      const params: Record<string, unknown> = { ...payload.params };
      if (params.spriteNumber == null) {
        params.spriteNumber = spriteNumber;
      }

      const { default: catGenerator } = await import('@/lib/single-cat/catGeneratorV2.js');
      const v2Result = await catGenerator.render(params, { outputFormat: 'canvas' });
      const v2Canvas = normaliseCanvas(v2Result.canvas as HTMLCanvasElement | OffscreenCanvas);
      setV2DataUrl(v2Canvas.toDataURL('image/png'));

      const rendererResult: RendererResponse = await renderCatV3({
        spriteNumber,
        params,
        collectLayers: true,
        includeLayerImages: true,
      });
      setV3DataUrl(rendererResult.imageDataUrl);

      const v2Aux = await decodeImageFromDataUrl(v2Canvas.toDataURL('image/png'));
      const v3Aux = await decodeImageFromDataUrl(rendererResult.imageDataUrl);

      const diffCanvas = document.createElement('canvas');
      diffCanvas.width = CANVAS_SIZE;
      diffCanvas.height = CANVAS_SIZE;
      const diffCtx = diffCanvas.getContext('2d');
      if (!diffCtx) {
        throw new Error('Failed to create diff canvas context');
      }
      const v2Ctx = v2Aux.getContext('2d');
      const v3Ctx = v3Aux.getContext('2d');
      if (!v2Ctx || !v3Ctx) {
        throw new Error('Failed to read canvas contexts for diff');
      }
      const v2ImageData = v2Ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const v3ImageData = v3Ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const diffImageData = diffCtx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
      const mismatch = pixelmatch(v2ImageData.data, v3ImageData.data, diffImageData.data, CANVAS_SIZE, CANVAS_SIZE, {
        threshold: PIXELMATCH_THRESHOLD,
        diffColor: [255, 0, 0],
        diffMask: false,
      });
      diffCtx.putImageData(diffImageData, 0, 0);
      setDiffDataUrl(diffCanvas.toDataURL('image/png'));

      const layerEntries: LayerDebugEntry[] = [];
      if (rendererResult.layers) {
        for (const layer of rendererResult.layers) {
          if (!layer.imageDataUrl) continue;
          const canvasElement = await decodeImageFromDataUrl(layer.imageDataUrl);
          layerEntries.push({
            id: layer.id,
            label: layer.label,
            diagnostics: layer.diagnostics ?? [],
            blendMode: layer.blendMode,
            imageDataUrl: layer.imageDataUrl,
            canvas: canvasElement,
            enabled: true,
          });
        }
      }
      setLayers(layerEntries);
      setLastMismatch(mismatch);

      return mismatch;
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [normaliseCanvas]);

  const buildRandomOptions = useCallback(() => {
    const options: {
      ignoreForbiddenSprites: boolean;
      accessoryCount: number;
      scarCount?: number;
      tortieCount?: number;
    } = { ignoreForbiddenSprites: true, accessoryCount: 1 };
    if (multiCounts.accessories.enabled) {
      options.accessoryCount = Math.min(Math.max(multiCounts.accessories.count, 1), 4);
    }
    if (multiCounts.scars.enabled) {
      options.scarCount = Math.min(Math.max(multiCounts.scars.count, 1), 4);
    }
    if (multiCounts.tortie.enabled) {
      options.tortieCount = Math.min(Math.max(multiCounts.tortie.count, 1), 4);
    }
    return options;
  }, [multiCounts]);

  const handleRandomise = useCallback(async () => {
    setError(null);
    try {
      const { default: catGenerator } = await import('@/lib/single-cat/catGeneratorV2.js');
      const params = await catGenerator.generateRandomParams(buildRandomOptions());
      const spriteNumber = Number(params.spriteNumber ?? DEFAULT_SPRITE_NUMBER);
      const payload = { spriteNumber, params: { ...params, spriteNumber } };
      setPayloadText(JSON.stringify(payload, null, 2));
      await runComparison(payload);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [buildRandomOptions, runComparison]);

  const handleToggleLayer = useCallback((index: number) => {
    setLayers((prev) => prev.map((layer, i) => (i === index ? { ...layer, enabled: !layer.enabled } : layer)));
  }, []);

  const handleApplyAll = useCallback((value: boolean) => {
    setLayers((prev) => prev.map((layer) => ({ ...layer, enabled: value })));
  }, []);

  const handleRandomUntilDiff = useCallback(async () => {
    if (autoRunDiff) {
      setAutoRunDiff(false);
      return;
    }
    setAutoRunDiff(true);
    setError(null);
    try {
      const { default: catGenerator } = await import('@/lib/single-cat/catGeneratorV2.js');
      let found = false;
      while (autoRunDiffRef.current) {
        const params = await catGenerator.generateRandomParams(buildRandomOptions());
        const spriteNumber = Number(params.spriteNumber ?? DEFAULT_SPRITE_NUMBER);
        const payload = { spriteNumber, params: { ...params, spriteNumber } };
        const mismatch = await runComparison(payload);
        if (mismatch >= Math.max(diffPixelFloor, 1)) {
          setPayloadText(JSON.stringify(payload, null, 2));
          found = true;
          break;
        }
      }
      if (!found && autoRunDiffRef.current) {
        setError('Stopped searching.');
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAutoRunDiff(false);
    }
  }, [autoRunDiff, buildRandomOptions, diffPixelFloor, runComparison]);

  const handleRun = useCallback(async () => {
    try {
      const parsed = JSON.parse(payloadText);
      const spriteNumber: number = parsed.spriteNumber ?? DEFAULT_SPRITE_NUMBER;
      if (typeof spriteNumber !== 'number') {
        throw new Error('`spriteNumber` must be a number');
      }
      const paramsInput: Record<string, unknown> = parsed.params ?? {};
      const payload = { spriteNumber, params: { ...paramsInput, spriteNumber } };
      await runComparison(payload);
      setPayloadText(JSON.stringify(payload, null, 2));
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.name === 'SyntaxError') {
        setError('Invalid JSON payload');
      }
    }
  }, [payloadText, runComparison]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Render Layer Debugger</h1>
        <p className="text-sm text-neutral-300">
          Paste parameters or randomise to inspect CatGenerator V2 vs FastAPI V3 output layer by layer.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label htmlFor={payloadInputId} className="flex items-center justify-between text-sm font-medium text-neutral-200">
            Payload
            <div className="space-x-2">
              <button
                type="button"
                className="rounded-md bg-emerald-500 px-3 py-1 text-sm text-white hover:bg-emerald-600"
                onClick={handleRandomise}
                disabled={loading || autoRunDiff}
              >
                Randomise
              </button>
              <button
                type="button"
                className="rounded-md bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
                onClick={handleRun}
                disabled={loading || autoRunDiff}
              >
                Run
              </button>
              <button
                type="button"
                className="rounded-md bg-amber-500 px-3 py-1 text-sm text-white hover:bg-amber-600"
                onClick={handleRandomUntilDiff}
                disabled={loading}
              >
                {autoRunDiff ? 'Stop search' : 'Random until diff'}
              </button>
            </div>
          </label>
          <textarea
            id={payloadInputId}
            className="h-64 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
            spellCheck={false}
            value={payloadText}
            onChange={(event) => setPayloadText(event.target.value)}
          />
          <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-sm text-neutral-200">
            <div className="flex items-center justify-between">
              <span className="font-medium">Diff pixel minimum</span>
              <input
                type="number"
                min={1}
                max={MAX_DIFF_PIXELS}
                value={diffPixelFloor}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isNaN(next)) {
                    setDiffPixelFloor(Math.min(Math.max(next, 1), MAX_DIFF_PIXELS));
                  }
                }}
                className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-xs text-neutral-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <input
              type="range"
              min={1}
              max={MAX_DIFF_PIXELS}
              step={1}
              value={diffPixelFloor}
              onChange={(event) => setDiffPixelFloor(Number(event.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>1</span>
              <span>{MAX_DIFF_PIXELS}</span>
            </div>
            {lastMismatch !== null && (
              <p className="text-xs text-neutral-300">Last mismatch: {lastMismatch} pixels</p>
            )}
          </div>
          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-sm text-neutral-200">
            <span className="font-medium">Multi-count options</span>
            {[
              { key: 'accessories', label: 'Accessories' },
              { key: 'scars', label: 'Scars' },
              { key: 'tortie', label: 'Tortie layers' },
            ].map(({ key, label }) => {
              const state = multiCounts[key as keyof typeof multiCounts];
              return (
                <div key={key} className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.enabled}
                      onChange={(event) =>
                        setMultiCounts((prev) => ({
                          ...prev,
                          [key as MultiCountKey]: {
                            ...prev[key as MultiCountKey],
                            enabled: event.target.checked,
                          },
                        }))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>{label}</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={state.count}
                    disabled={!state.enabled}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isNaN(next)) {
                        setMultiCounts((prev) => ({
                          ...prev,
                          [key as MultiCountKey]: {
                            ...prev[key as MultiCountKey],
                            count: Math.min(Math.max(next, 1), 4),
                          },
                        }));
                      }
                    }}
                    className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-xs text-neutral-100 focus:border-emerald-500 focus:outline-none disabled:text-neutral-500"
                  />
                </div>
              );
            })}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap justify-center gap-6">
            <PreviewCard title="V2 (Browser)">
              {v2DataUrl ? (
                <Image
                  src={v2DataUrl}
                  alt="V2"
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  unoptimized
                  className="image-render-pixel"
                  style={{ imageRendering: 'pixelated', width: DISPLAY_SIZE, height: DISPLAY_SIZE }}
                />
              ) : (
                <Placeholder />
              )}
            </PreviewCard>
            <PreviewCard title="V3 (FastAPI)">
              {v3DataUrl ? (
                <Image
                  src={v3DataUrl}
                  alt="V3"
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  unoptimized
                  className="image-render-pixel"
                  style={{ imageRendering: 'pixelated', width: DISPLAY_SIZE, height: DISPLAY_SIZE }}
                />
              ) : (
                <Placeholder />
              )}
            </PreviewCard>
            <PreviewCard title="Diff">
              {diffDataUrl ? (
                <Image
                  src={diffDataUrl}
                  alt="Diff"
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  unoptimized
                  className="image-render-pixel"
                  style={{ imageRendering: 'pixelated', width: DISPLAY_SIZE, height: DISPLAY_SIZE }}
                />
              ) : (
                <Placeholder />
              )}
            </PreviewCard>
            <PreviewCard title={`Recomposed (${activeLayerCount}/${layers.length})`}>
              <canvas
                ref={recomposedRef}
                className="image-render-pixel"
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE, imageRendering: 'pixelated' }}
              />
            </PreviewCard>
          </div>
          <div className="flex gap-2 text-xs text-neutral-300">
            <button
              type="button"
              className="rounded-md border border-slate-700 px-3 py-1 hover:border-emerald-500 hover:text-emerald-400"
              onClick={() => handleApplyAll(true)}
              disabled={layers.length === 0}
            >
              Enable All
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-700 px-3 py-1 hover:border-red-500 hover:text-red-400"
              onClick={() => handleApplyAll(false)}
              disabled={layers.length === 0}
            >
              Disable All
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Layers</h2>
        {layers.length === 0 ? (
          <p className="text-sm text-neutral-400">Run the debugger to load layer preview images.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {layers.map((layer, index) => (
              <div
                key={layer.id}
                className={`rounded-lg border p-3 transition-colors ${layer.enabled ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-700 bg-slate-900/60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{layer.label}</p>
                    <p className="text-xs text-neutral-300">{layer.diagnostics.join(', ') || '—'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleLayer(index)}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${layer.enabled ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-neutral-200'}`}
                  >
                    {layer.enabled ? 'On' : 'Off'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-neutral-400">Blend: {layer.blendMode ?? 'alpha'}</p>
                <Image
                  src={layer.imageDataUrl}
                  alt={layer.label}
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  unoptimized
                  className="mt-3 rounded-md border border-slate-800 image-render-pixel"
                  style={{ imageRendering: 'pixelated', width: DISPLAY_SIZE, height: DISPLAY_SIZE }}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PreviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-sm font-medium text-neutral-200">{title}</p>
      <div className="mt-3 flex items-center justify-center rounded-lg bg-slate-950/40 p-3" style={{ minHeight: DISPLAY_SIZE }}>
        {children}
      </div>
    </div>
  );
}

function Placeholder() {
  return <span className="text-xs text-neutral-500">Run to view output</span>;
}
