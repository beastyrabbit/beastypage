import { cloneParams } from "./steps";
import type { StreamerParams } from "./steps";

export type StreamerHistoryEntry = {
  step_id?: string;
  title?: string;
  option_key?: string;
  label?: string;
  votes?: number;
};

function sanitizeParams(params: StreamerParams) {
  const packaged = cloneParams(params);

  const internalKeys = Object.keys(packaged).filter((key) => key.startsWith("_"));
  for (const key of internalKeys) {
    delete (packaged as Record<string, unknown>)[key];
  }

  const accessories = Array.isArray(packaged.accessories)
    ? packaged.accessories.filter((item) => item !== undefined)
    : [];
  const scars = Array.isArray(packaged.scars)
    ? packaged.scars.filter((item) => item !== undefined)
    : [];

  packaged.accessories = accessories.map((item) => (item === null ? null : String(item)));
  packaged.scars = scars.map((item) => (item === null ? null : String(item)));
  packaged.accessory =
    packaged.accessories.find((item) => typeof item === "string" && item) ?? undefined;
  packaged.scar = packaged.scars.find((item) => typeof item === "string" && item) ?? undefined;

  const tortieLayers = Array.isArray(packaged.tortie)
    ? packaged.tortie.filter((layer) => layer && typeof layer === "object").map((layer) => ({
        mask: layer?.mask ?? "ONE",
        pattern: layer?.pattern ?? packaged.peltName ?? "SingleColour",
        colour: layer?.colour ?? packaged.colour ?? "GINGER",
      }))
    : [];

  packaged.tortie = tortieLayers;
  packaged.isTortie = tortieLayers.length > 0;
  packaged.tortiePattern = tortieLayers[0]?.pattern;
  packaged.tortieColour = tortieLayers[0]?.colour;
  packaged.tortieMask = tortieLayers[0]?.mask;

  if (!Number.isFinite(packaged.spriteNumber)) {
    (packaged as Record<string, unknown>).spriteNumber = 0;
  }

  return packaged;
}

export function buildStreamerSharePayload(
  params: StreamerParams,
  history: StreamerHistoryEntry[]
) {
  const packaged = sanitizeParams(params);

  const counts = {
    accessories: packaged.accessories?.filter((item) => typeof item === "string" && item).length ?? 0,
    scars: packaged.scars?.filter((item) => typeof item === "string" && item).length ?? 0,
    tortie: packaged.tortie?.length ?? 0,
  };

  const timeline = history.map((entry) => ({
    id: entry.step_id ?? null,
    title: entry.title ?? null,
    optionKey: entry.option_key ?? null,
    label: entry.label ?? null,
    votes: entry.votes ?? null,
  }));

  return {
    mode: "streamer-voting" as const,
    version: 1,
    spriteNumber: packaged.spriteNumber ?? 0,
    params: packaged,
    counts,
    timeline,
    metaLocked: false,
  };
}
