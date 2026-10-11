/**
 * Pure model for the show plaque (the title / status / tally ink the batch
 * and evolution wrappers draw into a look's `[data-plaque-slot]`) and the
 * geometry the leader lines need. No React here.
 */

export interface PlaqueTallyEntry {
  label: string;
  count: number;
  /** Pool-local rarity ("only #16"); never a global odds claim. */
  rare: boolean;
  /** Two-digit show numbers of the cats in this group when rare (["16"]). */
  numbers?: readonly string[];
}

export interface PlaqueModel {
  /** Italic serif, upper-cased by CSS ("WHITE PATCHES"). */
  title: string;
  /** Light sans line under the title ("rolling · 1 of 2", "Who leaves? Say a number"). */
  status: string;
  /** Mono tally, largest group first ("14 none · 6 Little · 3 Tuxedo · 1 Mask, only #16"). Empty in the evolution show. */
  tally: readonly PlaqueTallyEntry[];
  /**
   * Fallback numeral INSIDE the plaque (72 px mono). The batch wrapper sets it to the verdict
   * seconds ONLY when the marked cat's rect is not measured (look without data-batch-cat yet,
   * first tick after a resume); null in every other beat and always null in the evolution show.
   * The big countdown is `CountdownNumeral` at the cat (see Plaque.tsx), never two at once.
   */
  numerals: string | null;
}

/** One group of the batch deal as the engine publishes it (mirrors BatchBeat.groups). */
export interface PlaqueGroupInput {
  value: string | null;
  label: string;
  catIds: readonly string[];
}

/** Per-look opt-in/out of the wrapper chrome. Tables: BATCH_LOOK_CHROME (batchView.ts), LOOK_CHROME (LookBoardProps.ts). */
export interface LookChrome {
  /**
   * "slot": the look mounts a `[data-plaque-slot]` for the WHOLE show and the plaque portals into it
   *          (no backing; the look's material is the backing). Slot missing → the plaque renders nothing.
   * "free": no slot; ink only (title/status/tally with `--obs-plaque-shadow`), positioned at `freePosition`.
   *          Never a plate, never a border.
   * "none": no plaque at all (the look carries the stage/roll text in its own material).
   */
  plaque: "slot" | "free" | "none";
  /** Leader lines from the plaque to the changed cats / the gained slot. */
  lines: boolean;
  /** Glint sheet on favourite/rare cats (batch) — the only ambient layer. */
  glints: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Sprite cells are 50×50 units (spriteAnchors.SPRITE_SIZE). */
const SPRITE_UNITS = 50;

function compareLabel(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Builds the tally: entries sorted by count desc then label asc; "none" is an ordinary entry; rare groups carry their numbers. */
export function buildPlaqueTally(
  groups: readonly PlaqueGroupInput[],
  unchangedCount: number,
  rareIds: ReadonlySet<string>,
  numberById: ReadonlyMap<string, string>,
): PlaqueTallyEntry[] {
  const entries: PlaqueTallyEntry[] = [];
  if (unchangedCount > 0) {
    entries.push({ label: "none", count: unchangedCount, rare: false });
  }
  for (const group of groups) {
    const rare =
      group.catIds.length > 0 && group.catIds.every((id) => rareIds.has(id));
    const entry: PlaqueTallyEntry = {
      label: group.label,
      count: group.catIds.length,
      rare,
    };
    if (rare) {
      entry.numbers = group.catIds.flatMap((id) => {
        const number = numberById.get(id);
        return number === undefined ? [] : [number];
      });
    }
    entries.push(entry);
  }
  entries.sort((a, b) => b.count - a.count || compareLabel(a.label, b.label));
  return entries;
}

/** "14 none · 6 Little · 3 Tuxedo · 1 Mask, only #16" */
export function formatPlaqueTally(tally: readonly PlaqueTallyEntry[]): string {
  return tally.map(formatPlaqueTallyEntry).join(" · ");
}

/** One tally entry: "6 Little" or "1 Mask, only #16". */
export function formatPlaqueTallyEntry(entry: PlaqueTallyEntry): string {
  const base = `${entry.count.toString()} ${entry.label}`;
  if (!entry.rare || !entry.numbers || entry.numbers.length === 0) return base;
  return `${base}, only #${entry.numbers.join(" #")}`;
}

/** Default number of tally entries the plaque prints on its one mono line. */
export const PLAQUE_TALLY_MAX_ENTRIES = 4;

/** Rare entries a capped tally keeps before it fills with the largest groups. */
const PLAQUE_TALLY_MAX_RARE = 2;

/**
 * Caps the tally to `max` entries so the one-line mono tally fits a 420 px
 * slot: up to two rare entries are kept (they are the line's point), the
 * rest is filled with the largest groups, order preserved. `more` counts the
 * dropped entries for a trailing "+n more".
 */
export function capPlaqueTally(
  tally: readonly PlaqueTallyEntry[],
  max = PLAQUE_TALLY_MAX_ENTRIES,
): { entries: PlaqueTallyEntry[]; more: number } {
  if (tally.length <= max) return { entries: [...tally], more: 0 };
  const keep = new Set<PlaqueTallyEntry>();
  for (const entry of tally) {
    if (entry.rare && keep.size < Math.min(max, PLAQUE_TALLY_MAX_RARE)) {
      keep.add(entry);
    }
  }
  for (const entry of tally) {
    if (keep.size >= max) break;
    keep.add(entry);
  }
  const entries = tally.filter((entry) => keep.has(entry));
  return { entries, more: tally.length - entries.length };
}

/** Point inside `rect` for a sprite anchor given in 0..50 sprite units (spriteAnchors.SpritePoint); centre when anchor is null. x = rect.x + (anchor.x + .5) / 50 * rect.width. */
export function anchorPointInRect(rect: Rect, anchor: Point | null): Point {
  if (!anchor) {
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }
  return {
    x: rect.x + ((anchor.x + 0.5) / SPRITE_UNITS) * rect.width,
    y: rect.y + ((anchor.y + 0.5) / SPRITE_UNITS) * rect.height,
  };
}

/** Up to `max` leader targets: rare ids first (in deal order), then members of the smallest changed groups; never unchanged cats. */
export function pickLeaderTargetIds(
  order: readonly string[],
  rareIds: readonly string[],
  groups: readonly PlaqueGroupInput[],
  max = 3,
): string[] {
  if (max <= 0) return [];
  // Only group members are changed cats; everything else is unchanged.
  const changed = new Set<string>();
  for (const group of groups) for (const id of group.catIds) changed.add(id);
  const rare = new Set(rareIds);
  const dealIndex = new Map<string, number>();
  for (const [index, id] of order.entries()) dealIndex.set(id, index);

  const picked: string[] = [];
  const take = (id: string) => {
    if (picked.length >= max || picked.includes(id) || !changed.has(id)) return;
    picked.push(id);
  };

  // Rare cats in deal order (then any rare id the order does not list).
  for (const id of order) if (rare.has(id)) take(id);
  for (const id of rareIds) take(id);

  // Smallest changed groups next, members in deal order.
  const bySize = [...groups]
    .filter((group) => group.catIds.length > 0)
    .sort((a, b) => a.catIds.length - b.catIds.length);
  for (const group of bySize) {
    const members = [...group.catIds].sort(
      (a, b) =>
        (dealIndex.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (dealIndex.get(b) ?? Number.MAX_SAFE_INTEGER),
    );
    for (const id of members) take(id);
    if (picked.length >= max) break;
  }
  return picked;
}
