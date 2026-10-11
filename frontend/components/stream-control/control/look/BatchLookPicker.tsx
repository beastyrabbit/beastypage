"use client";

import { Check } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  BATCH_THEME_IDS,
  BATCH_THEME_META,
  type BatchThemeId,
  DEFAULT_BATCH_THEME,
} from "../../obs/themes/batchThemeMeta";
import { nextThemeOnKey } from "./themePickerKeys";

/** Five swatches as overlapping dots — the look's colour at a glance. */
function BatchPaletteDots({ id }: Readonly<{ id: BatchThemeId }>) {
  return (
    <span className="inline-flex shrink-0 items-center" aria-hidden="true">
      {BATCH_THEME_META[id].palette.map((colour, i) => (
        <span
          key={`${colour}-${i.toString()}`}
          className={cn(
            "size-2.5 rounded-full ring-1 ring-white/25",
            i > 0 && "-ml-[3px]",
          )}
          style={{ background: colour }}
        />
      ))}
    </span>
  );
}

/**
 * Batch show look radiogroup, compact tiles (no thumbnail — the looks are
 * full scenes; the overlay preview shows the real thing). Same keyboard
 * contract as the overlay ThemePicker.
 */
export function BatchLookPicker({
  value,
  onChange,
}: Readonly<{
  value: BatchThemeId;
  onChange: (id: BatchThemeId) => void;
}>) {
  const tiles = useRef(new Map<BatchThemeId, HTMLButtonElement>());

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextThemeOnKey(value, event.key, BATCH_THEME_IDS);
    if (!next) return;
    event.preventDefault();
    onChange(next);
    tiles.current.get(next)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Batch show look"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {BATCH_THEME_IDS.map((id) => {
        const meta = BATCH_THEME_META[id];
        const selected = id === value;
        return (
          <button
            key={id}
            ref={(el) => {
              if (el) tiles.current.set(id, el);
              else tiles.current.delete(id);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={meta.label}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            className={cn(
              "relative flex flex-col gap-1 rounded-xl border p-3 text-left outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-amber-500 bg-amber-500/[0.06] shadow-[0_0_24px_-6px_rgba(245,158,11,0.55)]"
                : "border-border/40 bg-background/40 hover:border-border/80 hover:bg-background/70",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "text-sm font-semibold",
                  selected ? "text-amber-300" : "text-foreground",
                )}
              >
                {meta.label}
                {id === DEFAULT_BATCH_THEME ? (
                  <span className="ml-2 rounded-full border border-border/60 px-1.5 py-px text-[10px] font-semibold leading-4 text-muted-foreground">
                    Default
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <BatchPaletteDots id={id} />
                {selected ? (
                  <span className="grid size-5 place-items-center rounded-full bg-amber-500 text-black shadow-md">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
            </span>
            <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
              {meta.blurb}
            </span>
          </button>
        );
      })}
    </div>
  );
}
