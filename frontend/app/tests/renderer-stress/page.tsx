"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { renderCatV3 } from "@/lib/cat-v3/api";
import type { CatRenderParams } from "@/lib/cat-v3/types";

type RunEntry = {
  id: number;
  key: string;
  sprite: number;
  colour: string;
  startedAt: number;
  durationMs: number;
  ok: boolean;
  error?: string;
};

type RunMetrics = {
  total: number;
  success: number;
  failure: number;
  startedAt: number;
  finishedAt: number | null;
  averageMs: number | null;
  p95Ms: number | null;
};

type HealthSnapshot =
  | {
      ok: true;
      status: string;
      metrics: Record<string, unknown>;
      fetchedAt: string;
    }
  | {
      ok: false;
      error: string;
      fetchedAt: string;
    };

const BASE_COLOURS = [
  "WHITE",
  "PALEGREY",
  "SILVER",
  "GREY",
  "DARKGREY",
  "BLACK",
  "CREAM",
  "PALEGINGER",
  "GOLDEN",
  "GINGER",
  "DARKGINGER",
  "SIENNA",
  "LIGHTBROWN",
  "BROWN",
  "CHOCOLATE",
  "LILAC",
  "PALEGREY",
  "PALEGINGER",
] as const;

const EXPERIMENTAL_COLOURS = [
  "CHARTREUSE",
  "CERULEAN",
  "ELECTRICBLUE",
  "FUCHSIA",
  "NEONPURPLE",
  "MINT",
  "SUNSETORANGE",
  "TURQUOISE",
  "SCARLET",
  "NEBULA_INDIGO",
  "UMBRAL_VIOLET",
] as const;

const PELTS = [
  "SingleColour",
  "Tabby",
  "Marbled",
  "Rosette",
  "Smoke",
  "Ticked",
  "Speckled",
] as const;

const SPRITES = Array.from({ length: 21 }, (_, index) => index);

const formatter = Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const DEFAULT_TOTAL = 60;
const DEFAULT_CONCURRENCY = 6;

export default function RendererStressHarness() {
  const [totalRequests, setTotalRequests] = useState(DEFAULT_TOTAL);
  const [concurrency, setConcurrency] = useState(DEFAULT_CONCURRENCY);
  const [entries, setEntries] = useState<RunEntry[]>([]);
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [running, setRunning] = useState(false);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const runTokenRef = useRef<string | null>(null);
  const cancelRef = useRef<{ cancel(): void } | null>(null);

  const summary = useMemo(() => {
    if (!metrics) return null;
    const duration = metrics.finishedAt && metrics.startedAt ? metrics.finishedAt - metrics.startedAt : null;
    return {
      ...metrics,
      duration,
    };
  }, [metrics]);

  const refreshHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/renderer/health", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }
      const data = await response.json();
      setHealth({
        ok: true,
        status: data.status ?? "unknown",
        metrics: data.metrics ?? data,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      setHealth({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        fetchedAt: new Date().toISOString(),
      });
    }
  }, []);

  const stopRun = useCallback(() => {
    cancelRef.current?.cancel();
  }, []);

  const startRun = useCallback(async () => {
    if (running) {
      stopRun();
      return;
    }

    const total = Math.max(1, Math.min(500, totalRequests));
    const workers = Math.max(1, Math.min(32, concurrency));

    const runStarted = performance.now();
    const runToken = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    runTokenRef.current = runToken;
    setEntries([]);
    setMetrics({
      total,
      success: 0,
      failure: 0,
      startedAt: runStarted,
      finishedAt: null,
      averageMs: null,
      p95Ms: null,
    });
    setRunning(true);

    let nextIndex = 0;
    let success = 0;
    let failure = 0;
    const durations: number[] = [];
    const runEntries: RunEntry[] = [];
    let cancelled = false;

    cancelRef.current = {
      cancel() {
        cancelled = true;
      },
    };

    const pick = <T,>(source: readonly T[]): T => source[Math.floor(Math.random() * source.length)];

    const buildPayload = (id: number): CatRenderParams => {
      const useExperimental = Math.random() > 0.5;
      const colour = useExperimental ? pick(EXPERIMENTAL_COLOURS) : pick(BASE_COLOURS);
      return {
        spriteNumber: pick(SPRITES),
        params: {
          peltName: pick(PELTS),
          colour,
          isTortie: false,
          shading: Math.random() > 0.5,
          reverse: Math.random() > 0.5,
          accessories: [],
          scars: [],
          eyeColour: "YELLOW",
          skinColour: "PINK",
        },
      };
    };

    const worker = async (workerId: number) => {
      while (!cancelled) {
        const current = nextIndex;
        if (current >= total) break;
        nextIndex += 1;

        const payload = buildPayload(current);
        const startedAt = performance.now();
        try {
          await renderCatV3(payload);
          const durationMs = performance.now() - startedAt;
          durations.push(durationMs);
          success += 1;
          runEntries.push({
            id: current,
            key: `${runToken}-${current}`,
            sprite: payload.spriteNumber,
            colour: payload.params.colour as string,
            startedAt,
            durationMs,
            ok: true,
          });
          if (runEntries.length % 5 === 0 || current === total - 1) {
            setEntries((prev) => {
              const combined = [...prev, ...runEntries];
              return combined.slice(-80); // keep recent entries manageable
            });
            runEntries.length = 0;
          }
        } catch (error) {
          const durationMs = performance.now() - startedAt;
          failure += 1;
          runEntries.push({
            id: current,
            key: `${runToken}-${current}`,
            sprite: payload.spriteNumber,
            colour: payload.params.colour as string,
            startedAt,
            durationMs,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
          setEntries((prev) => {
            const combined = [...prev, ...runEntries];
            runEntries.length = 0;
            return combined.slice(-80);
          });
        }
        if (cancelled) break;
      }
    };

    await Promise.all(Array.from({ length: workers }, (_, idx) => worker(idx)));

    const finishedAt = performance.now();
    const orderedDurations = durations.slice().sort((a, b) => a - b);
    const avg = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null;
    const p95 =
      orderedDurations.length > 0
        ? orderedDurations[Math.min(orderedDurations.length - 1, Math.floor(orderedDurations.length * 0.95))]
        : null;

    setMetrics({
      total,
      success,
      failure,
      startedAt: runStarted,
      finishedAt,
      averageMs: avg,
      p95Ms: p95,
    });

    setRunning(false);
    cancelRef.current = null;
    void refreshHealth();
  }, [concurrency, refreshHealth, running, stopRun, totalRequests]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16">
      <header className="theme-hero px-8 py-12 text-balance">
        <div className="section-eyebrow">Renderer Reliability</div>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Stress Test Runner</h1>
        <p className="mt-6 max-w-3xl text-lg text-muted-foreground">
          Launch controlled bursts against <code>/api/renderer</code>, exercise the retry helper, and watch the queue /
          circuit breaker metrics update in real time.
        </p>
      </header>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
        <div className="glass-card rounded-3xl border border-border/50 bg-background/70 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-foreground">Run configuration</h2>
            <button
              type="button"
              onClick={running ? stopRun : startRun}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                running
                  ? "border border-red-500/50 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                  : "border border-emerald-500/50 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
              }`}
            >
              {running ? "Stop run" : "Start run"}
            </button>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold text-muted-foreground/80">Total requests</span>
              <input
                type="number"
                min={1}
                max={500}
                value={totalRequests}
                onChange={(event) => setTotalRequests(parseInt(event.target.value, 10) || DEFAULT_TOTAL)}
                className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-foreground focus:border-primary focus:outline-none"
              />
              <span className="text-xs text-muted-foreground/70">Caps at 500 to protect local browsers.</span>
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold text-muted-foreground/80">Concurrent workers</span>
              <input
                type="number"
                min={1}
                max={32}
                value={concurrency}
                onChange={(event) => setConcurrency(parseInt(event.target.value, 10) || DEFAULT_CONCURRENCY)}
                className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-foreground focus:border-primary focus:outline-none"
              />
              <span className="text-xs text-muted-foreground/70">
                Each worker runs one request at a time. Increase to simulate spikes.
              </span>
            </label>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={refreshHealth}
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-foreground hover:text-background"
            >
              Refresh renderer health
            </button>
          </div>
        </div>

        <aside className="glass-card flex flex-col gap-4 rounded-3xl border border-border/50 bg-background/70 p-6 text-sm text-muted-foreground">
          <h2 className="text-lg font-semibold text-foreground">Summary</h2>
          {summary ? (
            <dl className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
              <dt className="text-muted-foreground/70">Total</dt>
              <dd className="text-foreground">{summary.total}</dd>
              <dt className="text-muted-foreground/70">Succeeded</dt>
              <dd className="text-emerald-400 font-semibold">{summary.success}</dd>
              <dt className="text-muted-foreground/70">Failed</dt>
              <dd className="text-red-400 font-semibold">{summary.failure}</dd>
              <dt className="text-muted-foreground/70">Avg latency</dt>
              <dd className="text-foreground">
                {summary.averageMs !== null ? `${formatter.format(summary.averageMs)} ms` : "—"}
              </dd>
              <dt className="text-muted-foreground/70">p95 latency</dt>
              <dd className="text-foreground">
                {summary.p95Ms !== null ? `${formatter.format(summary.p95Ms)} ms` : "—"}
              </dd>
              <dt className="text-muted-foreground/70">Run time</dt>
              <dd className="text-foreground">
                {summary.duration !== null ? `${formatter.format(summary.duration)} ms` : "—"}
              </dd>
            </dl>
          ) : (
            <p>No runs yet. Configure the burst and hit start to capture metrics.</p>
          )}

          <div className="mt-4 border-t border-border/40 pt-4 text-xs text-muted-foreground/70">
            {health ? (
              health.ok ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Renderer health</span>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                        health.status === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {health.status}
                    </span>
                  </div>
                  <ul className="space-y-1 text-xs">
                    {Object.entries(health.metrics).map(([key, value]) => (
                      <li key={key} className="flex justify-between gap-4">
                        <span>{key}</span>
                        <span className="font-mono text-muted-foreground/80">
                          {typeof value === "number" ? formatter.format(value) : String(value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                    Last updated {new Date(health.fetchedAt).toLocaleTimeString()}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-red-300">Health check failed</p>
                  <p className="mt-1 text-xs">{health.error}</p>
                </div>
              )
            ) : (
              <p>Use “Refresh renderer health” after a run to inspect queue metrics.</p>
            )}
          </div>
        </aside>
      </section>

      <section className="glass-card overflow-hidden rounded-3xl border border-border/50 bg-background/70">
        <header className="flex items-center justify-between border-b border-border/40 px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Recent requests</h2>
          <span className="text-xs text-muted-foreground/60">Showing latest {entries.length} records</span>
        </header>
        <div className="max-h-[420px] overflow-auto text-sm">
          <table className="w-full table-fixed border-collapse text-xs sm:text-sm">
            <thead className="sticky top-0 bg-background/90 backdrop-blur">
              <tr className="text-left text-muted-foreground/70">
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">Sprite</th>
                <th className="px-4 py-3 font-semibold">Colour</th>
                <th className="px-4 py-3 font-semibold">Duration</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Error</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground/60">
                    No data yet. Start a run to populate telemetry.
                  </td>
                </tr>
              ) : (
                [...entries].reverse().map((entry) => (
                  <tr key={entry.key} className="border-t border-border/20">
                    <td className="px-4 py-2 font-mono text-muted-foreground/80">{entry.id}</td>
                    <td className="px-4 py-2 text-foreground">{entry.sprite}</td>
                    <td className="px-4 py-2 font-semibold text-muted-foreground/90">{entry.colour}</td>
                    <td className="px-4 py-2 text-foreground">{formatter.format(entry.durationMs)} ms</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                          entry.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
                        }`}
                      >
                        {entry.ok ? "Success" : "Error"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-red-300">
                      {!entry.ok && entry.error ? entry.error.slice(0, 120) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
