import { describe, expect, it } from "vitest";
import type { EvolutionCatData } from "../evolutionGenerator";
import {
  buildCeremonySchedule,
  scheduleCatsFromCommand,
} from "../rollSchedule";
import {
  ceremonyElapsedMs,
  ceremonyPhaseForReload,
  EVOLUTION_HOLD_MAX_MS,
  type EvolutionStreamCommand,
  estimateEvolutionCommandMs,
  readEvolutionLiveState,
} from "../streamEvolution";

const command: EvolutionStreamCommand = {
  slug: "test",
  totalCount: 3,
  chargeDurationMs: 5000,
  cats: [
    {
      key: "s",
      label: "Starter",
      level: 0,
      branchLabel: null,
      archetype: null,
      additions: [],
      catData: {} as EvolutionCatData,
    },
    {
      key: "a1",
      label: "A1",
      level: 1,
      branchLabel: "A",
      archetype: "leaf",
      additions: [
        {
          kind: "accessory",
          traitId: "accessories",
          label: "x",
          value: "HOLLY",
          traitValue: "HOLLY",
        },
      ],
      catData: {} as EvolutionCatData,
    },
    {
      key: "a2",
      label: "A2",
      level: 2,
      branchLabel: "A",
      archetype: "leaf",
      additions: [],
      catData: {} as EvolutionCatData,
    },
  ],
};
// summon 3000 + banner 2000 + roll 5000 + reveal 2180 + reveal 2000 + finale 3500
const totalMs = buildCeremonySchedule(
  scheduleCatsFromCommand(command),
  command.totalCount,
  5000,
).totalMs;
const T0 = 1_000_000;

describe("ceremonyElapsedMs", () => {
  it("runs from the command timestamp, clamped at 0", () => {
    expect(ceremonyElapsedMs(T0 + 4200, T0, 1, null)).toBe(4200);
    expect(ceremonyElapsedMs(T0 - 50, T0, 1, null)).toBe(0);
  });

  it("subtracts the server offset", () => {
    expect(
      ceremonyElapsedMs(T0 + 4200, T0, 1, { seq: 1, offsetMs: 1200 }),
    ).toBe(3000);
  });

  it("freezes while held and clamps the hold at 90 s", () => {
    const held = { seq: 1, offsetMs: 0, holdStartedAt: T0 + 4000 };
    expect(ceremonyElapsedMs(T0 + 4000, T0, 1, held)).toBe(4000);
    expect(ceremonyElapsedMs(T0 + 9000, T0, 1, held)).toBe(4000);
    expect(ceremonyElapsedMs(T0 + 4000 + 95_000, T0, 1, held)).toBe(
      4000 + 95_000 - EVOLUTION_HOLD_MAX_MS,
    );
  });

  it("ignores a state for another seq", () => {
    expect(
      ceremonyElapsedMs(T0 + 4200, T0, 2, {
        seq: 1,
        offsetMs: 1200,
        holdStartedAt: T0,
      }),
    ).toBe(4200);
  });
});

describe("ceremonyPhaseForReload", () => {
  it("replays the ceremony while the clock is inside the schedule", () => {
    expect(ceremonyPhaseForReload(command, 1, T0, null, T0 + 1000)).toBe(
      "ceremony",
    );
    expect(ceremonyPhaseForReload(command, 1, T0, null, T0 + totalMs - 1)).toBe(
      "ceremony",
    );
  });

  it("jumps to the tree once the schedule is over", () => {
    expect(ceremonyPhaseForReload(command, 1, T0, null, T0 + totalMs)).toBe(
      "tree",
    );
  });

  it("an open hold keeps the ceremony even past the wall-clock total", () => {
    expect(
      ceremonyPhaseForReload(
        command,
        1,
        T0,
        { seq: 1, offsetMs: 0, holdStartedAt: T0 + 100 },
        T0 + totalMs + 5000,
      ),
    ).toBe("ceremony");
  });

  it("skipToBoard wins", () => {
    expect(
      ceremonyPhaseForReload(
        command,
        1,
        T0,
        { seq: 1, offsetMs: 0, skipToBoard: true },
        T0 + 10,
      ),
    ).toBe("tree");
    // …only for the same seq.
    expect(
      ceremonyPhaseForReload(
        command,
        2,
        T0,
        { seq: 1, offsetMs: 0, skipToBoard: true },
        T0 + 10,
      ),
    ).toBe("ceremony");
  });
});

describe("estimateEvolutionCommandMs", () => {
  it("is the schedule total plus offset plus the hold maximum", () => {
    expect(estimateEvolutionCommandMs(command)).toBe(totalMs);
    expect(
      estimateEvolutionCommandMs(command, { seq: 1, offsetMs: 2500 }),
    ).toBe(totalMs + 2500);
    expect(
      estimateEvolutionCommandMs(command, {
        seq: 1,
        offsetMs: 2500,
        holdStartedAt: T0,
      }),
    ).toBe(totalMs + 2500 + EVOLUTION_HOLD_MAX_MS);
  });
});

describe("readEvolutionLiveState", () => {
  it("reads the session field and drops malformed values", () => {
    expect(readEvolutionLiveState(null)).toBeNull();
    expect(readEvolutionLiveState({})).toBeNull();
    expect(
      readEvolutionLiveState({ evolutionState: { offsetMs: 3 } }),
    ).toBeNull();
    expect(
      readEvolutionLiveState({
        evolutionState: {
          seq: 4,
          offsetMs: 300,
          holdStartedAt: null,
          skipToBoard: false,
        },
      }),
    ).toEqual({ seq: 4, offsetMs: 300 });
    expect(
      readEvolutionLiveState({
        evolutionState: { seq: 4, holdStartedAt: 99, skipToBoard: true },
      }),
    ).toEqual({ seq: 4, offsetMs: 0, holdStartedAt: 99, skipToBoard: true });
  });
});
