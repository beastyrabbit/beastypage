"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CollectionEntry } from "@/convex/collection";
import ProgressiveImage from "@/components/common/ProgressiveImage";
import { CONVEX_HTTP_URL } from "@/lib/convexClient";

export default function CollectionFocusTestingPage() {
  const entries = useQuery(api.collection.list, {});
  const setFocus = useMutation(api.collection.setFocus);
  const [drafts, setDrafts] = useState<Record<string, { focusX: number; focusY: number }>>({});
  const [status, setStatus] = useState<string | null>(null);

  const sortedEntries = useMemo(() => {
    if (!entries) return [] as CollectionEntry[];
    return [...entries].sort((a, b) => a.artist_name.localeCompare(b.artist_name));
  }, [entries]);

  const getDraft = useCallback(
    (entry: CollectionEntry) =>
      drafts[entry.id] ?? {
        focusX: clamp(entry.focusX),
        focusY: clamp(entry.focusY)
      },
    [drafts]
  );

  const handleFocusChange = useCallback(
    (entry: CollectionEntry, axis: "focusX" | "focusY", value: number) => {
      setDrafts((prev) => {
        const existing = prev[entry.id] ?? {
          focusX: clamp(entry.focusX),
          focusY: clamp(entry.focusY)
        };
        const next = {
          focusX: axis === "focusX" ? clamp(value) : existing.focusX,
          focusY: axis === "focusY" ? clamp(value) : existing.focusY
        };
        return { ...prev, [entry.id]: next };
      });
    },
    []
  );

  const commitFocus = useCallback(
    async (entry: CollectionEntry, override?: { focusX: number; focusY: number }) => {
      const draft = override ?? getDraft(entry);
      try {
        await setFocus({ id: entry.id as Id<"collection">, focusX: draft.focusX, focusY: draft.focusY });
        setStatus(`Saved focus for ${entry.artist_name}.`);
        setTimeout(() => setStatus(null), 2500);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save focus.";
        setStatus(message);
      }
    },
    [getDraft, setFocus]
  );

  if (!entries) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-12 text-sm text-muted-foreground">
        Loading collection focus editor…
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <div className="section-eyebrow">Testing</div>
        <h1 className="text-3xl font-semibold text-foreground">Collection Focus Editor</h1>
        <p className="text-sm text-muted-foreground">
          Adjust the vertical and horizontal focus for each artwork preview. Values are percentages where 0% = top/left and 100% = bottom/right.
        </p>
        {status && <span className="text-xs text-primary">{status}</span>}
      </header>

      <section className="grid gap-6">
        {sortedEntries.map((entry) => {
          const draft = getDraft(entry);
          const preview = absoluteUrl(entry.preview_img) ?? absoluteUrl(entry.full_img);
          const blur = absoluteUrl(entry.blur_img) ?? preview;
          const focusStyle = { objectPosition: `${draft.focusX}% ${draft.focusY}%` } as const;

          const commit = () => void commitFocus(entry, getDraft(entry));

          return (
            <article key={entry.id} className="rounded-2xl border border-border bg-background/70 p-6 shadow-sm">
              <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                  {preview ? (
                    <ProgressiveImage
                      lowSrc={blur}
                      highSrc={preview}
                      alt={entry.animal ?? "Artwork"}
                      imgStyle={focusStyle}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No preview image available.
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                    {entry.artist_name} · {formatAnimal(entry.animal)}
                  </span>
                </div>
                <div className="flex flex-col gap-4 text-sm">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{entry.artist_name}</h2>
                    <p className="text-xs text-muted-foreground">{entry.link}</p>
                  </div>
                  <div className="grid gap-3">
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Horizontal ({draft.focusX}%)</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={draft.focusX}
                        onChange={(event) => handleFocusChange(entry, "focusX", Number(event.target.value))}
                        onMouseUp={commit}
                        onTouchEnd={commit}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vertical ({draft.focusY}%)</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={draft.focusY}
                        onChange={(event) => handleFocusChange(entry, "focusY", Number(event.target.value))}
                        onMouseUp={commit}
                        onTouchEnd={commit}
                      />
                    </label>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      className="rounded-full border border-border px-3 py-1 transition hover:border-primary/60 hover:text-primary"
                      onClick={() => {
                        const next = { focusX: 50, focusY: 50 };
                        setDrafts((prev) => ({ ...prev, [entry.id]: next }));
                        void commitFocus(entry, next);
                      }}
                    >
                      Reset to center
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-primary/50 bg-primary/15 px-3 py-1 font-medium text-primary transition hover:bg-primary/20"
                      onClick={commit}
                    >
                      Save focus
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function absoluteUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = CONVEX_HTTP_URL.replace(/\/$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

function formatAnimal(animal?: string | null): string {
  if (!animal) return "Unknown";
  return animal
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function clamp(value?: number | null): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 50;
  }
  return Math.min(100, Math.max(0, value));
}
