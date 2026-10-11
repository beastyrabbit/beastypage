"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { type KeyboardEvent, useId, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  SHOW_LOOK_IDS,
  SHOW_LOOK_META,
  type ShowLookId,
} from "../../obs/looks/lookMeta";
import { nextThemeOnKey } from "./themePickerKeys";

/**
 * Evolution look radiogroup. Same keyboard model as ThemePicker:
 * only the selected tile is in the tab order; arrows / Home / End move the
 * selection (and focus).
 */
export function ShowLookPicker({
  value,
  onChange,
}: Readonly<{
  value: ShowLookId;
  onChange: (id: ShowLookId) => void;
}>) {
  const tiles = useRef(new Map<ShowLookId, HTMLButtonElement>());

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextThemeOnKey(value, event.key, SHOW_LOOK_IDS);
    if (!next) return;
    event.preventDefault();
    onChange(next);
    tiles.current.get(next)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Evolution look"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {SHOW_LOOK_IDS.map((id) => (
        <ShowLookTile
          key={id}
          id={id}
          selected={id === value}
          onSelect={onChange}
          register={(el) => {
            if (el) tiles.current.set(id, el);
            else tiles.current.delete(id);
          }}
        />
      ))}
    </div>
  );
}

function ShowLookTile({
  id,
  selected,
  onSelect,
  register,
}: Readonly<{
  id: ShowLookId;
  selected: boolean;
  onSelect: (id: ShowLookId) => void;
  register: (el: HTMLButtonElement | null) => void;
}>) {
  const meta = SHOW_LOOK_META[id];
  const blurbId = useId();
  return (
    <motion.button
      ref={register}
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
        "group relative flex flex-col gap-2 rounded-xl border p-3 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-transparent bg-amber-500/[0.06]"
          : "border-border/40 bg-background/40 hover:border-border/80 hover:bg-background/70",
      )}
    >
      {selected ? (
        <motion.span
          layoutId="show-look-ring"
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-xl border-2 border-amber-500 shadow-[0_0_24px_-6px_rgba(245,158,11,0.55)]"
          transition={{ type: "spring", bounce: 0.18, duration: 0.42 }}
        />
      ) : null}
      <div className="flex items-center gap-2">
        <span className="inline-flex shrink-0 items-center" aria-hidden="true">
          {meta.palette.map((colour, i) => (
            <span
              key={`${colour}-${i.toString()}`}
              className={cn(
                "size-3 rounded-full ring-1 ring-white/25",
                i > 0 && "-ml-1",
              )}
              style={{ background: colour }}
            />
          ))}
        </span>
        <span className="text-sm font-semibold">{meta.label}</span>
        {selected ? (
          <Check
            className="ml-auto size-4 shrink-0 text-amber-500"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <p id={blurbId} className="text-xs leading-snug text-muted-foreground">
        {meta.blurb}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] leading-4 text-muted-foreground/80">
        <dt className="font-semibold uppercase tracking-wider text-muted-foreground/60">
          Evo
        </dt>
        <dd>{meta.evolution}</dd>
      </dl>
    </motion.button>
  );
}
