"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { type Ref, useId } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_OVERLAY_THEME,
  OVERLAY_THEME_META,
  type OverlayThemeId,
} from "../../obs/themes/themeMeta";
import { ThemeThumb } from "./ThemeThumb";

/** The theme's five swatches as overlapping dots. */
export function PaletteDots({
  theme,
  className,
}: Readonly<{ theme: OverlayThemeId; className?: string }>) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center", className)}
      aria-hidden="true"
    >
      {OVERLAY_THEME_META[theme].palette.map((colour, i) => (
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

const CHIP =
  "rounded-full border px-1.5 py-px text-[10px] font-semibold leading-4";

export function ThemeTile({
  id,
  selected,
  onSelect,
  ref,
}: Readonly<{
  id: OverlayThemeId;
  selected: boolean;
  onSelect: (id: OverlayThemeId) => void;
  ref?: Ref<HTMLButtonElement>;
}>) {
  const meta = OVERLAY_THEME_META[id];
  const blurbId = useId();
  return (
    <motion.button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={meta.label}
      aria-describedby={blurbId}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(id)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className={cn(
        "group relative flex flex-col gap-2.5 rounded-xl border p-2 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-transparent bg-amber-500/[0.06]"
          : "border-border/40 bg-background/40 hover:border-border/80 hover:bg-background/70",
      )}
    >
      {selected ? (
        <motion.span
          layoutId="theme-ring"
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-xl border-2 border-amber-500 shadow-[0_0_24px_-6px_rgba(245,158,11,0.55)]"
          transition={{ type: "spring", bounce: 0.18, duration: 0.42 }}
        />
      ) : null}
      <span className="relative block overflow-hidden rounded-lg ring-1 ring-white/5">
        <ThemeThumb
          theme={id}
          className={cn(
            "transition duration-300",
            !selected && "opacity-90 group-hover:opacity-100",
          )}
        />
        {selected ? (
          <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-amber-500 text-black shadow-md animate-in zoom-in-50 fade-in duration-200">
            <Check className="size-3" strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className="flex flex-col gap-1 px-1 pb-1">
        <span className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-sm font-semibold transition-colors",
              selected ? "text-amber-300" : "text-foreground",
            )}
          >
            {meta.label}
          </span>
          <PaletteDots theme={id} />
        </span>
        <span
          id={blurbId}
          className="line-clamp-2 text-xs leading-snug text-muted-foreground"
        >
          {meta.blurb}
        </span>
        {id === DEFAULT_OVERLAY_THEME || meta.supportsSpread ? (
          <span className="mt-0.5 flex flex-wrap gap-1">
            {id === DEFAULT_OVERLAY_THEME ? (
              <span
                className={cn(CHIP, "border-border/60 text-muted-foreground")}
              >
                Default
              </span>
            ) : null}
            {meta.supportsSpread ? (
              <span
                className={cn(CHIP, "border-amber-500/40 text-amber-400/90")}
              >
                Spread-capable
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </motion.button>
  );
}
