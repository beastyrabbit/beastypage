import { columnName, type RollChain } from "@/lib/scene-planner/generate";

import { DURATION } from "./motion";
import type { Planner } from "./usePlanner";

/** Arrow for a path's overall direction. */
export const DRIFT_ARROW = { left: "↙", straight: "↓", right: "↘" } as const;

export function chainLocation(chain: RollChain, cols: number) {
  const first = chain.placement.cells[0];
  return `${columnName(first % cols)}${Math.floor(first / cols) + 1}`;
}

/**
 * Location step on the stage: the allowed zones light up, a locator box hops
 * between valid spots, then settles on the rolled one. Paths draw their
 * trail. Ends by placing the element (and anything it feeds).
 */
export async function revealOnStage(planner: Planner, chain: RollChain) {
  const { director, setCue, settings } = planner;
  const { cols } = settings;
  const steps = [chain, ...(chain.fed ? [chain.fed] : [])];

  for (const step of steps) {
    const zones = step.element.zones;
    const target = step.placement.rect ?? {
      col: step.placement.cells[0] % cols,
      row: Math.floor(step.placement.cells[0] / cols),
      w: 1,
      h: 1,
    };
    if (step === chain) {
      setCue({ zones });
      await director.wait(DURATION.snap * 2);
      const hops = [...step.candidates]
        .sort(() => Math.random() - 0.5)
        .slice(0, 5);
      for (const anchor of hops) {
        if (director.skipped) break;
        setCue({
          zones,
          box: {
            col: anchor % cols,
            row: Math.floor(anchor / cols),
            w: target.w,
            h: target.h,
          },
        });
        await director.wait(DURATION.scan / 4);
      }
    }
    setCue({ zones, box: { ...target, locked: true } });
    await director.wait(DURATION.snap * 2);
    if (step.path) {
      setCue({ trail: step.placement.cells });
      await director.wait(DURATION.step);
    }
  }
  setCue(null);
  planner.addChain(chain);
  await director.wait(DURATION.place);
}
