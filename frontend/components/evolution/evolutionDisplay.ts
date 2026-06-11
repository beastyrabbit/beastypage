import type {
  EvolutionAddition,
  EvolutionRoll,
} from "@/lib/evolution/evolutionGenerator";
import { getTortieLayerParts } from "@/lib/evolution/evolutionGenerator";

/**
 * Pixel display font utility. The CSS variable is provided by the evolution
 * pages via next/font; anywhere else this falls back to the inherited font.
 */
export const pixelFontClass = "[font-family:var(--font-pixel,monospace)]";

export const STAGE_NUMERALS = ["0", "I", "II", "III"] as const;

export function stageNumeral(level: number): string {
  return STAGE_NUMERALS[level] ?? String(level);
}

/** Warrior-cat rank for each evolution stage. */
export const STAGE_RANKS = ["Kit", "Apprentice", "Warrior", "Leader"] as const;

export function stageRank(level: number): string {
  return STAGE_RANKS[level] ?? `Stage ${level}`;
}

export type AdditionDisplayRow = {
  id: string;
  label: string;
  value: string;
};

export type AdditionChip = {
  id: string;
  kind: EvolutionAddition["kind"];
  text: string;
};

export function formatValue(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function formatAddition(addition: EvolutionAddition) {
  if (addition.kind === "tortie") {
    return [addition.value.mask, addition.value.pattern, addition.value.colour]
      .filter(Boolean)
      .map((value) => formatValue(value ?? ""))
      .join(" / ");
  }
  if (addition.kind === "replacement") {
    return `${formatValue(addition.previous)} ➜ ${formatValue(addition.value)}`;
  }
  return formatValue(addition.value);
}

function getTortieParts(
  addition: Extract<EvolutionAddition, { kind: "tortie" }>,
) {
  return addition.parts?.length > 0
    ? addition.parts
    : getTortieLayerParts(addition.value);
}

const SIMPLE_ADDITION_LABEL: Record<string, string> = {
  accessory: "Accessory",
  scar: "Scar",
  coat: "Coat",
};

export function buildAdditionDisplayRows(
  additions: EvolutionAddition[],
  idPrefix: string,
): AdditionDisplayRow[] {
  let tortieLayerIndex = 0;
  return additions.flatMap((addition, additionIndex) => {
    if (addition.kind === "tortie") {
      tortieLayerIndex += 1;
      const layerLabel = `Tortie ${tortieLayerIndex}`;
      return getTortieParts(addition).map((part) => ({
        id: `${idPrefix}-${additionIndex}-${part.kind}`,
        label: `${layerLabel} ${part.label}`,
        value: formatValue(part.value),
      }));
    }
    if (addition.kind === "replacement") {
      return [
        {
          id: `${idPrefix}-${additionIndex}-replacement`,
          label: `Replaced ${addition.slot}`,
          value: formatAddition(addition),
        },
      ];
    }
    return [
      {
        id: `${idPrefix}-${additionIndex}-${addition.kind}`,
        label: SIMPLE_ADDITION_LABEL[addition.kind] ?? addition.kind,
        value: formatAddition(addition),
      },
    ];
  });
}

export function buildRollDisplayRows(
  rolls: EvolutionRoll[] | undefined,
  additions: EvolutionAddition[],
  idPrefix: string,
): AdditionDisplayRow[] {
  if (!rolls?.length) return buildAdditionDisplayRows(additions, idPrefix);
  return rolls.map((roll, index) => {
    if (roll.kind === "tortie-count") {
      return {
        id: `${idPrefix}-roll-${index}`,
        label: roll.label,
        value:
          roll.range.min === roll.range.max
            ? String(roll.value)
            : `${roll.value} from ${roll.range.min}-${roll.range.max}`,
      };
    }
    return {
      id: `${idPrefix}-roll-${index}`,
      label: roll.label,
      value: formatValue(String(roll.value)),
    };
  });
}

const ADDITION_KIND_LABEL: Record<EvolutionAddition["kind"], string> = {
  tortie: "Tortie",
  accessory: "Accessory",
  scar: "Scar",
  coat: "Coat",
  replacement: "Reroll",
};

export function buildAdditionChips(
  additions: EvolutionAddition[],
  idPrefix: string,
): AdditionChip[] {
  return additions.map((addition, index) => {
    const label =
      addition.kind === "replacement"
        ? `${ADDITION_KIND_LABEL.replacement} ${formatValue(addition.slot)}`
        : ADDITION_KIND_LABEL[addition.kind];
    return {
      id: `${idPrefix}-chip-${index}`,
      kind: addition.kind,
      text: `${label} · ${formatAddition(addition)}`,
    };
  });
}
