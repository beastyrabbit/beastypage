// Motion system for the Scene Planner. Every animation uses one of these
// durations and easings; nothing else is allowed.
//
// Animation            Trigger                    Duration          Easing   Purpose
// pixel clock          always                     TICK (12 fps)     steps    tiles move like a sprite sheet
// stamp in / dissolve  placement added / removed  place             steps    element presses into its cells
// zone glow            location step starts       snap              out      shows where the element may land
// locator scan         location step              scan (hops)       out      cursor hops between valid spots
// target pulse         location decided           snap              spring   the spot is final
// token walk           board dice result          walk per square   inout    pawn hops square by square
// dice tumble          board roll                 tumble            out      two dice land on their faces
// square flip          token lands                flip              inout    the square reveals its category
// reel spin            gacha pull                 reel + i*stagger  reel     reels stop left to right
// reel lock            a reel stops               tick              spring   the step is decided
// card fly             all reels locked           fly               inout    card flies into its cells
// compass              path rolled                tumble            out      needle points the way
// layer split          flat ↔ diorama             scene             inout    zones become paper layers
// tilt                 pointer over diorama       spring            spring   layers part with the pointer
// ui                   toggles, lists, chips      snap              out      state change
//
// Tempo multiplies every roll step: cinematic 1, fast 0.35. Skip resolves all
// pending steps at once. Reduced motion turns steps into instant changes and
// freezes the pixel clock.

export const DURATION = {
  tick: 83,
  snap: 180,
  step: 550,
  scan: 800,
  place: 420,
  walk: 150,
  tumble: 700,
  flip: 520,
  reel: 900,
  stagger: 220,
  fly: 600,
  scene: 900,
} as const;

export const EASE = {
  out: [0.23, 1, 0.32, 1],
  inout: [0.65, 0, 0.35, 1],
  spring: [0.34, 1.56, 0.64, 1],
  reel: [0.3, 0, 0.15, 1],
} as const satisfies Record<string, [number, number, number, number]>;

export type Tempo = "cinematic" | "fast";

export const TEMPOS: { id: Tempo; label: string; factor: number }[] = [
  { id: "cinematic", label: "Cinematic", factor: 1 },
  { id: "fast", label: "Fast", factor: 0.35 },
];

/** Seconds for motion's `transition.duration`. */
export function seconds(ms: number) {
  return ms / 1000;
}

/**
 * Paces a roll. `wait` sleeps for a step scaled by the tempo; `skip` ends
 * every pending and later wait of the current roll at once.
 */
export class Director {
  private skipping = false;
  private readonly pending = new Set<() => void>();

  constructor(
    private readonly factor: () => number,
    private readonly reduced: () => boolean,
  ) {}

  get skipped() {
    return this.skipping;
  }

  /** Duration of a step in ms at the current tempo. */
  scale(ms: number) {
    if (this.skipping || this.reduced()) return 0;
    return ms * this.factor();
  }

  wait(ms: number) {
    const duration = this.scale(ms);
    if (duration <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.pending.delete(done);
        resolve();
      };
      const timer = setTimeout(done, duration);
      this.pending.add(done);
    });
  }

  skip() {
    this.skipping = true;
    // Each `done` removes itself; a Set iterator tolerates that.
    for (const done of this.pending) done();
  }

  reset() {
    this.skipping = false;
  }
}
