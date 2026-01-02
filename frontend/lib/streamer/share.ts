import { cloneParams } from "./steps";
import type { StreamerParams } from "./steps";

export type StreamerHistoryEntry = {
  step_id?: string;
  title?: string;
  option_key?: string;
  label?: string;
  votes?: number;
};

function sanitizeParams(params: StreamerParams): StreamerParams {
  const cloned = cloneParams(params);

  // Filter out internal keys using Object.fromEntries
  const filtered = Object.fromEntries(
    Object.entries(cloned).filter(([key]) => !key.startsWith("_"))
  ) as StreamerParams;

  const accessories = Array.isArray(filtered.accessories)
    ? filtered.accessories.filter((item) => item !== undefined)
    : [];
  const scars = Array.isArray(filtered.scars)
    ? filtered.scars.filter((item) => item !== undefined)
    : [];

  filtered.accessories = accessories.map((item) => (item === null ? null : String(item)));
  filtered.scars = scars.map((item) => (item === null ? null : String(item)));
  filtered.accessory =
    filtered.accessories.find((item) => typeof item === "string" && item) ?? undefined;
  filtered.scar = filtered.scars.find((item) => typeof item === "string" && item) ?? undefined;

  const tortieLayers = Array.isArray(filtered.tortie)
    ? filtered.tortie.filter((layer) => layer && typeof layer === "object").map((layer) => ({
        mask: layer?.mask ?? "ONE",
        pattern: layer?.pattern ?? filtered.peltName ?? "SingleColour",
        colour: layer?.colour ?? filtered.colour ?? "GINGER",
      }))
    : [];

  filtered.tortie = tortieLayers;
  filtered.isTortie = tortieLayers.length > 0;
  filtered.tortiePattern = tortieLayers[0]?.pattern;
  filtered.tortieColour = tortieLayers[0]?.colour;
  filtered.tortieMask = tortieLayers[0]?.mask;

  if (!Number.isFinite(filtered.spriteNumber)) {
    filtered.spriteNumber = 0;
  }

  return filtered;
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
