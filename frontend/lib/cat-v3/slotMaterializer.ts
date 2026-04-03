import type { TortieLayer } from "./types";

export interface MaterializedSlotsResult<TValue, TSlot = TValue | null> {
  selectedValues: TValue[];
  slotSelections: TSlot[];
}

interface BaseSlotOptions<TChoice, TValue, TSlot> {
  slotCount: number;
  availableChoices: readonly TChoice[];
  unique?: boolean;
  exactCount: boolean;
  placeholder: TSlot;
  shouldFillSlot(slotIndex: number, selectedCount: number): boolean;
  /** Transform a drawn choice into the stored value. Defaults to identity. */
  mapChoice?(choice: TChoice): TValue;
  /** Transform a stored value into the slot representation. Defaults to identity. */
  mapValueToSlot?(value: TValue): TSlot;
}

interface TortieSlotOptions {
  slotCount: number;
  masks: readonly string[];
  pelts: readonly string[];
  pickColour(): string;
  uniqueMasks?: boolean;
  exactCount: boolean;
  shouldFillSlot(slotIndex: number, selectedCount: number): boolean;
}

function drawUnique<T>(available: T[]): T | null {
  if (!available.length) return null;
  const index = Math.floor(Math.random() * available.length);
  const [item] = available.splice(index, 1);
  return item ?? null;
}

function pickOne<T>(items: readonly T[]): T {
  if (!items.length) {
    throw new Error("Attempted to pick from an empty list");
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function drawChoice<T>(available: T[], unique: boolean): T | null {
  if (!available.length) return null;
  return unique ? drawUnique(available) : pickOne(available);
}

export function materializeStringSlots<TChoice, TValue = TChoice>({
  slotCount,
  availableChoices,
  unique = true,
  exactCount,
  placeholder,
  shouldFillSlot,
  mapChoice: mapChoiceFn,
  mapValueToSlot: mapValueToSlotFn,
}: BaseSlotOptions<
  TChoice,
  TValue,
  TValue | TChoice | string
>): MaterializedSlotsResult<TValue, TValue | TChoice | string> {
  const identity = <T>(x: T): T => x;
  const mapChoice = mapChoiceFn ?? (identity as (choice: TChoice) => TValue);
  const mapValueToSlot =
    mapValueToSlotFn ??
    (identity as (value: TValue) => TValue | TChoice | string);

  const selectedValues: TValue[] = [];
  const slotSelections: Array<TValue | TChoice | string> = [];
  const available = [...availableChoices];

  if (slotCount <= 0 || available.length === 0) {
    return { selectedValues, slotSelections };
  }

  for (let slot = 0; slot < slotCount; slot += 1) {
    if (!exactCount && !shouldFillSlot(slot, selectedValues.length)) {
      slotSelections.push(placeholder);
      continue;
    }
    const choice = drawChoice(available, unique);
    if (!choice) break;
    const value = mapChoice(choice);
    selectedValues.push(value);
    slotSelections.push(mapValueToSlot(value));
    if (unique && !available.length) {
      break;
    }
  }

  return { selectedValues, slotSelections };
}

export function materializeTortieSlots({
  slotCount,
  masks,
  pelts,
  pickColour,
  uniqueMasks = true,
  exactCount,
  shouldFillSlot,
}: TortieSlotOptions): MaterializedSlotsResult<
  TortieLayer,
  TortieLayer | null
> {
  const selectedValues: TortieLayer[] = [];
  const slotSelections: Array<TortieLayer | null> = [];
  const availableMasks = [...masks];

  if (slotCount <= 0 || masks.length === 0 || pelts.length === 0) {
    return { selectedValues, slotSelections };
  }

  for (let slot = 0; slot < slotCount; slot += 1) {
    if (!exactCount && !shouldFillSlot(slot, selectedValues.length)) {
      slotSelections.push(null);
      continue;
    }

    const mask = drawChoice(availableMasks, uniqueMasks);
    if (!mask) break;

    const layer: TortieLayer = {
      mask,
      pattern: pickOne(pelts),
      colour: pickColour(),
    };
    selectedValues.push(layer);
    slotSelections.push(layer);

    if (uniqueMasks && !availableMasks.length) {
      break;
    }
  }

  return { selectedValues, slotSelections };
}
