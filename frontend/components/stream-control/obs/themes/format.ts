import type { ParamId } from "../spinSupport";

/** "0:04", "1:05"; undefined → "–:––". */
export function formatTrackTime(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms) || ms < 0) {
    return "–:––";
  }
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const BAYER = "αβγδεζηθικλμνξοπρστυφχψω";

/** Greek-letter star designation for the i-th trait (wraps after ω). */
export function bayerLetter(index: number): string {
  return BAYER[((index % BAYER.length) + BAYER.length) % BAYER.length];
}

/** "01", "02" … for numbered legends. */
export function legendNumber(index: number): string {
  return (index + 1).toString().padStart(2, "0");
}

export type TransitFamily = "coat" | "eyes" | "patch" | "extra";

const FAMILY: Record<string, TransitFamily> = {
  colour: "coat",
  pelt: "coat",
  tint: "coat",
  tortie: "coat",
  eyeColour: "eyes",
  eyeColour2: "eyes",
  whitePatches: "patch",
  points: "patch",
  whitePatchesTint: "patch",
  vitiligo: "patch",
  skinColour: "extra",
  accessory: "extra",
  scar: "extra",
  sprite: "extra",
};

export function transitFamily(paramId: ParamId): TransitFamily {
  return FAMILY[paramId] ?? "extra";
}

export function truncateValue(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** Revealed values the overlay treats as "nothing here". */
export function isNoneValue(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return v === "none" || v === "" || v === "—" || v === "-";
}
