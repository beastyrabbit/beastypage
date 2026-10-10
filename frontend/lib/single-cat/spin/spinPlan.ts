/**
 * The whole spin of a rolled cat, simulated up front in reveal order so every
 * frame can be preloaded right after the roll. Clients look up each phase by
 * key and render from it; they keep all animation, timing, and UI.
 *
 * The count reveal that may precede the params is not part of the plan.
 */

import {
  applyParamValue,
  cloneParams,
  getParameterRawValue,
  getParameterValueForDisplay,
  PARAM_SEQUENCE,
  type ParameterOptions,
  type TortieSlot,
} from "@/components/stream-control/obs/spinSupport";
import type { CatParams } from "@/lib/cat-v3/types";
import {
  getRegistryRevealValue,
  type RegistryRevealDefinition,
} from "@/utils/spinTiming";
import {
  buildParamDescriptors,
  buildRegistrySlotDescriptors,
  buildStringLayerDescriptors,
  buildTortieSlotSpin,
  commitRegistrySlots,
  commitStringLayers,
  commitTortieSlots,
  createInitialProgressiveParams,
  isAnimatableParam,
  lazy,
  nextRegistryCommitted,
  type RolledSlots,
  registrySlotChoices,
  registrySlotTargets,
  resolveRolledSlots,
  type SpinPools,
  type StringLayerKind,
  spinParamRoute,
  stringLayerSlotValue,
  type TortieSlotSpin,
} from "./descriptors";
import type { SpinFrameLoader, VariantDescriptor } from "./types";

type Params = Partial<CatParams>;

/** A param revealed on its own (colour, pelt, eyes, tortie toggle, ...). */
export interface ParamPhase {
  kind: "param";
  key: string;
  definition: RegistryRevealDefinition;
  targetRaw: unknown;
  targetDisplay: string;
  /** Flip frames (flashy and animatable); otherwise render `after` once. */
  animate: boolean;
  /** Progressive params before the reveal; the frames' base params. */
  before: Params;
  after: Params;
  /** Every option, target last; empty for non-animatable params. */
  readonly descriptors: VariantDescriptor[];
}

/** One accessory, scar, or registry string slot. */
export interface StringSlotPhase {
  kind: "accessory" | "scar" | "registry";
  key: string;
  definition: RegistryRevealDefinition;
  index: number;
  /** The rolled slot value as given ("none" or missing for an empty slot). */
  target: string;
  /** The committed value; `null` when the slot is "none". */
  value: string | null;
  /** Committed non-none values of this group after the slot. */
  committed: string[];
  before: Params;
  /** Rendered once after the slot commits, flashy or calm. */
  after: Params;
  readonly descriptors: VariantDescriptor[];
}

/** One tortie layer. A `null` target reveals "None" without rendering. */
export interface TortieSlotPhase {
  kind: "tortie";
  key: string;
  definition: RegistryRevealDefinition;
  index: number;
  target: TortieSlot | null;
  /** Stage spins and the colours drawn for them; `null` for a None layer. */
  spin: TortieSlotSpin | null;
  /** The committed layer (`spin.result` when flashy, else the target). */
  value: TortieSlot | null;
  committed: TortieSlot[];
  before: Params;
  /** Rendered once after the layer commits; equals `before` for None. */
  after: Params;
}

/** A slot group with no slots: render `params` once. */
export interface EmptySlotsPhase {
  kind: "empty";
  key: string;
  /** "accessory", "scar", "tortie", or a registry trait id. */
  group: string;
  definition: RegistryRevealDefinition;
  params: Params;
}

export interface FinalPhase {
  kind: "final";
  key: "final";
  params: Params;
}

export type SpinPhase =
  | ParamPhase
  | StringSlotPhase
  | TortieSlotPhase
  | EmptySlotsPhase
  | FinalPhase;

export const spinPhaseKey = {
  param: (paramId: string) => `param:${paramId}`,
  accessory: (index: number) => `accessory:${index}`,
  scar: (index: number) => `scar:${index}`,
  registry: (traitId: string, index: number) => `registry:${traitId}:${index}`,
  tortie: (index: number) => `tortie:${index}`,
  empty: (group: string) => `empty:${group}`,
  final: () => "final" as const,
};

export interface SpinPlan {
  /** Mode the plan was built for: decides `animate` and what is prefetched. */
  spinny: boolean;
  slots: RolledSlots;
  /** The placeholder cat the spin starts from. */
  initial: Params;
  /** Every phase in reveal order. */
  phases: readonly SpinPhase[];
  phase(kind: "param", paramId: string): ParamPhase | undefined;
  phase(kind: "accessory" | "scar", index: number): StringSlotPhase | undefined;
  phase(
    kind: "registry",
    traitId: string,
    index: number,
  ): StringSlotPhase | undefined;
  phase(kind: "tortie", index: number): TortieSlotPhase | undefined;
  phase(kind: "empty", group: string): EmptySlotsPhase | undefined;
  phase(kind: "final"): FinalPhase;
}

export interface SpinPlanInput {
  /** The final rolled params (after afterlife flags are applied). */
  params: Params;
  /** The roll's slot selections; params are the fallback. */
  slotSelections?: Readonly<Record<string, unknown>> | null;
  parameterOptions: ParameterOptions | null;
  pools: SpinPools;
  /** Flashy mode. Calm plans still build descriptors on demand. */
  spinny: boolean;
  /** Tortie colour picks; consumed in reveal order. */
  rng?: () => number;
  /** Reveal order; defaults to the registry's. */
  sequence?: readonly RegistryRevealDefinition[];
}

const NO_DESCRIPTORS: VariantDescriptor[] = [];

function withDescriptors<T extends object>(
  phase: T,
  build: () => VariantDescriptor[],
): T & { readonly descriptors: VariantDescriptor[] } {
  const descriptors = lazy(build);
  return Object.defineProperty(phase, "descriptors", {
    enumerable: true,
    get: descriptors,
  }) as T & { readonly descriptors: VariantDescriptor[] };
}

export function buildSpinPlan(input: SpinPlanInput): SpinPlan {
  const {
    params,
    slotSelections,
    parameterOptions,
    pools,
    spinny,
    rng = Math.random,
    sequence = PARAM_SEQUENCE,
  } = input;
  const slots = resolveRolledSlots(params, slotSelections);
  const progressive = createInitialProgressiveParams(params);
  const initial = cloneParams(progressive);
  const phases: SpinPhase[] = [];

  const pushEmpty = (group: string, definition: RegistryRevealDefinition) => {
    phases.push({
      kind: "empty",
      key: spinPhaseKey.empty(group),
      group,
      definition,
      params: cloneParams(progressive),
    });
  };

  const planStringLayers = (
    kind: StringLayerKind,
    definition: RegistryRevealDefinition,
    targets: string[],
  ) => {
    if (targets.length === 0) {
      pushEmpty(kind, definition);
      return;
    }
    const pool = kind === "accessory" ? pools.accessories : pools.scars;
    const committed: string[] = [];
    targets.forEach((slotTarget, index) => {
      const target = slotTarget ?? "none";
      const before = cloneParams(progressive);
      const prior = [...committed];
      const value = stringLayerSlotValue(target);
      if (value) committed.push(value);
      commitStringLayers(progressive, kind, committed);
      phases.push(
        withDescriptors(
          {
            kind,
            key: spinPhaseKey[kind](index),
            definition,
            index,
            target,
            value,
            committed: [...committed],
            before,
            after: cloneParams(progressive),
          },
          () =>
            buildStringLayerDescriptors(
              kind,
              pool,
              before,
              prior,
              target,
              index,
            ),
        ),
      );
    });
  };

  const planRegistrySlots = (definition: RegistryRevealDefinition) => {
    const targets = registrySlotTargets(
      slotSelections?.[definition.traitId] ??
        getRegistryRevealValue(params, definition),
    );
    if (targets.length === 0) {
      commitRegistrySlots(progressive, definition, []);
      pushEmpty(definition.traitId, definition);
      return;
    }
    const choices = registrySlotChoices(definition);
    let committed: string[] = [];
    targets.forEach((target, index) => {
      const before = cloneParams(progressive);
      const prior = committed;
      committed = nextRegistryCommitted(committed, target);
      commitRegistrySlots(progressive, definition, committed);
      phases.push(
        withDescriptors(
          {
            kind: "registry" as const,
            key: spinPhaseKey.registry(definition.traitId, index),
            definition,
            index,
            target,
            value: target.toLowerCase() === "none" ? null : target,
            committed: [...committed],
            before,
            after: cloneParams(progressive),
          },
          () =>
            buildRegistrySlotDescriptors(
              definition,
              choices,
              before,
              prior,
              target,
              index,
            ),
        ),
      );
    });
  };

  const planTortieSlots = (definition: RegistryRevealDefinition) => {
    if (slots.tortieSlots.length === 0) {
      pushEmpty("tortie", definition);
      return;
    }
    const committed: TortieSlot[] = [];
    slots.tortieSlots.forEach((target, index) => {
      const before = cloneParams(progressive);
      let spin: TortieSlotSpin | null = null;
      let value: TortieSlot | null = null;
      if (target) {
        spin = buildTortieSlotSpin(
          pools,
          before,
          committed,
          target,
          index,
          rng,
        );
        value = spinny ? { ...spin.result } : { ...target };
        committed.push(value);
        commitTortieSlots(progressive, committed);
      }
      phases.push({
        kind: "tortie",
        key: spinPhaseKey.tortie(index),
        definition,
        index,
        target,
        spin,
        value,
        committed: committed.map((layer) => ({ ...layer })),
        before,
        after: target ? cloneParams(progressive) : before,
      });
    });
  };

  for (const definition of sequence) {
    const route = spinParamRoute(definition);
    if (route === "skip") continue;
    if (route === "accessory") {
      planStringLayers("accessory", definition, slots.accessorySlots);
      continue;
    }
    if (route === "scar") {
      planStringLayers("scar", definition, slots.scarSlots);
      continue;
    }
    if (route === "registrySlots") {
      planRegistrySlots(definition);
      continue;
    }

    const targetRaw = getParameterRawValue(definition.id, params);
    const targetDisplay = getParameterValueForDisplay(definition.id, params);
    const animatable = isAnimatableParam(definition, parameterOptions);
    const before = cloneParams(progressive);
    applyParamValue(progressive, definition.id, targetRaw);
    phases.push(
      withDescriptors(
        {
          kind: "param" as const,
          key: spinPhaseKey.param(definition.id),
          definition,
          targetRaw,
          targetDisplay,
          animate: spinny && animatable,
          before,
          after: cloneParams(progressive),
        },
        () =>
          animatable
            ? buildParamDescriptors(
                parameterOptions,
                definition.id,
                before,
                targetRaw,
                targetDisplay,
              )
            : NO_DESCRIPTORS,
      ),
    );

    if (definition.compoundMode === "tortieParts") {
      planTortieSlots(definition);
    }
  }

  const final: FinalPhase = {
    kind: "final",
    key: "final",
    params: cloneParams(params),
  };
  phases.push(final);

  const byKey = new Map(phases.map((phase) => [phase.key, phase]));
  const phase = ((kind: string, ...parts: (string | number)[]) =>
    byKey.get(
      kind === "final" ? "final" : `${kind}:${parts.join(":")}`,
    )) as SpinPlan["phase"];

  return { spinny, slots, initial, phases, phase };
}

type PrefetchLoader = Pick<SpinFrameLoader, "prefetch" | "prefetchSingle">;

/**
 * Queue every render of the spin in reveal order: frames for each flashy
 * phase and the single renders after each commit, ending with the final cat.
 * Calm plans queue only the single renders.
 */
export function prefetchSpin(loader: PrefetchLoader, plan: SpinPlan): void {
  for (const phase of plan.phases) {
    prefetchPhase(loader, phase, plan.spinny);
  }
}

function prefetchPhase(
  loader: PrefetchLoader,
  phase: SpinPhase,
  spinny: boolean,
): void {
  switch (phase.kind) {
    case "param":
      if (phase.animate) loader.prefetch(phase.before, phase.descriptors);
      else loader.prefetchSingle(phase.after);
      break;
    case "accessory":
    case "scar":
    case "registry":
      if (spinny) loader.prefetch(phase.before, phase.descriptors);
      loader.prefetchSingle(phase.after);
      break;
    case "tortie":
      prefetchTortiePhase(loader, phase, spinny);
      break;
    case "empty":
    case "final":
      loader.prefetchSingle(phase.params);
      break;
  }
}

/** A None layer renders nothing; otherwise stage frames, then the commit. */
function prefetchTortiePhase(
  loader: PrefetchLoader,
  phase: TortieSlotPhase,
  spinny: boolean,
): void {
  if (!phase.spin) return;
  if (spinny) {
    for (const stage of phase.spin.stages) {
      loader.prefetch(phase.before, stage.descriptors);
    }
  }
  loader.prefetchSingle(phase.after);
}
