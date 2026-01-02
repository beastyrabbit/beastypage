"use client";
import { Loader2, AlertTriangle } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { VisualBuilderClient, DEFAULT_PARAMS, type VisualBuilderInitialPayload } from "@/components/visual-builder/VisualBuilderClient";

import type { Id } from "@/convex/_generated/dataModel";

type PaletteMode = "off" | "mood" | "bold" | "darker" | "blackout";

type TortieLayer = {
  pattern: string;
  colour: string;
  mask: string;
};

type MapperRecord = {
  id: Id<"cat_profile">;
  slug?: string | null;
  shareToken?: string | null;
  cat_data?: unknown;
  catName?: string | null;
  creatorName?: string | null;
};

function coerceString(value: unknown, fallback: string | undefined = undefined): string | undefined {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

function coerceColour(value: unknown, fallback: string | undefined = undefined): string | undefined {
  const normalised = coerceString(value, fallback);
  return normalised ? normalised.toUpperCase() : fallback;
}

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function coerceBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => coerceString(entry))
      .filter((entry): entry is string => !!entry && entry.toLowerCase() !== "none");
  }
  const single = coerceString(value);
  if (single && single.toLowerCase() !== "none") {
    return [single];
  }
  return [];
}

function normalizeTortieLayers(value: unknown): TortieLayer[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) return null;
      const record = entry as Record<string, unknown>;
      const pattern = coerceString(record.pattern ?? record.peltName);
      const colour = coerceString(record.colour ?? record.color);
      const mask = coerceString(record.mask);
      if (!pattern || !colour || !mask) return null;
      return { pattern, colour, mask } satisfies TortieLayer;
    })
    .filter((entry): entry is TortieLayer => entry !== null);
}

function sanitizeOption(value: unknown): string | undefined {
  const result = coerceString(value);
  if (!result) return undefined;
  if (result.toLowerCase() === "none") return undefined;
  return result;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function extractInitialPayload(record: MapperRecord): VisualBuilderInitialPayload {
  const catData = toRecord(record.cat_data);
  const rawParamsSource = catData.params ?? catData.finalParams ?? record.cat_data;
  const rawParams = toRecord(rawParamsSource);
  const shareSlug = coerceString(catData["shareSlug"]);

  const params = {
    ...DEFAULT_PARAMS,
    spriteNumber: coerceNumber(
      rawParams["spriteNumber"] ?? rawParams["sprite"] ?? rawParams["sprite_number"],
      DEFAULT_PARAMS.spriteNumber
    ),
    peltName: coerceString(rawParams["peltName"], DEFAULT_PARAMS.peltName) ?? DEFAULT_PARAMS.peltName,
    colour: coerceColour(rawParams["colour"] ?? rawParams["color"], DEFAULT_PARAMS.colour) ?? DEFAULT_PARAMS.colour,
    eyeColour: coerceColour(rawParams["eyeColour"] ?? rawParams["eye_color"], DEFAULT_PARAMS.eyeColour) ?? DEFAULT_PARAMS.eyeColour,
    eyeColour2: sanitizeOption(rawParams["eyeColour2"] ?? rawParams["eye_color2"] ?? rawParams["eyeColourSecondary"]),
    skinColour: coerceColour(rawParams["skinColour"] ?? rawParams["skin_color"], DEFAULT_PARAMS.skinColour) ?? DEFAULT_PARAMS.skinColour,
    whitePatches: sanitizeOption(rawParams["whitePatches"] ?? rawParams["white_patches"]),
    whitePatchesTint:
      coerceString(rawParams["whitePatchesTint"] ?? rawParams["white_patches_tint"], DEFAULT_PARAMS.whitePatchesTint) ??
      DEFAULT_PARAMS.whitePatchesTint,
    points: sanitizeOption(rawParams["points"]),
    vitiligo: sanitizeOption(rawParams["vitiligo"]),
    tint: coerceString(rawParams["tint"], DEFAULT_PARAMS.tint) ?? DEFAULT_PARAMS.tint,
    shading: coerceBoolean(rawParams["shading"], DEFAULT_PARAMS.shading),
    reverse: coerceBoolean(rawParams["reverse"], DEFAULT_PARAMS.reverse),
  } satisfies typeof DEFAULT_PARAMS;

  const accessories = toStringArray(catData["accessorySlots"] ?? rawParams["accessories"] ?? rawParams["accessory"]);
  const scars = toStringArray(catData["scarSlots"] ?? rawParams["scars"] ?? rawParams["scar"]);
  const tortieLayers = normalizeTortieLayers(catData["tortieSlots"] ?? rawParams["tortie"]);

  params.accessories = accessories;
  params.accessory = accessories[0] ?? undefined;
  params.scars = scars;
  params.scar = scars[0] ?? undefined;
  params.tortie = tortieLayers;
  params.isTortie = tortieLayers.length > 0;
  if (tortieLayers.length > 0) {
    params.tortiePattern = tortieLayers[0].pattern;
    params.tortieColour = tortieLayers[0].colour;
    params.tortieMask = tortieLayers[0].mask;
  } else {
    params.tortiePattern = undefined;
    params.tortieColour = undefined;
    params.tortieMask = undefined;
  }
  if (!params.whitePatchesTint) {
    params.whitePatchesTint = "none";
  }
  if (!params.tint) {
    params.tint = "none";
  }

  const palette = coerceString(catData["basePalette"])?.toLowerCase();
  const tortiePalette = coerceString(catData["tortiePalette"])?.toLowerCase();
  const paletteModes: PaletteMode[] = ["off", "mood", "bold", "darker", "blackout"];

  const slugValue = shareSlug ?? record.slug ?? record.shareToken ?? null;
  return {
    params,
    tortie: tortieLayers,
    accessories,
    scars,
    paletteMode: paletteModes.includes(palette as PaletteMode) ? (palette as PaletteMode) : undefined,
    tortiePaletteMode: paletteModes.includes(tortiePalette as PaletteMode) ? (tortiePalette as PaletteMode) : undefined,
    slug: slugValue,
    shareUrl: slugValue
      ? shareSlug
        ? `/visual-builder?share=${encodeURIComponent(slugValue)}`
        : `/visual-builder?slug=${encodeURIComponent(slugValue)}`
      : null,
    catName: record.catName ?? null,
    creatorName: record.creatorName ?? null,
  };
}

type VisualBuilderLoaderProps = {
  slug: string;
};

export function VisualBuilderLoader({ slug }: VisualBuilderLoaderProps) {
  const record = useQuery(api.mapper.getBySlug, slug ? { slugOrId: slug } : "skip") as MapperRecord | null | undefined;

  if (!slug) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-3 px-6 text-sm text-muted-foreground">
        <AlertTriangle className="size-6 text-red-400" />
        <p>Missing share identifier.</p>
      </div>
    );
  }

  if (record === undefined) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-3 px-6 text-sm text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p>Loading cat…</p>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-3 px-6 text-sm text-muted-foreground">
        <AlertTriangle className="size-6 text-red-400" />
        <p>We couldn&apos;t find a cat with that link.</p>
      </div>
    );
  }

  const initial = extractInitialPayload(record);
  return <VisualBuilderClient initialCat={initial} />;
}
