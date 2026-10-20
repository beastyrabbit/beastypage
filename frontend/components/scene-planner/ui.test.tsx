import { act, type ReactNode, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ELEMENTS_BY_ID } from "@/lib/scene-planner/catalog";
import {
  createRng,
  PlanBuilder,
  type RollChain,
} from "@/lib/scene-planner/generate";

import { AtlasMode } from "./AtlasMode";
import { BoardMode } from "./BoardMode";
import { Controls } from "./Controls";
import { GachaMode } from "./GachaMode";
import { Sequence, SequenceCancelled } from "./motion";
import { ScenePlannerClient } from "./ScenePlannerClient";
import { Stage } from "./Stage";
import { type Planner, PlannerContext, usePlannerState } from "./usePlanner";

const animation = vi.hoisted(() => ({
  blocked: false,
  reduced: false,
  present: true,
}));
vi.mock("motion/react", async (original) => {
  const motion = await original<typeof import("motion/react")>();
  return {
    ...motion,
    AnimatePresence: (props: Readonly<{ children?: ReactNode }>) =>
      props.children,
    useIsPresent: () => animation.present,
    useReducedMotion: () => animation.reduced,
    useAnimate: () => {
      const scope = useRef(null);
      const animate = () => {
        let finish = () => {};
        const pending = new Promise<void>((resolve) => {
          finish = resolve;
          if (!animation.blocked) resolve();
        });
        return Object.assign(pending, { complete: finish, stop: () => {} });
      };
      return [scope, animate];
    },
  };
});
vi.mock("@/lib/scene-planner/tile-sheets", () => ({
  loadTileSet: async () => null,
}));
vi.mock("@/lib/scene-planner/coverage", () => ({
  imageCoverage: () => new Array<number>(144).fill(0),
}));

let planner: Planner;
let root: Root;
let container: HTMLDivElement;
let nextTurn: Planner["nextTurn"] | undefined;

function Harness({ children }: Readonly<{ children?: ReactNode }>) {
  const state = usePlannerState();
  planner = nextTurn ? { ...state, nextTurn } : state;
  return (
    <PlannerContext.Provider value={planner}>
      {children}
    </PlannerContext.Provider>
  );
}

async function render(children?: ReactNode) {
  await act(async () => root.render(<Harness>{children}</Harness>));
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function button(text: string) {
  const found = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => target.click());
}

function grid() {
  const target = container.querySelector<HTMLButtonElement>(
    'button[aria-label^="Scene grid"]',
  );
  if (!target) throw new Error("Missing grid");
  target.getBoundingClientRect = () => new DOMRect(0, 0, 120, 120);
  return target;
}

async function key(value: string) {
  await act(async () =>
    grid().dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: value }),
    ),
  );
}

async function pointer(type: string, x = 25, y = 25) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientX: x, clientY: y, pointerId: 1 });
  await act(async () => grid().dispatchEvent(event));
}

function chain(id: string, cells = [26]): RollChain {
  const element = ELEMENTS_BY_ID.get(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return {
    element,
    theme: element.theme,
    placement: { key: `${id}-rolled`, elementId: id, cells },
    candidates: cells,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  animation.blocked = false;
  animation.reduced = false;
  animation.present = true;
  nextTurn = undefined;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("placement validation", () => {
  it("rejects a reveal occupied after it was rolled", async () => {
    await render();
    const rolled = chain("mushrooms");
    await act(async () => {
      planner.placeManual("rocks", [26]);
    });
    await act(async () => {
      expect(planner.addChain(rolled)).toBeNull();
    });
    expect(planner.placements.map((p) => p.elementId)).toEqual(["rocks"]);
  });

  it("keeps the rider host rule when committing a chain", async () => {
    await render();
    await act(async () => {
      expect(planner.addChain(chain("ducks"))).toBeNull();
    });
    await act(async () => {
      planner.placeManual("pond", [26]);
    });
    await act(async () => {
      expect(planner.addChain(chain("ducks"))).not.toBeNull();
    });
    await act(async () => {
      expect(planner.addChain(chain("ducks"))).toBeNull();
    });
  });

  it("reports a fed placement crowded out by its source as not placed", async () => {
    await render();
    const rolled = { ...chain("rocks"), fed: chain("mushrooms") };
    let placed: ReturnType<Planner["addChain"]> = null;
    await act(async () => {
      placed = planner.addChain(rolled);
    });
    expect(placed).toMatchObject({ placement: rolled.placement });
    expect(placed).not.toHaveProperty("fed");
    expect(planner.placements).toHaveLength(1);
  });

  it("reports a fed placement that lands with its source", async () => {
    await render();
    const rolled = { ...chain("rocks"), fed: chain("mushrooms", [27]) };
    let placed: ReturnType<Planner["addChain"]> = null;
    await act(async () => {
      placed = planner.addChain(rolled);
    });
    expect(placed).toBe(rolled);
    expect(planner.placements).toHaveLength(2);
  });

  it("rejects out-of-grid cells and simultaneous manual overlaps", async () => {
    await render();
    await act(async () => {
      for (const cell of [-1, 144, 1.5])
        expect(planner.placeManual("rocks", [cell])).toBe(false);
      expect(planner.placeManual("rocks", [26])).toBe(true);
      expect(planner.placeManual("house", [26])).toBe(false);
    });
    expect(planner.placements).toHaveLength(1);
    await act(async () => {
      planner.resizeGrid(5, 5);
      expect(planner.placeManual("rocks", [26])).toBe(false);
    });
  });
});

describe("stage interactions and announcements", () => {
  it("cancels a pointer draft on resize", async () => {
    await render(<Stage />);
    await act(async () =>
      planner.setTool({ kind: "place", elementId: "rocks" }),
    );
    await pointer("pointerdown");
    await act(async () => planner.resizeGrid(5, 5));
    await pointer("pointerup");
    expect(planner.placements).toEqual([]);
    expect(planner.status.text).toContain("grid size changed");
  });

  it("grows a retraced path from the pointer, not the last new cell", async () => {
    await render(<Stage />);
    await act(async () =>
      planner.setTool({ kind: "place", elementId: "trail" }),
    );
    // 12 columns over 120 px: A1 B1 B2 A2, back over A1 and B1, on to C1.
    const at = (col: number, row: number) => [col * 10 + 5, row * 10 + 5];
    await pointer("pointerdown", ...at(0, 0));
    for (const [col, row] of [
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
      [2, 0],
    ])
      await pointer("pointermove", ...at(col, row));
    await pointer("pointerup");
    expect(planner.placements.map((p) => p.cells)).toEqual([[0, 1, 13, 12, 2]]);
  });

  it("retains the keyboard cursor after the pointer leaves", async () => {
    await render(<Stage />);
    for (let i = 0; i < 3; i++) {
      await key("ArrowRight");
      await key("ArrowDown");
    }
    await act(async () =>
      grid().dispatchEvent(
        new MouseEvent("pointerout", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      ),
    );
    await key("ArrowRight");
    expect(planner.status.text).toContain("E4");
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it("shows and announces failed placements and cancellations", async () => {
    await render(<Stage />);
    await act(async () =>
      planner.setTool({ kind: "place", elementId: "ducks" }),
    );
    await key("Enter");
    await key("Enter");
    expect(container.textContent).toContain("could not be placed");
    expect(planner.status.text).toContain("required host");
    await act(async () =>
      planner.setTool({ kind: "place", elementId: "rocks" }),
    );
    await key("Enter");
    await key("Escape");
    expect(planner.status.text).toBe("Placement cancelled.");
  });

  it("jumps to the reduced-motion diorama tilt immediately", async () => {
    animation.reduced = true;
    await render(<Stage />);
    await act(async () => planner.setView("diorama"));
    await advance(20);
    expect(
      container.querySelector("canvas")?.parentElement?.style.transform,
    ).toContain("rotateX(8deg) rotateY(-8deg)");
  });
});

describe("mode and sequence lifecycle", () => {
  it("blocks pulls and palette choices as soon as presence marks a panel exiting", async () => {
    await act(async () => root.render(<ScenePlannerClient />));
    for (const label of ["Board game", "Flat grid", "Cinematic"]) {
      expect(button(label).getAttribute("aria-pressed")).toBe("true");
      expect(
        button(label).closest("fieldset")?.getAttribute("aria-label"),
      ).toBeTruthy();
    }
    await click(button("Gacha"));
    animation.present = false;
    await act(async () => root.render(<ScenePlannerClient />));
    expect(button("Pull ×1").closest("[inert]")).not.toBeNull();
    await click(button("Pull ×1"));
    expect(button("Board game").disabled).toBe(false);
    animation.present = true;
    await click(button("Tile atlas"));
    animation.present = false;
    await act(async () => root.render(<ScenePlannerClient />));
    const rocks = container.querySelector<HTMLButtonElement>(
      'button[title^="Rocks ·"]',
    );
    expect(rocks?.closest("[inert]")).not.toBeNull();
    if (rocks) await click(rocks);
    expect(grid().className).not.toContain("cursor-crosshair");
  });

  it.each(["gacha", "board"])(
    "settles a %s sequence when its animations never resolve on unmount",
    async (mode) => {
      animation.blocked = true;
      await render(mode === "gacha" ? <GachaMode /> : <BoardMode />);
      await click(button(mode === "gacha" ? "Pull ×1" : "Roll dice"));
      await advance(50);
      expect(planner.rolling).toBe(true);
      await render();
      expect(planner.rolling).toBe(false);
      expect(planner.placements).toEqual([]);
    },
  );

  it("rejects every pending and future wait after cancellation", async () => {
    const sequence = new Sequence();
    const pending = sequence.wait(new Promise<void>(() => {}));
    const result = expect(pending).rejects.toBeInstanceOf(SequenceCancelled);
    sequence.cancel();
    await result;
    await expect(sequence.wait(Promise.resolve())).rejects.toBeInstanceOf(
      SequenceCancelled,
    );
  });
});

describe("roll labels and free draw", () => {
  function fixedTurn(
    steps: number,
    rolled: RollChain | null = chain("celestial", [4]),
  ) {
    let call = 0;
    nextTurn = () => {
      call++;
      const builder = new PlanBuilder({
        ...planner.settings,
        ignored: planner.ignored,
        locked: [],
      });
      vi.spyOn(builder, "roll").mockReturnValue(rolled);
      let die = 0;
      const dice = [Math.floor(steps / 2), Math.ceil(steps / 2)];
      const rng =
        call === 1 ? () => ((dice[die++] ?? 1) - 1) / 6 : createRng("test");
      return { builder, rng };
    };
  }

  it("reports a category closed during its announcement without caching a failed fit", async () => {
    fixedTurn(2, chain("mushrooms"));
    await render(<BoardMode />);
    await click(button("Roll dice"));
    expect(container.textContent).toContain("Category");
    await act(async () =>
      planner.setSettings((s) => ({
        ...s,
        themes: s.themes.filter((t) => t !== "nature"),
      })),
    );
    await advance(6000);
    expect(container.textContent).toContain("Woods: closed");
    expect(container.textContent).not.toContain("no room");
    expect(planner.placements).toEqual([]);
  });

  it("uses current atmosphere for the gacha card and commit-time history", async () => {
    fixedTurn(2);
    await render(<GachaMode />);
    await click(button("Pull ×1"));
    await act(async () =>
      planner.setAtmosphere((s) => ({ ...s, time: "night" })),
    );
    await advance(3000);
    expect(container.textContent).toContain("Moon");
    const variant = Array.from(container.querySelectorAll("span")).find(
      (item) => item.textContent === "Variant",
    );
    const faces = variant?.parentElement?.querySelectorAll(".text-xl");
    expect(faces && Array.from(faces).at(-2)?.textContent).toBe("🌙");
    expect(container.querySelector('[title="Moon · E1"]')).not.toBeNull();
    expect(planner.status.text).toContain("Moon at E1");
    await act(async () =>
      planner.setAtmosphere((s) => ({ ...s, time: "midday" })),
    );
    expect(container.textContent).toContain("Sun");
    expect(container.querySelector('[title="Moon · E1"]')).not.toBeNull();
  });

  it("uses current atmosphere for the board result and its commit log", async () => {
    fixedTurn(2);
    await render(<BoardMode />);
    await click(button("Roll dice"));
    await advance(600);
    await act(async () =>
      planner.setAtmosphere((s) => ({ ...s, time: "night" })),
    );
    await advance(6000);
    expect(container.textContent).toContain("Moon at E1");
    expect(container.textContent).not.toContain("Sun");
  });

  it("logs the current variant when Storm removes an element", async () => {
    fixedTurn(4);
    await render(<BoardMode />);
    await act(async () => {
      planner.placeManual("celestial", [4]);
      planner.setAtmosphere((s) => ({ ...s, time: "night" }));
    });
    await click(button("Roll dice"));
    await advance(3000);
    expect(container.textContent).toContain("Storm took Moon");
    expect(planner.placements).toEqual([]);
  });

  it("announces empty rolls without announcing reel filler", async () => {
    nextTurn = () => {
      const builder = new PlanBuilder({
        ...planner.settings,
        ignored: planner.ignored,
        locked: [],
      });
      vi.spyOn(builder, "roll").mockReturnValue(null);
      return { builder, rng: createRng("empty") };
    };
    await render(<GachaMode />);
    await click(button("Pull ×1"));
    expect(planner.status.text).toBe(
      "The machine is empty: nothing has room left.",
    );
  });

  it("announces the board's failed fit outcome", async () => {
    fixedTurn(2, null);
    await render(<BoardMode />);
    await click(button("Roll dice"));
    await advance(6000);
    expect(container.textContent).toContain("Nothing fits");
    expect(planner.status.text).toBe("Woods: no room");
  });

  it("hands free-draw focus from picker to grid and back after drawing", async () => {
    fixedTurn(7);
    await render(
      <>
        <Stage />
        <BoardMode />
      </>,
    );
    button("Roll dice").focus();
    await click(button("Roll dice"));
    await advance(1200);
    const pickerButton = document.activeElement;
    expect(pickerButton?.getAttribute("aria-pressed")).toBe("false");
    const rocks = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Rocks"]',
    );
    if (!rocks) throw new Error("Missing free-draw Rocks");
    await click(rocks);
    expect(document.activeElement).toBe(grid());
    await key("Enter");
    await key("Enter");
    await advance(500);
    expect(document.activeElement).toBe(button("Roll dice"));
    expect(planner.status.text).toContain("Free draw done");
  });

  it("names free-draw and atlas choices by their current variant", async () => {
    fixedTurn(7);
    await render(
      <>
        <BoardMode />
        <AtlasMode />
      </>,
    );
    await act(async () =>
      planner.setAtmosphere((s) => ({ ...s, time: "night" })),
    );
    await click(button("Roll dice"));
    await advance(1200);
    const names = (selector: string) =>
      Array.from(container.querySelectorAll(selector), (item) =>
        item.getAttribute("aria-label"),
      );
    const freeDraw = names('button[title][aria-label]:not([title*=" · "])');
    expect(freeDraw).toContain("Moon");
    expect(freeDraw).not.toContain("Sun");
    const atlas = names('button[title*=" · "]');
    expect(atlas).toContain("Moon");
    expect(new Set(atlas).size).toBe(atlas.length);
  });

  it("restores focus when free draw expires without a placement", async () => {
    fixedTurn(7);
    await render(
      <>
        <Stage />
        <BoardMode />
      </>,
    );
    button("Roll dice").focus();
    await click(button("Roll dice"));
    await advance(17000);
    expect(document.activeElement).toBe(button("Roll dice"));
    expect(planner.rolling).toBe(false);
  });
});

describe("control semantics and foreground failures", () => {
  it("ties visible labels to every range and select and exposes selected toggles", async () => {
    await render(
      <>
        <Controls />
        <AtlasMode />
      </>,
    );
    await act(async () =>
      planner.setOverlay({
        src: "data:image/png;base64,",
        name: "test",
        aspect: 1,
        image: document.createElement("img"),
        visible: true,
        opacity: 0.85,
        threshold: 0.5,
      }),
    );
    for (const control of container.querySelectorAll(
      'input[type="range"],select',
    )) {
      expect(
        container.querySelector(`label[for="${control.id}"]`)?.textContent,
      ).toBeTruthy();
    }
    expect(button("🌲 Woods").getAttribute("aria-pressed")).toBe("true");
    expect(button("Select").getAttribute("aria-pressed")).toBe("true");
    const rocks = container.querySelector<HTMLButtonElement>(
      'button[title^="Rocks ·"]',
    );
    if (!rocks) throw new Error("Missing Rocks");
    await click(rocks);
    expect(rocks.getAttribute("aria-pressed")).toBe("true");
  });

  it("announces read failures and ignores stale foreground errors", async () => {
    const readers: FileReader[] = [];
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(
      function (this: FileReader) {
        readers.push(this);
      },
    );
    await render(<Controls />);
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Missing upload");
    const pick = async (name: string) => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["bad"], name)],
      });
      await act(async () =>
        input.dispatchEvent(new Event("change", { bubbles: true })),
      );
    };
    await pick("older.png");
    await pick("latest.png");
    await act(async () => readers[0].dispatchEvent(new Event("error")));
    expect(container.textContent).not.toContain("Could not read");
    await act(async () => readers[1].dispatchEvent(new Event("error")));
    expect(container.textContent).toContain("Could not read latest.png");
    expect(planner.status.text).toContain("Could not read latest.png");
  });

  it("announces decode failures and ignores stale image errors", async () => {
    const images: MockImage[] = [];
    class MockImage {
      onerror: (() => void) | null = null;
      constructor() {
        images.push(this);
      }
    }
    vi.stubGlobal("Image", MockImage);
    await render(<Controls />);
    await click(button("Sample subject"));
    await click(button("Sample subject"));
    await act(async () => images[0].onerror?.());
    expect(container.textContent).not.toContain("Could not decode");
    await act(async () => images[1].onerror?.());
    expect(container.textContent).toContain("Could not decode Sample subject");
    expect(planner.status.text).toContain("Could not decode Sample subject");
  });
});
