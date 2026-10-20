// @vitest-environment node
import { type Canvas, createCanvas, Path2D } from "@napi-rs/canvas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type Placement, zoneStarts } from "../generate";
import { exportCanvas, renderScene, type SceneFrame } from "../render";
import type { TileSet } from "../tile-sheets";

const loaded = vi.hoisted(() => ({ set: null as TileSet | null }));
vi.mock("../tile-sheets", () => ({
  currentTileSet: () => loaded.set,
  gradedSheet: (source: HTMLImageElement) => source,
}));

function frame(placements: Placement[] = []): SceneFrame {
  return {
    cols: 8,
    rows: 8,
    starts: zoneStarts(8, 0.25),
    placements,
    atmosphere: { time: "midday", season: "Summer", weather: "Clear" },
    appearing: new Map(),
    ghosts: [],
    now: 1000,
    tick: 0,
  };
}

function draw(scene: SceneFrame) {
  const canvas = createCanvas(scene.cols * 16, scene.rows * 16);
  renderScene(
    canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
    scene,
  );
  return canvas;
}

function cellPixels(canvas: Canvas, cell: number) {
  return canvas
    .getContext("2d")
    .getImageData((cell % 8) * 16, Math.floor(cell / 8) * 16, 16, 16).data;
}

function edgeRequests() {
  const requests: string[] = [];
  const tiles = new Proxy<Record<string, [number, number]>>(
    {},
    {
      get: (_target, key: string) => {
        requests.push(key);
        return [0, 1];
      },
    },
  );
  loaded.set = {
    index: {
      cell: 16,
      version: "test",
      sheets: { edges: { file: "edges.png", columns: 1, tiles } },
    },
    images: new Map([
      ["edges", createCanvas(16, 16) as unknown as HTMLImageElement],
    ]),
    glows: new Map(),
  };
  return requests;
}

beforeEach(() => {
  loaded.set = null;
  vi.stubGlobal("Path2D", Path2D);
  vi.stubGlobal("document", { createElement: () => createCanvas(300, 150) });
});
afterEach(() => vi.unstubAllGlobals());

describe("material edges", () => {
  it("leaves a lake on bare land to its own rounded rim", () => {
    const requests = edgeRequests();
    draw(frame([{ key: "lake", elementId: "lake", cells: [35, 36, 43, 44] }]));
    expect(requests.filter((key) => key.includes(">"))).toEqual([]);
  });
});

describe("procedural point elements", () => {
  it.each(["birds", "flowers", "mushrooms", "balloon", "boat", "bench"])(
    "paints every touching %s cell when sheets are unavailable",
    (elementId) => {
      const empty = draw(frame());
      const painted = draw(
        frame([{ key: "points", elementId, cells: [35, 36, 43, 44] }]),
      );
      for (const cell of [35, 36, 43, 44]) {
        expect(cellPixels(painted, cell)).not.toEqual(cellPixels(empty, cell));
      }
    },
  );

  it("uses procedural art when the index exists but the main image failed", () => {
    const empty = draw(frame());
    loaded.set = {
      index: {
        cell: 16,
        version: "test",
        sheets: { birds: { file: "birds.png", columns: 1, tiles: {} } },
      },
      images: new Map(),
      glows: new Map(),
    };
    const painted = draw(
      frame([{ key: "birds", elementId: "birds", cells: [3, 4] }]),
    );
    expect(cellPixels(painted, 3)).not.toEqual(cellPixels(empty, 3));
    expect(cellPixels(painted, 4)).not.toEqual(cellPixels(empty, 4));
  });

  it("keeps procedural land when the ground sheet failed", () => {
    const expected = draw(frame());
    loaded.set = {
      index: {
        cell: 16,
        version: "test",
        sheets: { ground: { file: "ground.png", columns: 1, tiles: {} } },
      },
      images: new Map(),
      glows: new Map(),
    };
    expect(draw(frame()).toBuffer("image/png")).toEqual(
      expected.toBuffer("image/png"),
    );
  });
});

describe("foreground export", () => {
  it.each([1, 0.35])(
    "stretches the foreground over scene and grid at opacity %s",
    (opacity) => {
      const scene = frame([
        { key: "flowers", elementId: "flowers", cells: [35, 36] },
      ]);
      const subject = createCanvas(2, 3);
      const subjectCtx = subject.getContext("2d");
      subjectCtx.fillStyle = "#ff0000";
      subjectCtx.fillRect(0, 0, 1, 3);
      subjectCtx.fillStyle = "#0000ff";
      subjectCtx.fillRect(1, 0, 1, 3);
      const expected = exportCanvas(scene, 2, true);
      const expectedCtx = expected.getContext("2d");
      if (!expectedCtx) throw new Error("Missing context");
      expectedCtx.imageSmoothingEnabled = true;
      expectedCtx.globalAlpha = opacity;
      expectedCtx.drawImage(
        subject as unknown as HTMLCanvasElement,
        0,
        0,
        expected.width,
        expected.height,
      );
      const actual = exportCanvas(scene, 2, true, {
        image: subject as unknown as HTMLCanvasElement,
        visible: true,
        opacity,
      });
      expect(
        actual.getContext("2d")?.getImageData(0, 0, actual.width, actual.height)
          .data,
      ).toEqual(
        expectedCtx.getImageData(0, 0, expected.width, expected.height).data,
      );
      expect(actual.getContext("2d")?.globalAlpha).toBe(1);
    },
  );

  it("omits a hidden foreground", () => {
    const scene = frame();
    const subject = createCanvas(1, 1);
    subject.getContext("2d").fillRect(0, 0, 1, 1);
    const without = exportCanvas(scene, 2, true);
    const hidden = exportCanvas(scene, 2, true, {
      image: subject as unknown as HTMLCanvasElement,
      visible: false,
      opacity: 1,
    });
    expect(
      hidden.getContext("2d")?.getImageData(0, 0, hidden.width, hidden.height)
        .data,
    ).toEqual(
      without
        .getContext("2d")
        ?.getImageData(0, 0, without.width, without.height).data,
    );
  });
});
