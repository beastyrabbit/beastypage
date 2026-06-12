import { describe, expect, it } from "vitest";
import {
  type CommandPolicyInput,
  decideCommandAction,
  isTransientCommand,
} from "./commandPolicy";

const NOW = 1_750_000_000_000;

function input(overrides: Partial<CommandPolicyInput>): CommandPolicyInput {
  return {
    type: "spin",
    seq: 5,
    timestamp: NOW - 1000,
    lastSeq: null,
    initialized: false,
    generationDisabled: false,
    initializing: false,
    resultAutoClearEnabled: true,
    resultAutoClearSeconds: 30,
    now: NOW,
    ...overrides,
  };
}

describe("isTransientCommand", () => {
  it("treats spin and wheel as transient", () => {
    expect(isTransientCommand("spin")).toBe(true);
    expect(isTransientCommand("wheel")).toBe(true);
  });

  it("treats scene commands as non-transient", () => {
    for (const type of ["lobby", "brb", "clear", "test", "countdown"]) {
      expect(isTransientCommand(type)).toBe(false);
    }
  });
});

describe("decideCommandAction", () => {
  it("ignores sequences at or below the last handled one", () => {
    expect(decideCommandAction(input({ lastSeq: 5, seq: 5 }))).toBe("ignore");
    expect(decideCommandAction(input({ lastSeq: 6, seq: 5 }))).toBe("ignore");
  });

  it("dispatches newer sequences", () => {
    expect(
      decideCommandAction(input({ lastSeq: 4, seq: 5, initialized: true })),
    ).toBe("dispatch");
  });

  it("defers transient commands while still initializing", () => {
    expect(
      decideCommandAction(
        input({ generationDisabled: true, initializing: true }),
      ),
    ).toBe("defer");
  });

  it("skips transient commands when the generator failed", () => {
    expect(
      decideCommandAction(
        input({ generationDisabled: true, initializing: false }),
      ),
    ).toBe("skip");
  });

  it("dispatches scene commands even while the generator is unavailable", () => {
    expect(
      decideCommandAction(
        input({ type: "lobby", generationDisabled: true, initializing: true }),
      ),
    ).toBe("dispatch");
  });

  it("restores the first transient command when auto-clear is off", () => {
    expect(
      decideCommandAction(
        input({ initialized: false, resultAutoClearEnabled: false }),
      ),
    ).toBe("restore");
    expect(
      decideCommandAction(
        input({
          type: "wheel",
          initialized: false,
          resultAutoClearEnabled: false,
        }),
      ),
    ).toBe("restore");
  });

  it("discards the first transient command when older than the auto-clear window", () => {
    expect(
      decideCommandAction(
        input({
          initialized: false,
          resultAutoClearEnabled: true,
          resultAutoClearSeconds: 30,
          timestamp: NOW - 31_500 - 1,
        }),
      ),
    ).toBe("discard-stale");
  });

  it("replays the first transient command when still within the auto-clear window", () => {
    expect(
      decideCommandAction(
        input({
          initialized: false,
          resultAutoClearEnabled: true,
          resultAutoClearSeconds: 30,
          timestamp: NOW - 31_500 + 1,
        }),
      ),
    ).toBe("dispatch");
  });

  it("never restores or discards once initialized", () => {
    expect(
      decideCommandAction(
        input({
          initialized: true,
          resultAutoClearEnabled: false,
          timestamp: NOW - 600_000,
        }),
      ),
    ).toBe("dispatch");
  });

  it("dispatches the first non-transient command regardless of age", () => {
    expect(
      decideCommandAction(
        input({
          type: "brb",
          initialized: false,
          timestamp: NOW - 600_000,
        }),
      ),
    ).toBe("dispatch");
  });
});
