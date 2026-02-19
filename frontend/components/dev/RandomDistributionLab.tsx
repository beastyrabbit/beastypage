'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CatParams } from '@/lib/cat-v3/types';
import type { RandomGenerationOptions } from '@/lib/cat-v3/randomGenerator';
import { ensureSpriteMapper, generateRandomParamsV3 } from '@/lib/cat-v3/randomGenerator';

type CountStrategy = 'weighted' | 'uniform';

type JsonParams = CatParams;

interface MetricDefinition {
  key: string;
  label: string;
  extractor: (params: JsonParams) =>
    | string
    | number
    | boolean
    | Array<string | number | boolean>
    | null
    | undefined;
  importance?: 'high' | 'normal';
}

type MetricCounts = Record<string, number>;
type SimulationMetrics = Record<string, MetricCounts>;

interface SimulationResult {
  id: string;
  label: string;
  generator: 'v2' | 'v3';
  iterations: number;
  countsMode?: CountStrategy;
  metrics: SimulationMetrics;
  durationMs: number;
}

interface SimulationBundle {
  baseline: SimulationResult;
  variant: SimulationResult;
  alternate?: SimulationResult | null;
}

interface ProgressState {
  phase: string;
  completed: number;
  total: number;
}

const DEFAULT_ITERATIONS = 10000;
const MAX_DISPLAY_ROWS = 15;

const METRICS: MetricDefinition[] = [
  { key: 'spriteNumber', label: 'Sprite Number', extractor: (p) => (p.spriteNumber as string | number | null | undefined) ?? 'unknown', importance: 'high' },
  { key: 'peltName', label: 'Pelt', extractor: (p) => p.peltName as string | null | undefined, importance: 'high' },
  { key: 'colour', label: 'Base Colour', extractor: (p) => p.colour as string | null | undefined, importance: 'high' },
  { key: 'tint', label: 'Tint', extractor: (p) => p.tint as string | null | undefined, importance: 'high' },
  { key: 'skinColour', label: 'Skin Colour', extractor: (p) => p.skinColour as string | null | undefined },
  { key: 'eyeColour', label: 'Eye Colour', extractor: (p) => p.eyeColour as string | null | undefined },
  { key: 'eyeColour2', label: 'Second Eye Colour', extractor: (p) => p.eyeColour2 as string | null | undefined },
  { key: 'reverse', label: 'Reverse Pose', extractor: (p) => Boolean(p.reverse) },
  { key: 'shading', label: 'Shading Enabled', extractor: (p) => Boolean(p.shading) },
  { key: 'isTortie', label: 'Is Tortie', extractor: (p) => Boolean(p.isTortie), importance: 'high' },
  {
    key: 'tortieCount',
    label: 'Tortie Layer Count',
    extractor: (p) => getTortieLayers(p).length,
    importance: 'high',
  },
  {
    key: 'tortieMasks',
    label: 'Tortie Masks',
    extractor: (p) => {
      const layers = getTortieLayers(p);
      if (!layers.length) return ['none'];
      return layers.map((layer) => layer.mask ?? 'unknown');
    },
  },
  { key: 'whitePatches', label: 'White Patches', extractor: (p) => (p.whitePatches as string | null | undefined) ?? 'none', importance: 'high' },
  {
    key: 'whitePatchesTint',
    label: 'White Patch Tint',
    extractor: (p) => (p.whitePatchesTint as string | null | undefined) ?? 'none',
  },
  { key: 'points', label: 'Points', extractor: (p) => (p.points as string | null | undefined) ?? 'none', importance: 'high' },
  { key: 'vitiligo', label: 'Vitiligo', extractor: (p) => (p.vitiligo as string | null | undefined) ?? 'none', importance: 'high' },
  {
    key: 'accessoryCount',
    label: 'Accessories (count)',
    extractor: (p) => getAccessories(p).length,
    importance: 'high',
  },
  {
    key: 'accessories',
    label: 'Accessories (names)',
    extractor: (p) => {
      const values = getAccessories(p);
      return values.length ? values : ['none'];
    },
  },
  {
    key: 'scarCount',
    label: 'Scars (count)',
    extractor: (p) => getScars(p).length,
    importance: 'high',
  },
  {
    key: 'scars',
    label: 'Scars (names)',
    extractor: (p) => {
      const values = getScars(p);
      return values.length ? values : ['none'];
    },
  },
];

interface CatGeneratorApi {
  generateRandomParams(options?: Record<string, unknown>): Promise<JsonParams>;
  __distributionWarm?: boolean;
}

let catGeneratorInstance: CatGeneratorApi | null = null;
let catGeneratorReady: Promise<CatGeneratorApi> | null = null;

async function ensureCatGenerator() {
  if (catGeneratorInstance) {
    return catGeneratorInstance;
  }
  if (!catGeneratorReady) {
    catGeneratorReady = (async () => {
      const mod = await import('@/lib/single-cat/catGeneratorV2.js');
      const generator = mod.default as CatGeneratorApi;
      await ensureSpriteMapper();
      if (!generator.__distributionWarm) {
        await generator.generateRandomParams({ ignoreForbiddenSprites: true });
        generator.__distributionWarm = true;
      }
      catGeneratorInstance = generator;
      return generator;
    })();
  }
  return catGeneratorReady;
}

function createEmptyMetrics(): SimulationMetrics {
  const metrics: SimulationMetrics = {};
  for (const metric of METRICS) {
    metrics[metric.key] = Object.create(null);
  }
  return metrics;
}

function normaliseValue(value: unknown): string {
  if (value === null || value === undefined) return 'none';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'none';
    return value.toString(10);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? 'none' : trimmed;
  }
  return String(value);
}

function incrementMetric(counts: MetricCounts, raw: unknown) {
  const key = normaliseValue(raw);
  counts[key] = (counts[key] ?? 0) + 1;
}

function accumulateMetrics(metrics: SimulationMetrics, params: JsonParams) {
  for (const metric of METRICS) {
    const value = metric.extractor(params);
    const counts = metrics[metric.key];
    if (Array.isArray(value)) {
      if (!value.length) {
        incrementMetric(counts, 'none');
      } else {
        for (const entry of value) {
          incrementMetric(counts, entry);
        }
      }
    } else {
      incrementMetric(counts, value);
    }
  }
}

function getAccessories(params: JsonParams): string[] {
  const base = new Set<string>();
  const list = Array.isArray(params.accessories) ? (params.accessories as unknown[]) : [];
  for (const entry of list) {
    if (entry) base.add(String(entry));
  }
  if (params.accessory) {
    base.add(String(params.accessory));
  }
  return Array.from(base);
}

function getScars(params: JsonParams): string[] {
  const base = new Set<string>();
  const list = Array.isArray(params.scars) ? (params.scars as unknown[]) : [];
  for (const entry of list) {
    if (entry) base.add(String(entry));
  }
  if (params.scar) {
    base.add(String(params.scar));
  }
  return Array.from(base);
}

interface TortieLayer {
  mask?: string;
  pattern?: string;
  colour?: string;
}

function getTortieLayers(params: JsonParams): TortieLayer[] {
  if (Array.isArray(params.tortie) && params.tortie.length) {
    return (params.tortie as unknown[])
      .filter(Boolean)
      .map((entry) => {
        if (typeof entry === 'object' && entry !== null) {
          const record = entry as Record<string, unknown>;
          return {
            mask: typeof record.mask === 'string' ? record.mask : undefined,
            pattern: typeof record.pattern === 'string' ? record.pattern : undefined,
            colour: typeof record.colour === 'string' ? record.colour : undefined,
          };
        }
        return {};
      });
  }
  if (params.isTortie && params.tortieMask) {
    return [
      {
        mask: typeof params.tortieMask === 'string' ? params.tortieMask : undefined,
        colour: typeof params.tortieColour === 'string' ? params.tortieColour : undefined,
        pattern: typeof params.tortiePattern === 'string' ? params.tortiePattern : undefined,
      },
    ];
  }
  return [];
}

async function runSimulation(
  label: string,
  generator: 'v2' | 'v3',
  iterations: number,
  options: RandomGenerationOptions | undefined,
  onProgress?: (state: ProgressState) => void
): Promise<SimulationResult> {
  const metrics = createEmptyMetrics();
  const startedAt = performance.now();
  const total = iterations;
  let produced = 0;
  const progressLabel = label;

  if (generator === 'v2') {
    const catGenerator = await ensureCatGenerator();
    const batchSize = 250;
    while (produced < total) {
      const slice = Math.min(batchSize, total - produced);
      const promises = [];
      for (let i = 0; i < slice; i += 1) {
        promises.push(catGenerator.generateRandomParams({ ignoreForbiddenSprites: true }));
      }
      const results = await Promise.all(promises);
      for (const params of results) {
        accumulateMetrics(metrics, params);
      }
      produced += slice;
      onProgress?.({ phase: progressLabel, completed: produced, total });
      if (produced < total) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    return {
      id: 'v2',
      label,
      generator,
      iterations,
      metrics,
      durationMs: performance.now() - startedAt,
    };
  }

  const batchSize = 500;
  while (produced < total) {
    const slice = Math.min(batchSize, total - produced);
    for (let i = 0; i < slice; i += 1) {
      const params = await generateRandomParamsV3({
        ignoreForbiddenSprites: true,
        countsMode: options?.countsMode,
      });
      accumulateMetrics(metrics, params);
    }
    produced += slice;
    onProgress?.({ phase: progressLabel, completed: produced, total });
    if (produced < total) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return {
    id: options?.countsMode === 'uniform' ? 'v3-uniform' : 'v3',
    label,
    generator,
    iterations,
    countsMode: options?.countsMode as CountStrategy | undefined,
    metrics,
    durationMs: performance.now() - startedAt,
  };
}

const SIGNIFICANT_THRESHOLD = 1; // percentage points

const SIM_COLORS: Record<string, string> = {
  v2: '#38bdf8',
  v3: '#34d399',
  'v3-uniform': '#f97316',
};

interface MetricRowLine {
  simId: string;
  label: string;
  percent: number;
  deltaFromBaseline: number;
}

interface MetricRow {
  value: string;
  lines: MetricRowLine[];
  maxPercent: number;
  baselinePercent: number;
  variantDelta: number;
}

interface IssueSummary {
  metric: MetricDefinition;
  value: string;
  baseline: number;
  variant: number;
  delta: number;
}

function percentOf(count: number | undefined, total: number): number {
  if (!total || !Number.isFinite(total)) return 0;
  if (!count) return 0;
  return (count / total) * 100;
}

function compileMetricRows(
  metric: MetricDefinition,
  baseline: SimulationResult,
  sims: SimulationResult[],
  variantId: string,
  limit = MAX_DISPLAY_ROWS
): MetricRow[] {
  const key = metric.key;
  const baselineCounts = baseline.metrics[key] ?? {};
  const values = new Set<string>();
  for (const sim of sims) {
    const counts = sim.metrics[key] ?? {};
    Object.keys(counts).forEach((value) => values.add(value));
  }

  const rows: MetricRow[] = [];
  for (const value of values) {
    const baselinePercent = percentOf(baselineCounts[value], baseline.iterations);
    const lines: MetricRowLine[] = sims.map((sim) => {
      const counts = sim.metrics[key] ?? {};
      const percent = percentOf(counts[value], sim.iterations);
      const delta = sim.id === baseline.id ? 0 : percent - baselinePercent;
      return {
        simId: sim.id,
        label: sim.label,
        percent,
        deltaFromBaseline: delta,
      };
    });
    const maxPercent = Math.max(...lines.map((line) => line.percent));
    const variantLine = lines.find((line) => line.simId === variantId);
    rows.push({
      value,
      lines,
      maxPercent,
      baselinePercent,
      variantDelta: variantLine ? variantLine.deltaFromBaseline : 0,
    });
  }

  rows.sort((a, b) => Math.abs(b.variantDelta) - Math.abs(a.variantDelta) || b.maxPercent - a.maxPercent);
  return rows.slice(0, limit);
}

function collectIssues(bundle: SimulationBundle): IssueSummary[] {
  const baseline = bundle.baseline;
  const variant = bundle.variant;
  const issues: IssueSummary[] = [];

  for (const metric of METRICS) {
    const metricKey = metric.key;
    const baselineCounts = baseline.metrics[metricKey] ?? {};
    const variantCounts = variant.metrics[metricKey] ?? {};
    const values = new Set<string>([
      ...Object.keys(baselineCounts),
      ...Object.keys(variantCounts),
    ]);

    for (const value of values) {
      const baselinePercent = percentOf(baselineCounts[value], baseline.iterations);
      const variantPercent = percentOf(variantCounts[value], variant.iterations);
      const delta = variantPercent - baselinePercent;
      if (Math.abs(delta) >= SIGNIFICANT_THRESHOLD) {
        issues.push({
          metric,
          value,
          baseline: baselinePercent,
          variant: variantPercent,
          delta,
        });
      }
    }
  }

  issues.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return issues;
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatDelta(value: number): string {
  if (Math.abs(value) < 0.01) return '±0.00';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function deltaClass(value: number): string {
  if (value > SIGNIFICANT_THRESHOLD) return 'text-emerald-400';
  if (value < -SIGNIFICANT_THRESHOLD) return 'text-rose-400';
  return 'text-neutral-400';
}

interface DistributionRow {
  value: string;
  baseline: number;
  variant: number;
  alternate?: number;
  delta: number;
}

interface DistributionChartDefinition {
  metric: MetricDefinition;
  rows: DistributionRow[];
}

function buildDistributionRows(
  metricKey: string,
  baseline: SimulationResult,
  variant: SimulationResult,
  alternate?: SimulationResult | null
): DistributionRow[] {
  const baselineCounts = baseline.metrics[metricKey] ?? {};
  const variantCounts = variant.metrics[metricKey] ?? {};
  const alternateCounts = alternate ? alternate.metrics[metricKey] ?? {} : undefined;
  const values = new Set<string>([
    ...Object.keys(baselineCounts),
    ...Object.keys(variantCounts),
    ...(alternateCounts ? Object.keys(alternateCounts) : []),
  ]);

  const rows: DistributionRow[] = [];
  values.forEach((value) => {
    const baselinePct = percentOf(baselineCounts[value], baseline.iterations);
    const variantPct = percentOf(variantCounts[value], variant.iterations);
    const alternatePct = alternateCounts && alternate ? percentOf(alternateCounts[value], alternate.iterations) : undefined;
    rows.push({
      value,
      baseline: baselinePct,
      variant: variantPct,
      alternate: alternatePct,
      delta: variantPct - baselinePct,
    });
  });

  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.baseline - a.baseline);
  return rows;
}

function buildExportSummary(bundle: SimulationBundle, includeAlternate: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    iterations: {
      baseline: bundle.baseline.iterations,
      variant: bundle.variant.iterations,
      alternate: includeAlternate && bundle.alternate ? bundle.alternate.iterations : undefined,
    },
  };

  METRICS.forEach((metric) => {
    const rows = buildDistributionRows(metric.key, bundle.baseline, bundle.variant, bundle.alternate)
      .map((row) => ({
        value: row.value,
        baseline: Number(row.baseline.toFixed(4)),
        variant: Number(row.variant.toFixed(4)),
        alternate: row.alternate === undefined ? undefined : Number(row.alternate.toFixed(4)),
        delta: Number(row.delta.toFixed(4)),
      }));
    payload[metric.label] = rows;
  });

  return payload;
}

function percentLabel(value: number): string {
  return `${value.toFixed(2)}%`;
}

interface DistributionChartProps {
  definition: DistributionChartDefinition;
  variantLabel: string;
  alternateLabel?: string | null;
}

function DistributionChart({ definition, variantLabel, alternateLabel }: DistributionChartProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? definition.rows : definition.rows.slice(0, 8);
  const hasHidden = !expanded && definition.rows.length > rows.length;

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-white">{definition.metric.label}</h3>
        <div className="flex items-center gap-3 text-[11px] text-neutral-400">
          <div className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-400/80" /> V2
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400/80" /> {variantLabel}
          </div>
          {alternateLabel && (
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-orange-400/80" /> {alternateLabel}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={`${definition.metric.key}-${row.value}`} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-neutral-300">
              <span className="font-medium text-white">{row.value}</span>
              <div className="flex items-center gap-3 font-mono">
                <span className="text-sky-200">{percentLabel(row.baseline)}</span>
                <span className="text-emerald-200">{percentLabel(row.variant)}</span>
                {row.alternate !== undefined && (
                  <span className="text-orange-200">{percentLabel(row.alternate)}</span>
                )}
                <span className={`text-xs ${deltaClass(row.delta)}`}>{formatDelta(row.delta)}</span>
              </div>
            </div>
            <div className="relative h-3 w-full rounded-full bg-slate-800/70">
              <span
                className="absolute left-0 top-0 h-full rounded-full border border-sky-400/60 bg-sky-500/40"
                style={{ width: `${Math.min(100, Math.max(0.2, row.baseline))}%` }}
                title={`V2 ${percentLabel(row.baseline)}`}
              />
              <span
                className="absolute left-0 top-0 h-full rounded-full border border-emerald-500/70 bg-emerald-400/80"
                style={{ width: `${Math.min(100, Math.max(0.2, row.variant))}%` }}
                title={`${variantLabel} ${percentLabel(row.variant)}`}
              />
              {row.alternate !== undefined && (
                <span
                  className="absolute left-0 top-0 h-full rounded-full border border-orange-500/70 bg-orange-400/70"
                  style={{ width: `${Math.min(100, Math.max(0.2, row.alternate))}%` }}
                  title={`${alternateLabel} ${percentLabel(row.alternate ?? 0)}`}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {hasHidden && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs font-medium text-emerald-300 underline-offset-2 hover:underline"
        >
          Show all {definition.rows.length} values
        </button>
      )}
      {expanded && definition.rows.length > 8 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs font-medium text-emerald-300 underline-offset-2 hover:underline"
        >
          Collapse
        </button>
      )}
    </div>
  );
}

type MetricSection = {
  metric: MetricDefinition;
  rows: MetricRow[];
};

interface SecondaryMetricsPanelProps {
  sections: MetricSection[];
  baselineId: string;
}

function SecondaryMetricsPanel({ sections, baselineId }: SecondaryMetricsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Additional metrics</h2>
          <p className="text-xs text-neutral-400">White patch tints, heterochromia, and other secondary attributes.</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-neutral-200 hover:border-emerald-400 hover:text-emerald-300"
        >
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      </div>
      {expanded && (
        <div className="mt-4 space-y-6">
          {sections.map((section) => (
            <div key={section.metric.key} className="space-y-2 rounded-lg border border-slate-800/70 bg-slate-950/40 p-3">
              <div className="text-sm font-semibold text-white">{section.metric.label}</div>
              <div className="space-y-2">
                {section.rows.map((row) => (
                  <div key={`${section.metric.key}-${row.value}`} className="rounded-md border border-slate-800/60 bg-slate-900/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-white">{row.value}</span>
                      <span className={`font-mono text-[11px] ${deltaClass(row.variantDelta)}`}>{formatDelta(row.variantDelta)}</span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {row.lines.map((line) => (
                        <div key={line.simId} className="flex items-center gap-3">
                          <span className="w-36 text-[11px] text-neutral-400">{line.label}</span>
                          <div className="relative h-2 flex-1 rounded-full bg-slate-800/70">
                            <span
                              className="absolute left-0 top-0 h-2 rounded-full"
                              style={{
                                width: `${Math.max(0, Math.min(100, line.percent)).toFixed(2)}%`,
                                backgroundColor: SIM_COLORS[line.simId] ?? '#94a3b8',
                              }}
                            />
                          </div>
                          <span className="w-14 text-right font-mono text-[11px] text-neutral-100">
                            {formatPercent(line.percent)}
                          </span>
                          {line.simId !== baselineId && (
                            <span className={`w-16 text-right font-mono text-[11px] ${deltaClass(line.deltaFromBaseline)}`}>
                              {formatDelta(line.deltaFromBaseline)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function RandomDistributionLab() {
  const sampleSizeInputId = 'random-distribution-sample-size';
  const [iterationsInput, setIterationsInput] = useState<string>(() => DEFAULT_ITERATIONS.toString());
  const [countsMode, setCountsMode] = useState<CountStrategy>('weighted');
  const [includeAlternate, setIncludeAlternate] = useState<boolean>(false);
  const [results, setResults] = useState<SimulationBundle | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const iterations = useMemo(() => {
    const parsed = Number.parseInt(iterationsInput, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_ITERATIONS;
    }
    return Math.min(parsed, 200000);
  }, [iterationsInput]);

  const handleQuickSelect = useCallback(
    (value: number) => {
      setIterationsInput(value.toString());
    },
    [setIterationsInput]
  );

  const handleRun = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    setProgress({ phase: 'Preparing', completed: 0, total: 1 });

    try {
      await ensureSpriteMapper();
      const [baseline, primary] = await Promise.all([
        runSimulation(
          'V2 (legacy browser)',
          'v2',
          iterations,
          undefined,
          (state) => setProgress({ ...state, phase: `V2: ${state.phase}` })
        ),
        runSimulation(
          `V3 (${countsMode === 'uniform' ? 'uniform' : 'weighted'})`,
          'v3',
          iterations,
          { countsMode },
          (state) => setProgress({ ...state, phase: `V3: ${state.phase}` })
        ),
      ]);

      let alternate: SimulationResult | null = null;
      if (includeAlternate) {
        const alternateMode: CountStrategy = countsMode === 'uniform' ? 'weighted' : 'uniform';
        alternate = await runSimulation(
          `V3 (${alternateMode === 'uniform' ? 'uniform' : 'weighted'})`,
          'v3',
          iterations,
          { countsMode: alternateMode },
          (state) => setProgress(state)
        );
      }

      setResults({
        baseline,
        variant: primary,
        alternate,
      });
      setProgress(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [countsMode, includeAlternate, iterations, running]);

  const simulations = useMemo(() => {
    if (!results) return [];
    const list: SimulationResult[] = [results.baseline, results.variant];
    if (results.alternate) list.push(results.alternate);
    return list;
  }, [results]);

  const metricSections = useMemo(() => {
    if (!results) {
      return {
        high: [] as Array<{ metric: MetricDefinition; rows: MetricRow[] }>,
        secondary: [] as Array<{ metric: MetricDefinition; rows: MetricRow[] }>,
      };
    }
    const baseline = results.baseline;
    const variantId = results.variant.id;
    const sims = simulations;

    const sections = METRICS.map((metric) => {
      const limit = metric.importance === 'high' ? 8 : 5;
      const rows = compileMetricRows(metric, baseline, sims, variantId, limit).filter((row) => row.maxPercent > 0);
      return { metric, rows };
    }).filter((section) => section.rows.length > 0);

    return {
      high: sections.filter((section) => section.metric.importance === 'high'),
      secondary: sections.filter((section) => section.metric.importance !== 'high'),
    };
  }, [results, simulations]);

  const issueSummary = useMemo(() => {
    if (!results) return [];
    return collectIssues(results).slice(0, 12);
  }, [results]);

  const distributionCharts = useMemo<DistributionChartDefinition[]>(() => {
    if (!results) return [];
    const charts: DistributionChartDefinition[] = [];
    METRICS.filter((metric) => metric.importance === 'high').forEach((metric) => {
      const rows = buildDistributionRows(metric.key, results.baseline, results.variant, results.alternate);
      if (rows.length) {
        charts.push({ metric, rows });
      }
    });
    return charts;
  }, [results]);

  const exportSnapshot = useMemo(() => {
    if (!results) return null;
    return buildExportSummary(results, includeAlternate && Boolean(results.alternate));
  }, [results, includeAlternate]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
    };
  }, []);

  const baselineId = results?.baseline.id ?? 'v2';

  const handleCopySnapshot = useCallback(async () => {
    if (!exportSnapshot) return;
    try {
      const text = JSON.stringify(exportSnapshot, null, 2);
      await navigator.clipboard.writeText(text);
      setCopyStatus('Copied distribution snapshot to clipboard.');
    } catch (copyError) {
      console.error(copyError);
      setCopyStatus('Unable to copy snapshot. Check browser permissions.');
    } finally {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopyStatus(null);
        copyTimeoutRef.current = null;
      }, 2500);
    }
  }, [exportSnapshot]);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold text-white">Random Distribution Lab</h1>
        <p className="text-sm text-neutral-300">
          Run large batches ({'10k'} / {'100k'} / custom) of random cats using the legacy V2 generator and the new V3
          pipeline. Visualise where the distributions diverge so you can tune the generator before shipping it.
        </p>
      </header>

      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-2">
        <div className="space-y-3">
          <label htmlFor={sampleSizeInputId} className="block text-sm font-medium text-neutral-200">
            Sample size
          </label>
          <div className="flex gap-2">
            <input
              id={sampleSizeInputId}
              type="number"
              min={1000}
              step={1000}
              value={iterationsInput}
              onChange={(event) => setIterationsInput(event.target.value)}
              className="w-36 rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
              disabled={running}
            />
            {[10000, 50000, 100000].map((preset) => (
              <button
                key={preset}
                type="button"
                className="rounded-md border border-slate-700 px-3 py-2 text-sm text-neutral-200 hover:border-emerald-400 hover:text-emerald-300"
                onClick={() => handleQuickSelect(preset)}
                disabled={running}
              >
                {preset / 1000}k
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <fieldset>
            <legend className="text-sm font-medium text-neutral-200">V3 count weighting</legend>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-neutral-200">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="countsMode"
                  value="weighted"
                  checked={countsMode === 'weighted'}
                  onChange={() => setCountsMode('weighted')}
                  disabled={running}
                  className="accent-emerald-500"
                />
                Weighted (rarer multi-layer)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="countsMode"
                  value="uniform"
                  checked={countsMode === 'uniform'}
                  onChange={() => setCountsMode('uniform')}
                  disabled={running}
                  className="accent-emerald-500"
                />
                Uniform (equal odds)
              </label>
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input
              type="checkbox"
              checked={includeAlternate}
              onChange={(event) => setIncludeAlternate(event.target.checked)}
              disabled={running}
              className="accent-emerald-500"
            />
            Also run the opposite weighting for reference
          </label>
        </div>
        <div className="md:col-span-2 flex items-center justify-between">
          <div className="text-xs text-neutral-400">
            Iterations are capped at 200k to keep the browser responsive. Runs yield to the UI between batches so you can
            track progress.
          </div>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {running ? 'Running…' : `Run ${iterations.toLocaleString()} samples`}
          </button>
        </div>
      </section>

      {progress && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-neutral-200">
          <div className="mb-2 flex items-center justify-between">
            <span>{progress.phase}</span>
            <span>
              {progress.completed.toLocaleString()} / {progress.total.toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-800">
            <div
              className="h-2 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(100, (progress.completed / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/60 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {results && (
        <section className="space-y-6">
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-neutral-300">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-400">Iterations</div>
                <div className="text-base text-white">{results.baseline.iterations.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-400">V2 runtime</div>
                <div className="text-base text-white">{results.baseline.durationMs.toFixed(0)} ms</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-400">V3 runtime</div>
                <div className="text-base text-white">{results.variant.durationMs.toFixed(0)} ms</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-neutral-300">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Notable drifts</h2>
              <span className="text-xs uppercase tracking-wide text-neutral-500">Δ ≥ {SIGNIFICANT_THRESHOLD}%</span>
            </div>
            {issueSummary.length === 0 ? (
              <p className="text-sm text-neutral-300">
                No metric deviates from V2 by more than {SIGNIFICANT_THRESHOLD}% in the sampled batch.
              </p>
            ) : (
              <ul className="space-y-2">
                {issueSummary.map((issue) => (
                  <li
                    key={`${issue.metric.key}-${issue.value}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">{issue.metric.label}</div>
                      <div className="text-xs text-neutral-400">{issue.value}</div>
                    </div>
                    <div className="text-right text-xs text-neutral-400">
                      <div className="font-mono text-neutral-100">V3 {formatPercent(issue.variant)}</div>
                      <div className="font-mono">V2 {formatPercent(issue.baseline)}</div>
                    </div>
                    <div className={`font-mono text-xs ${deltaClass(issue.delta)}`}>{formatDelta(issue.delta)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {distributionCharts.length > 0 && (
            <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Distribution charts</h2>
                  <p className="text-xs text-neutral-400">Compare baseline V2 frequencies against the latest V3 samples.</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleCopySnapshot}
                    disabled={!exportSnapshot}
                    className="rounded-full border border-slate-700 px-3 py-1 font-medium text-neutral-100 transition hover:border-emerald-400 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Copy JSON snapshot
                  </button>
                  {copyStatus && <span className="text-emerald-300">{copyStatus}</span>}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {distributionCharts.map((chart) => (
                  <DistributionChart
                    key={chart.metric.key}
                    definition={chart}
                    variantLabel={results.variant.label}
                    alternateLabel={results.alternate?.label ?? null}
                  />
                ))}
              </div>
            </section>
          )}

          <div className="space-y-6">
            {metricSections.high.map((section) => (
              <div key={section.metric.key} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">{section.metric.label}</h2>
                  <span className="text-xs text-neutral-400">
                    Top {section.rows.length} values for {section.metric.label.toLowerCase()}
                  </span>
                </div>
                <div className="space-y-3">
                  {section.rows.map((row) => (
                    <div key={`${section.metric.key}-${row.value}`} className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-white">{row.value}</span>
                        <span className={`font-mono text-xs ${deltaClass(row.variantDelta)}`}>{formatDelta(row.variantDelta)}</span>
                      </div>
                      <div className="mt-2 space-y-2">
                        {row.lines.map((line) => (
                          <div key={line.simId} className="flex items-center gap-3">
                            <span className="w-40 text-xs text-neutral-400">{line.label}</span>
                            <div className="relative h-2 flex-1 rounded-full bg-slate-800/70">
                              <span
                                className="absolute left-0 top-0 h-2 rounded-full"
                                style={{
                                  width: `${Math.max(0, Math.min(100, line.percent)).toFixed(2)}%`,
                                  backgroundColor: SIM_COLORS[line.simId] ?? '#94a3b8',
                                }}
                              />
                            </div>
                            <span className="w-16 text-right font-mono text-xs text-neutral-100">
                              {formatPercent(line.percent)}
                            </span>
                            {line.simId !== baselineId && (
                              <span className={`w-16 text-right font-mono text-xs ${deltaClass(line.deltaFromBaseline)}`}>
                                {formatDelta(line.deltaFromBaseline)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {metricSections.secondary.length > 0 && (
            <SecondaryMetricsPanel
              key={`${results.variant.id}-${countsMode}-${includeAlternate ? 'alt' : 'single'}`}
              sections={metricSections.secondary}
              baselineId={baselineId}
            />
          )}
        </section>
      )}
    </div>
  );
}
