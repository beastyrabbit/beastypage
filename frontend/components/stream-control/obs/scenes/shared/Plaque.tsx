"use client";

import {
  type CSSProperties,
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  capPlaqueTally,
  formatPlaqueTallyEntry,
  type LookChrome,
  type PlaqueModel,
  type Rect,
} from "./plaqueModel";
import { measureRectIn } from "./useElementRects";

export interface PlaqueProps {
  model: PlaqueModel;
  mode: LookChrome["plaque"];
  /** Root element of the show wrapper; in "slot" mode the plaque portals into `[data-plaque-slot]` found inside it. */
  container: HTMLElement | null;
  /** Re-run the slot lookup when either changes (wrapper passes the look id and the beat/step kind). */
  slotKey: string;
  beatKey: string;
  /** "free" mode position on the 1280×1080 canvas. Default { left: 32, bottom: 28 }. */
  freePosition?: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
  /** Replays the title entrance. Batch: beat.stageId. Evolution: `${activeKey}:${roll.index}` (NOT the beat kind — one slide-in per stage/roll, not six). */
  entranceKey: string;
  /** Plaque's own rect in container space (leader lines start here); null when not rendered. */
  onAnchorRect?: (rect: Rect | null) => void;
  /** Slow breathe (opacity .92↔1, 4.8 s) — batch passes beat.kind === "awaiting". */
  breathing?: boolean;
  style?: CSSProperties;
  className?: string;
}

export interface CountdownNumeralProps {
  /** "3" | "2" | "1"; null unmounts (with a 240 ms fade). */
  text: string | null;
  /** Centre on the 1280×1080 canvas (the marked cat's rect centre). */
  at: { x: number; y: number } | null;
  /** Default 220 px. */
  size?: number;
  /** Ink colour; default `var(--obs-plaque-ink)`. Wrappers pass the slot's value (see `readPlaqueVars`) since the numeral mounts outside the slot. */
  ink?: string;
  /** Text shadow; default `var(--obs-plaque-shadow)`. Looks on light material set it to "none". */
  shadow?: string;
}

/** The slot's plaque vars; `undefined` where the look leaves the default (or `root` is null). */
export interface PlaqueVars {
  ink?: string;
  shadow?: string;
  accent?: string;
}

/** CSS custom properties a look may override on `[data-plaque-slot]` or any ancestor. */
export const PLAQUE_CSS_VARS = {
  "--obs-plaque-ink": "#f4efe3",
  "--obs-plaque-muted": "rgba(244,239,227,.72)",
  "--obs-plaque-accent": "var(--obs-accent, #f2d27a)",
  /** "free" mode legibility; looks with light material set it to none and a dark ink. */
  "--obs-plaque-shadow": "0 1px 2px rgba(0,0,0,.6), 0 0 18px rgba(0,0,0,.35)",
  "--obs-plaque-font-serif":
    "var(--font-look-display, 'Cormorant Garamond'), Georgia, serif",
  "--obs-plaque-font-sans":
    "var(--obs-font-sans, 'Helvetica Neue', Inter, sans-serif)",
  "--obs-plaque-font-mono":
    "var(--obs-font-mono, 'IBM Plex Mono', ui-monospace, monospace)",
  "--obs-plaque-title-size": "44px",
} as const;

type PlaqueVar = keyof typeof PLAQUE_CSS_VARS;

/** `var(--obs-plaque-x, <default>)` so the plaque reads without any look setting the vars. */
function v(name: PlaqueVar): string {
  return `var(${name}, ${PLAQUE_CSS_VARS[name]})`;
}

const INK = v("--obs-plaque-ink");
const MUTED = v("--obs-plaque-muted");
const ACCENT = v("--obs-plaque-accent");
const SHADOW = v("--obs-plaque-shadow");
const SERIF = v("--obs-plaque-font-serif");
const SANS = v("--obs-plaque-font-sans");
const MONO = v("--obs-plaque-font-mono");
const TITLE_SIZE = v("--obs-plaque-title-size");

/**
 * Reads ink / shadow / accent off the look's `[data-plaque-slot]` inside
 * `root` (or `root` itself when there is no slot). The numeral and leader
 * lines mount at canvas level, outside the slot, so the vars a look sets
 * there never reach them by inheritance; the wrappers read them here and
 * hand them to `CountdownNumeral` / `LeaderLines`.
 */
export function readPlaqueVars(root: HTMLElement | null): PlaqueVars {
  if (!root) return { ink: undefined, shadow: undefined, accent: undefined };
  const slot = root.querySelector<HTMLElement>("[data-plaque-slot]") ?? root;
  const style = getComputedStyle(slot);
  const read = (name: PlaqueVar) =>
    style.getPropertyValue(name).trim() || undefined;
  return {
    ink: read("--obs-plaque-ink"),
    shadow: read("--obs-plaque-shadow"),
    accent: read("--obs-plaque-accent"),
  };
}

/** `obs-plaque-pop` is `countdown-pop` from LobbyCountdownScene.tsx, verbatim. */
const PLAQUE_KEYFRAMES = `
@keyframes obs-plaque-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes obs-plaque-pop { 0% { transform: scale(1.4); opacity: 0.3; } 30% { transform: scale(0.95); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes obs-plaque-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.92; } }
`;

/** Title size by text length: ≤12 chars 48 px, ≤18 chars 44 px, else 40 px (relative to the 44 px var). */
function titleFontSize(title: string): string {
  const length = title.trim().length;
  if (length <= 12) return `calc(${TITLE_SIZE} * ${(48 / 44).toFixed(4)})`;
  if (length <= 18) return TITLE_SIZE;
  return `calc(${TITLE_SIZE} * ${(40 / 44).toFixed(4)})`;
}

const DEFAULT_FREE_POSITION = { left: 32, bottom: 28 } as const;

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/**
 * The show plaque: title / status / tally ink with no plate, border or
 * backing in any mode. "slot" portals into the look's `[data-plaque-slot]`
 * (its material is the backing); "free" is ink with a shadow at
 * `freePosition`; "none" renders nothing.
 */
export function Plaque({
  model,
  mode,
  container,
  slotKey,
  beatKey,
  freePosition,
  entranceKey,
  onAnchorRect,
  breathing = false,
  style,
  className,
}: Readonly<PlaqueProps>): ReactElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onAnchorRectRef = useRef(onAnchorRect);
  onAnchorRectRef.current = onAnchorRect;
  const lastRectRef = useRef<Rect | null>(null);

  // Slot lookup: the look may mount the slot late or move it per beat.
  // biome-ignore lint/correctness/useExhaustiveDependencies: slotKey/beatKey are the re-lookup triggers
  useLayoutEffect(() => {
    if (mode !== "slot") {
      setSlot(null);
      return;
    }
    const found = container?.querySelector<HTMLElement>("[data-plaque-slot]");
    setSlot(found ?? null);
  }, [container, mode, slotKey, beatKey]);

  const rendered = mode === "free" || (mode === "slot" && slot !== null);

  // Anchor rect: ResizeObserver on the plaque root, container-relative and scale-corrected.
  // biome-ignore lint/correctness/useExhaustiveDependencies: slot/beatKey/model.title re-measure after a re-portal or a title change
  useLayoutEffect(() => {
    const report = (rect: Rect | null) => {
      if (sameRect(lastRectRef.current, rect)) return;
      lastRectRef.current = rect;
      onAnchorRectRef.current?.(rect);
    };
    const root = rootRef.current;
    if (!rendered || !root || !container) {
      report(null);
      return;
    }
    const measure = () => report(measureRectIn(container, root));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(container);
    return () => observer.disconnect();
  }, [rendered, container, slot, beatKey, model.title]);

  // Report null once the plaque is gone for good.
  useEffect(() => {
    return () => {
      if (lastRectRef.current === null) return;
      lastRectRef.current = null;
      onAnchorRectRef.current?.(null);
    };
  }, []);

  if (!rendered) return null;

  const free = mode === "free";
  const position = free ? (freePosition ?? DEFAULT_FREE_POSITION) : null;
  const rootStyle: CSSProperties = {
    position: free ? "absolute" : "relative",
    ...(position ?? {}),
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 4,
    width: free ? undefined : "100%",
    height: free ? undefined : "100%",
    maxWidth: free ? 560 : undefined,
    boxSizing: "border-box",
    color: INK,
    textShadow: free ? SHADOW : undefined,
    pointerEvents: "none",
    animation: breathing
      ? "obs-plaque-breathe 4.8s ease-in-out infinite"
      : undefined,
    ...style,
  };
  const inkStroke: CSSProperties = free
    ? { paintOrder: "stroke", WebkitTextStroke: `0.5px ${MUTED}` }
    : {};
  const tally = capPlaqueTally(model.tally);

  const content = (
    <div
      ref={rootRef}
      data-plaque=""
      data-plaque-mode={mode}
      className={className}
      style={rootStyle}
    >
      <style>{PLAQUE_KEYFRAMES}</style>
      <div
        key={entranceKey}
        data-plaque-title=""
        style={{
          fontFamily: SERIF,
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: titleFontSize(model.title),
          lineHeight: 1.05,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          animation: "obs-plaque-in 320ms ease-out both",
          ...inkStroke,
        }}
      >
        {model.title}
      </div>
      {model.status ? (
        <div
          data-plaque-status=""
          style={{
            fontFamily: SANS,
            fontWeight: 300,
            fontSize: 26,
            lineHeight: 1.2,
            color: MUTED,
            ...inkStroke,
          }}
        >
          {model.status}
        </div>
      ) : null}
      {model.tally.length > 0 ? (
        <div
          data-plaque-tally=""
          style={{
            fontFamily: MONO,
            fontSize: 24,
            lineHeight: 1.3,
            fontVariantNumeric: "tabular-nums",
            // One line, capped to the rare + largest groups; a still-long
            // line ellipsises inside the slot instead of running off it.
            whiteSpace: "nowrap",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            ...inkStroke,
          }}
        >
          {tally.entries.map((entry, index) => (
            <span key={entry.label}>
              {index > 0 ? " · " : null}
              <span
                data-plaque-rare={entry.rare ? "1" : undefined}
                style={entry.rare ? { color: ACCENT } : undefined}
              >
                {formatPlaqueTallyEntry(entry)}
              </span>
            </span>
          ))}
          {tally.more > 0 ? (
            <span style={{ color: MUTED }}> +{tally.more} more</span>
          ) : null}
        </div>
      ) : null}
      {model.numerals !== null ? (
        <div
          key={model.numerals}
          data-plaque-numerals=""
          style={{
            fontFamily: MONO,
            fontWeight: 900,
            fontSize: 72,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            animation: "obs-plaque-pop 0.8s ease-out",
            ...inkStroke,
          }}
        >
          {model.numerals}
        </div>
      ) : null}
    </div>
  );

  if (mode === "slot") {
    return slot ? createPortal(content, slot) : null;
  }
  return content;
}

const NUMERAL_FADE_MS = 240;

/** The verdict numeral at the cat: mono 900, `obs-plaque-pop` replayed per text (keyed by text). Used by the batch wrapper only. */
export function CountdownNumeral({
  text,
  at,
  size = 220,
  ink,
  shadow,
}: Readonly<CountdownNumeralProps>): ReactElement | null {
  // Keep the last text through the fade so "1" does not vanish in a cut.
  const [shown, setShown] = useState<string | null>(text);
  useEffect(() => {
    if (text !== null) {
      setShown(text);
      return;
    }
    const timer = window.setTimeout(() => setShown(null), NUMERAL_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const current = text ?? shown;
  if (current === null || !at) return null;
  return (
    <>
      <style>{PLAQUE_KEYFRAMES}</style>
      <div
        data-countdown-numeral={current}
        style={{
          position: "absolute",
          left: at.x,
          top: at.y,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          opacity: text === null ? 0 : 1,
          transition: `opacity ${NUMERAL_FADE_MS.toString()}ms ease`,
        }}
      >
        <div
          key={current}
          style={{
            fontFamily: MONO,
            fontWeight: 900,
            fontSize: size,
            lineHeight: 1,
            color: ink ?? INK,
            textShadow: shadow ?? SHADOW,
            fontVariantNumeric: "tabular-nums",
            animation: "obs-plaque-pop 0.8s ease-out",
          }}
        >
          {current}
        </div>
      </div>
    </>
  );
}
