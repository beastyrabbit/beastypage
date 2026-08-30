import type { CountDistribution } from "../definition";
import type { GachaCountMode, RandomSource } from "./types";

export type RandomFloatSource = Pick<RandomSource, "nextFloat">;

export const mathRandomSource: RandomFloatSource = {
  nextFloat: () => Math.random(),
};

export function roll(
  random: RandomFloatSource,
  probability: number | undefined,
): boolean {
  if (!probability || probability <= 0) return false;
  if (probability >= 1) return true;
  return random.nextFloat() < probability;
}

export function pickOne<T>(random: RandomFloatSource, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("Attempted to pick from an empty list");
  }
  return items[Math.floor(random.nextFloat() * items.length)];
}

export function pickFromPools<T>(
  random: RandomFloatSource,
  pools: readonly (readonly T[])[],
  choiceWeight?: (choice: T) => number,
): T {
  const available = pools.filter((pool) => pool.length > 0);
  if (available.length === 0) {
    throw new Error("Attempted to pick from an empty catalog");
  }
  const pool = pickOne(random, available);
  if (!choiceWeight) return pickOne(random, pool);
  return pool[weightedChoiceIndex(random, pool.map(choiceWeight))];
}

export function weightedChoiceIndex(
  random: RandomFloatSource,
  weights: readonly number[],
): number {
  if (weights.length === 0) {
    throw new Error("Weighted choice has no entries");
  }
  const normalized = weights.map((weight) => {
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error("Weighted choice contains a non-positive weight");
    }
    return weight;
  });
  const total = normalized.reduce((sum, weight) => sum + weight, 0);
  const target = random.nextFloat() * total;
  let running = 0;
  for (const [index, weight] of normalized.entries()) {
    running += weight;
    if (target < running) return index;
  }
  return normalized.length - 1;
}

export function uniformInteger(
  random: RandomFloatSource,
  min: number,
  max: number,
): number {
  const lower = Math.trunc(Math.min(min, max));
  const upper = Math.trunc(Math.max(min, max));
  if (lower === upper) return lower;
  return lower + Math.floor(random.nextFloat() * (upper - lower + 1));
}

export function weightedDiscrete(
  random: RandomFloatSource,
  weights: Readonly<Record<string, number>>,
): number {
  const entries = Object.entries(weights)
    .map(([rawValue, rawWeight]) => ({
      value: Number(rawValue),
      weight: Number(rawWeight),
    }))
    .filter(
      (entry) =>
        Number.isInteger(entry.value) &&
        Number.isFinite(entry.weight) &&
        entry.weight > 0,
    )
    .sort((left, right) => left.value - right.value);
  if (entries.length === 0) {
    throw new Error("Weighted distribution has no valid entries");
  }

  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const target = random.nextFloat() * total;
  let running = 0;
  for (const entry of entries) {
    running += entry.weight;
    if (target < running) return entry.value;
  }
  return entries[entries.length - 1].value;
}

export function resolveCount(
  random: RandomFloatSource,
  distribution: CountDistribution,
  mode?: GachaCountMode,
): number {
  if (mode === "uniform" || distribution.strategy === "uniformCount") {
    return uniformInteger(random, distribution.min, distribution.max);
  }
  return weightedDiscrete(random, distribution.weights);
}

export interface MaterializeSlotsOptions<TChoice, TValue, TSlot> {
  random: RandomFloatSource;
  slotCount: number;
  availableChoices: readonly TChoice[];
  unique?: boolean;
  exactCount: boolean;
  placeholder: TSlot;
  shouldFillSlot(slotIndex: number, selectedCount: number): boolean;
  choiceWeight?: (choice: TChoice) => number;
  mapChoice(choice: TChoice): TValue;
  mapValueToSlot(value: TValue): TSlot;
}

export interface MaterializedSlots<TValue, TSlot> {
  selectedValues: TValue[];
  slotSelections: TSlot[];
}

export function materializeSlots<TChoice, TValue, TSlot>({
  random,
  slotCount,
  availableChoices,
  unique = true,
  exactCount,
  placeholder,
  shouldFillSlot,
  choiceWeight,
  mapChoice,
  mapValueToSlot,
}: MaterializeSlotsOptions<TChoice, TValue, TSlot>): MaterializedSlots<
  TValue,
  TSlot
> {
  const selectedValues: TValue[] = [];
  const slotSelections: TSlot[] = [];
  const available = [...availableChoices];
  const count = Math.max(0, Math.trunc(slotCount));

  for (let slot = 0; slot < count && available.length > 0; slot += 1) {
    if (!exactCount && !shouldFillSlot(slot, selectedValues.length)) {
      slotSelections.push(placeholder);
      continue;
    }
    const index = choiceWeight
      ? weightedChoiceIndex(random, available.map(choiceWeight))
      : Math.floor(random.nextFloat() * available.length);
    const choice = unique ? available.splice(index, 1)[0] : available[index];
    if (choice === undefined) break;
    const value = mapChoice(choice);
    selectedValues.push(value);
    slotSelections.push(mapValueToSlot(value));
  }

  return { selectedValues, slotSelections };
}
