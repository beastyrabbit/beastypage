'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import pixelmatch from 'pixelmatch';

import type { RendererResponse } from '@/lib/cat-v3/types';
import { decodeImageFromDataUrl, renderCatV3 } from '@/lib/cat-v3/api';

interface DiffStats {
  mismatch: number;
  total: number;
  ratio: number;
}

const DEFAULT_PARAMS: Record<string, unknown> = {
  spriteNumber: 5,
  colour: 'GINGER',
  eyeColour: 'GREEN',
  tint: 'none',
  shading: false,
};

const CANVAS_SIZE = 50;
const DISPLAY_SCALE = 6;
const DISPLAY_SIZE = CANVAS_SIZE * DISPLAY_SCALE;
const PIXELMATCH_THRESHOLD = 0.12;

export function CatRendererComparison() {
  const v2CanvasRef = useRef<HTMLCanvasElement>(null);
  const v3CanvasRef = useRef<HTMLCanvasElement>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement>(null);

  const [params, setParams] = useState<Record<string, unknown>>(DEFAULT_PARAMS);
  const [meta, setMeta] = useState<RendererResponse['meta'] | null>(null);
  const [layers, setLayers] = useState<RendererResponse['layers']>(undefined);
  const [diff, setDiff] = useState<DiffStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureCanvas = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return null;
    if (canvas.width !== CANVAS_SIZE) {
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    return ctx;
  };

  const drawComparison = useCallback(async (inputParams: Record<string, unknown>) => {
    setLoading(true);
    setError(null);

    try {
      const { default: catGenerator } = await import('@/lib/single-cat/catGeneratorV2.js');

      const v2Result = await catGenerator.render(inputParams);
      const v2Canvas = v2CanvasRef.current;
      const v2Ctx = ensureCanvas(v2Canvas);
      if (!v2Ctx) throw new Error('Failed to acquire V2 canvas context');
      v2Ctx.drawImage(v2Result.canvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

      const rendererResult = await renderCatV3({
        spriteNumber: Number(inputParams.spriteNumber ?? DEFAULT_PARAMS.spriteNumber),
        params: inputParams,
        collectLayers: true,
      });

      const v3Offscreen = await decodeImageFromDataUrl(rendererResult.imageDataUrl);
      const v3Ctx = ensureCanvas(v3CanvasRef.current);
      if (!v3Ctx) throw new Error('Failed to acquire V3 canvas context');
      v3Ctx.drawImage(v3Offscreen, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

      const diffCtx = ensureCanvas(diffCanvasRef.current);
      if (!diffCtx) throw new Error('Failed to acquire diff canvas context');

      const v2Data = v2Ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const v3Data = v3Ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const diffData = diffCtx.createImageData(CANVAS_SIZE, CANVAS_SIZE);

      const mismatch = pixelmatch(
        v2Data.data,
        v3Data.data,
        diffData.data,
        CANVAS_SIZE,
        CANVAS_SIZE,
        {
          threshold: PIXELMATCH_THRESHOLD,
          diffColor: [255, 0, 0],
          diffMask: false,
        }
      );

      diffCtx.putImageData(diffData, 0, 0);

      setDiff({ mismatch, total: CANVAS_SIZE * CANVAS_SIZE, ratio: mismatch / (CANVAS_SIZE * CANVAS_SIZE) });
      setMeta(rendererResult.meta);
      setLayers(rendererResult.layers ?? undefined);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void drawComparison(params);
  }, [params, drawComparison]);

  const handleRandomise = useCallback(async () => {
    try {
      const { default: catGenerator } = await import('@/lib/single-cat/catGeneratorV2.js');
      const randomParams = await catGenerator.generateRandomParams({ ignoreForbiddenSprites: true, accessoryCount: 0 });
      setParams({ ...randomParams });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Cat Generator V3 Parity Lab</h1>
          <p className="text-sm text-neutral-300">
            Compare legacy V2 (browser) output with the new FastAPI renderer. Randomise to explore more cats and inspect layer timings.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            onClick={handleRandomise}
            disabled={loading}
          >
            Randomise cat
          </button>
          <button
            type="button"
            className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
            onClick={() => void drawComparison(params)}
            disabled={loading}
          >
            Re-run diff
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="grid gap-6 md:grid-cols-3">
        <CanvasPanel title="V2 Browser Renderer" subtitle="catGeneratorV2.js" canvasRef={v2CanvasRef} loading={loading} />
        <CanvasPanel title="V3 FastAPI Renderer" subtitle="backend/renderer_service" canvasRef={v3CanvasRef} loading={loading} />
        <CanvasPanel title="Pixel Diff" subtitle="Red indicates mismatched pixels" canvasRef={diffCanvasRef} loading={loading} />
      </section>

      {diff && (
        <div className="grid gap-4 rounded-lg border border-slate-700 bg-slate-900/70 p-4 sm:grid-cols-3">
          <Metric label="Mismatch" value={`${diff.mismatch}`} helper="pixels differ" />
          <Metric
            label="Ratio"
            value={`${(diff.ratio * 100).toFixed(2)}%`}
            helper={`${diff.mismatch} / ${diff.total}`}
          />
          <Metric
            label="Render time"
            value={meta ? `${meta.duration_ms.toFixed(2)} ms` : '—'}
            helper={meta ? `memory pressure: ${meta.memory_pressure ? 'yes' : 'no'}` : 'backend timing'}
          />
        </div>
      )}

      {layers && layers.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
          <h2 className="mb-2 text-lg font-semibold text-white">Layer diagnostics</h2>
          <table className="w-full table-auto text-sm text-neutral-200">
            <thead className="text-left text-neutral-400">
              <tr>
                <th className="py-2">Layer</th>
                <th className="py-2">Duration</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {layers.map((layer) => (
                <tr key={layer.id} className="border-t border-slate-800/80">
                  <td className="py-2 font-medium text-white">{layer.label}</td>
                  <td className="py-2">{layer.duration_ms.toFixed(2)} ms</td>
                  <td className="py-2 text-neutral-300">
                    {layer.diagnostics?.length ? layer.diagnostics.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface CanvasPanelProps {
  title: string;
  subtitle: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  loading: boolean;
}

function CanvasPanel({ title, subtitle, canvasRef, loading }: CanvasPanelProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="text-xs text-neutral-400">{subtitle}</p>
      </div>
      <div className="flex items-center justify-center rounded-lg bg-slate-950/50 p-4" style={{ minHeight: DISPLAY_SIZE }}>
        <canvas
          ref={canvasRef}
          className="image-render-pixel image-render-sharp"
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          style={{
            width: DISPLAY_SIZE,
            height: DISPLAY_SIZE,
            imageRendering: 'pixelated',
          }}
        />
      </div>
      {loading && <p className="mt-3 text-xs text-neutral-400">Rendering…</p>}
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string;
  helper?: string;
}

function Metric({ label, value, helper }: MetricProps) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="text-xl font-semibold text-white">{value}</p>
      {helper && <p className="text-xs text-neutral-400">{helper}</p>}
    </div>
  );
}
