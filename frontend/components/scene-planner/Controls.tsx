"use client";

import { useRef } from "react";

import RefreshIcon from "@/components/ui/refresh-icon";
import {
  SEASONS,
  THEMES,
  type Theme,
  TIMES_OF_DAY,
  WEATHER,
} from "@/lib/scene-planner/catalog";
import { DENSITIES, randomSeed } from "@/lib/scene-planner/generate";
import { cn } from "@/lib/utils";

import { DURATION } from "./motion";
import { usePlanner } from "./usePlanner";

const PRESETS: [number, number][] = [
  [5, 5],
  [8, 8],
  [12, 12],
  [16, 9],
  [9, 16],
  [20, 20],
];

// Placeholder subject: a bust on a transparent background.
const SAMPLE_SUBJECT = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#4c1d95"/></linearGradient></defs><ellipse cx="150" cy="150" rx="70" ry="84" fill="url(#g)"/><path d="M40 400 C40 290 90 245 150 245 C210 245 260 290 260 400 Z" fill="url(#g)"/><rect x="128" y="215" width="44" height="50" fill="url(#g)"/></svg>`,
)}`;

function Field({
  label,
  value,
  children,
}: Readonly<{
  label: string;
  value?: string;
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-foreground/90">{label}</span>
        {value && (
          <span className="font-mono text-muted-foreground">{value}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
  title,
}: Readonly<{
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}>) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        on
          ? "border-primary/70 bg-primary/20 text-foreground"
          : "border-white/10 text-muted-foreground hover:bg-white/10",
      )}
      style={{ transitionDuration: `${DURATION.snap}ms` }}
    >
      {children}
    </button>
  );
}

const selectClass =
  "w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/60";

export function Controls() {
  const planner = usePlanner();
  const {
    settings,
    setSettings,
    atmosphere,
    setAtmosphere,
    overlay,
    setOverlay,
    tool,
    setTool,
    rolling,
  } = planner;
  const fileRef = useRef<HTMLInputElement>(null);

  /** Only the latest pick may land; an older image can finish decoding later. */
  const loading = useRef(0);
  const clearOverlay = () => {
    loading.current++;
    // Let the same file be picked again after removing it.
    if (fileRef.current) fileRef.current.value = "";
    setOverlay(null);
  };

  const loadOverlay = (
    src: string,
    name: string,
    request = ++loading.current,
  ) => {
    const image = new Image();
    image.onload = () => {
      if (request !== loading.current) return;
      setOverlay({
        src,
        name,
        aspect: image.naturalWidth / image.naturalHeight,
        visible: true,
        opacity: 0.85,
        threshold: 0.5,
        coverage: null,
      });
    };
    image.src = src;
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    // The pick counts from now, not from when reading finishes.
    const request = ++loading.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (request !== loading.current) return;
      if (typeof reader.result === "string")
        loadOverlay(reader.result, file.name, request);
    };
    reader.readAsDataURL(file);
  };

  const toggleTheme = (id: Theme) =>
    setSettings((s) => {
      if (!s.themes.includes(id)) return { ...s, themes: [...s.themes, id] };
      const rest = s.themes.filter((t) => t !== id);
      // At least one theme stays on.
      return rest.length > 0 ? { ...s, themes: rest } : s;
    });

  const matchImage = () => {
    // Pending rolls hold cells of the current grid, like the size sliders.
    if (!overlay || rolling) return;
    const rows = Math.round(settings.cols / overlay.aspect);
    if (rows >= 5 && rows <= 20) planner.resizeGrid(settings.cols, rows);
    else {
      const cols = Math.min(
        20,
        Math.max(5, Math.round(settings.rows * overlay.aspect)),
      );
      planner.resizeGrid(cols, settings.rows);
    }
  };

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <section className="flex flex-col gap-4">
        <h3 className="section-eyebrow">Grid</h3>
        <Field label="Columns" value={String(settings.cols)}>
          <input
            type="range"
            min={5}
            max={20}
            value={settings.cols}
            disabled={rolling}
            onChange={(e) =>
              planner.resizeGrid(Number(e.target.value), settings.rows)
            }
            className="accent-[oklch(0.77_0.12_300)]"
          />
        </Field>
        <Field label="Rows" value={String(settings.rows)}>
          <input
            type="range"
            min={5}
            max={20}
            value={settings.rows}
            disabled={rolling}
            onChange={(e) =>
              planner.resizeGrid(settings.cols, Number(e.target.value))
            }
            className="accent-[oklch(0.77_0.12_300)]"
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(([c, r]) => (
            <Chip
              key={`${c}x${r}`}
              on={settings.cols === c && settings.rows === r}
              onClick={() => !rolling && planner.resizeGrid(c, r)}
            >
              {c}×{r}
            </Chip>
          ))}
        </div>
        <Field
          label="Horizon"
          value={`${Math.round(settings.skyShare * 100)}% sky`}
        >
          <input
            type="range"
            min={0.15}
            max={0.5}
            step={0.05}
            value={settings.skyShare}
            onChange={(e) =>
              setSettings((s) => ({ ...s, skyShare: Number(e.target.value) }))
            }
            className="accent-[oklch(0.77_0.12_300)]"
          />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="section-eyebrow">Content</h3>
        <Field label="Themes">
          <div className="flex flex-wrap gap-1.5">
            {THEMES.map((theme) => {
              const on = settings.themes.includes(theme.id);
              return (
                <Chip
                  key={theme.id}
                  on={on}
                  onClick={() => toggleTheme(theme.id)}
                >
                  {theme.icon} {theme.label}
                </Chip>
              );
            })}
          </div>
        </Field>
        <Field label="Density">
          <div className="flex gap-1.5">
            {DENSITIES.map((d) => (
              <Chip
                key={d.id}
                on={settings.density === d.value}
                onClick={() => setSettings((s) => ({ ...s, density: d.value }))}
              >
                {d.label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Seed">
          <div className="flex gap-1.5">
            <input
              value={settings.seed}
              onChange={(e) =>
                setSettings((s) => ({ ...s, seed: e.target.value || "seed" }))
              }
              className={cn(selectClass, "font-mono")}
              aria-label="Seed"
            />
            <button
              type="button"
              title="New seed"
              onClick={() => setSettings((s) => ({ ...s, seed: randomSeed() }))}
              className="rounded-lg border border-white/10 px-2 hover:bg-white/10"
            >
              <RefreshIcon size={14} />
            </button>
          </div>
        </Field>
        <button
          type="button"
          disabled={rolling}
          onClick={() => planner.rollScene()}
          className="rounded-full border border-primary/50 bg-primary/15 px-4 py-2 text-xs font-bold hover:bg-primary/25 disabled:opacity-50"
        >
          Roll whole scene from seed
        </button>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="section-eyebrow">Atmosphere</h3>
          <button
            type="button"
            onClick={planner.rollAtmosphere}
            className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs hover:bg-white/10"
          >
            <RefreshIcon size={12} /> Roll
          </button>
        </div>
        <Field label="Time of day">
          <select
            className={selectClass}
            value={atmosphere.time}
            onChange={(e) =>
              setAtmosphere({
                ...atmosphere,
                time: e.target.value as typeof atmosphere.time,
              })
            }
          >
            {TIMES_OF_DAY.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Season">
          <select
            className={selectClass}
            value={atmosphere.season}
            onChange={(e) =>
              setAtmosphere({
                ...atmosphere,
                season: e.target.value as typeof atmosphere.season,
              })
            }
          >
            {SEASONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Weather">
          <select
            className={selectClass}
            value={atmosphere.weather}
            onChange={(e) =>
              setAtmosphere({
                ...atmosphere,
                weather: e.target.value as typeof atmosphere.weather,
              })
            }
          >
            {WEATHER.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="section-eyebrow">Foreground</h3>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip on={false} onClick={() => fileRef.current?.click()}>
            Upload PNG
          </Chip>
          <Chip
            on={overlay?.name === "Sample subject"}
            onClick={() => loadOverlay(SAMPLE_SUBJECT, "Sample subject")}
          >
            Sample subject
          </Chip>
          {overlay && (
            <Chip on={false} onClick={clearOverlay}>
              Remove
            </Chip>
          )}
        </div>
        {overlay ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                on={overlay.visible}
                onClick={() =>
                  setOverlay({ ...overlay, visible: !overlay.visible })
                }
              >
                {overlay.visible ? "Shown" : "Hidden"}
              </Chip>
              <Chip
                on={false}
                onClick={matchImage}
                title="Fit the grid to the image's shape"
              >
                Match grid to image
              </Chip>
            </div>
            <Field
              label="Opacity"
              value={`${Math.round(overlay.opacity * 100)}%`}
            >
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={overlay.opacity}
                onChange={(e) =>
                  setOverlay({ ...overlay, opacity: Number(e.target.value) })
                }
                className="accent-[oklch(0.77_0.12_300)]"
              />
            </Field>
            {overlay.coverage ? (
              <Field
                label="Ignore cells covered by"
                value={`${Math.round(overlay.threshold * 100)}%`}
              >
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={overlay.threshold}
                  onChange={(e) =>
                    setOverlay({
                      ...overlay,
                      threshold: Number(e.target.value),
                    })
                  }
                  className="accent-[oklch(0.77_0.12_300)]"
                />
              </Field>
            ) : (
              <p className="text-xs text-muted-foreground">
                The image has no transparent background, so no cells are ignored
                automatically. Paint them by hand.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Optional: lay your character over the grid. Cells it covers are
            ignored and never rolled for.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Chip
            on={tool.kind === "paint"}
            onClick={() =>
              setTool(
                tool.kind === "paint" ? { kind: "inspect" } : { kind: "paint" },
              )
            }
          >
            Paint ignored cells
          </Chip>
          {planner.painted.size > 0 && (
            <Chip on={false} onClick={() => planner.setPainted(new Map())}>
              Reset painting
            </Chip>
          )}
        </div>
      </section>
    </div>
  );
}
