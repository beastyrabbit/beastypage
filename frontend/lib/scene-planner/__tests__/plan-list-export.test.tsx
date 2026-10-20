import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { PlanList } from "@/components/scene-planner/PlanList";
import { exportCanvas } from "../render";

const state = vi.hoisted(() => ({ overlay: null as unknown }));

vi.mock("@/components/scene-planner/usePlanner", () => ({
  usePlanner: () => ({
    placements: [{ key: "birds", elementId: "birds", cells: [3, 4] }],
    settings: { cols: 8, rows: 8, seed: "export" },
    atmosphere: { time: "midday", season: "Summer", weather: "Clear" },
    starts: { far: 2, mid: 4, front: 6 },
    misplaced: new Set(),
    selected: null,
    reduced: true,
    overlay: state.overlay,
  }),
}));
vi.mock("../render", () => ({
  exportCanvas: vi.fn(() => ({
    toBlob: (done: (blob: null) => void) => done(null),
  })),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each([true, false])(
  "passes the decoded foreground and its visibility %s to export",
  async (visible) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.overlay = { image: new Image(), visible, opacity: 0.4 };
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<PlanList />));
      const button = [...container.querySelectorAll("button")].find(
        (node) => node.textContent === "Export PNG",
      );
      expect(button).toBeDefined();
      await act(async () => button?.click());
      expect(exportCanvas).toHaveBeenCalledWith(
        expect.objectContaining({ cols: 8, rows: 8 }),
        10,
        true,
        state.overlay,
      );
    } finally {
      await act(async () => root.unmount());
    }
  },
);
