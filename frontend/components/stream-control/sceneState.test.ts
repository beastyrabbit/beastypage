import { describe, expect, it } from "vitest";
import { getActiveStreamScene } from "./sceneState";

describe("getActiveStreamScene", () => {
  it("returns lobby for an active lobby command", () => {
    expect(
      getActiveStreamScene({
        status: "active",
        currentCommand: { type: "lobby" },
        testMode: false,
      }),
    ).toBe("lobby");
  });

  it("returns brb for an active BRB command", () => {
    expect(
      getActiveStreamScene({
        status: "active",
        currentCommand: { type: "brb" },
        testMode: false,
      }),
    ).toBe("brb");
  });

  it("returns test when test mode is enabled", () => {
    expect(
      getActiveStreamScene({
        status: "active",
        currentCommand: { type: "lobby" },
        testMode: true,
      }),
    ).toBe("test");
  });

  it("clears scene state for idle or clear sessions", () => {
    expect(
      getActiveStreamScene({
        status: "idle",
        currentCommand: { type: "clear" },
        testMode: false,
      }),
    ).toBeNull();

    expect(
      getActiveStreamScene({
        status: "active",
        currentCommand: { type: "clear" },
        testMode: false,
      }),
    ).toBeNull();
  });

  it.each([
    "spin",
    "wheel",
    "countdown",
  ])("does not mark lobby or BRB active for %s commands", (type) => {
    expect(
      getActiveStreamScene({
        status: "active",
        currentCommand: { type },
        testMode: false,
      }),
    ).toBeNull();
  });
});
