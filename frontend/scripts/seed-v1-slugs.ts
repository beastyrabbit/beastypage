/**
 * Seed script: creates ~100 v1 timing presets via the single-cat-settings API.
 *
 * Usage:  bun frontend/scripts/seed-v1-slugs.ts
 *
 * Requires the Next.js dev server running on localhost:3000.
 * Output: frontend/tmp/test-v1-slugs.json
 */

const API = "http://localhost:3000/api/single-cat-settings";

const PARAM_TIMING_ORDER = [
  "colour",
  "pelt",
  "eyeColour",
  "eyeColour2",
  "tint",
  "skinColour",
  "whitePatches",
  "points",
  "whitePatchesTint",
  "vitiligo",
  "accessory",
  "scar",
  "tortieMask",
  "tortiePattern",
  "tortieColour",
  "sprite",
] as const;

type ParamTimingKey = (typeof PARAM_TIMING_ORDER)[number];

interface SpinTimingConfig {
  allowFastFlips: boolean;
  delays: Partial<Record<ParamTimingKey, number>>;
  subsetLimits?: Partial<Record<ParamTimingKey, boolean>>;
  pauseDelays?: { flashyMs: number; calmMs: number };
}

interface V1Payload {
  v: 1;
  timing: SpinTimingConfig;
}

// Default normal delays per parameter
const NORMAL_DELAYS: Record<ParamTimingKey, number> = {
  colour: 180,
  pelt: 180,
  eyeColour: 160,
  eyeColour2: 160,
  tint: 170,
  skinColour: 170,
  whitePatches: 190,
  points: 170,
  whitePatchesTint: 160,
  vitiligo: 170,
  accessory: 190,
  scar: 190,
  tortieMask: 210,
  tortiePattern: 210,
  tortieColour: 210,
  sprite: 190,
};

const FAST_DELAYS: Record<ParamTimingKey, number> = {
  colour: 150,
  pelt: 150,
  eyeColour: 130,
  eyeColour2: 130,
  tint: 140,
  skinColour: 140,
  whitePatches: 150,
  points: 140,
  whitePatchesTint: 130,
  vitiligo: 140,
  accessory: 150,
  scar: 150,
  tortieMask: 170,
  tortiePattern: 170,
  tortieColour: 170,
  sprite: 150,
};

const SLOW_DELAYS: Record<ParamTimingKey, number> = {
  colour: 360,
  pelt: 360,
  eyeColour: 320,
  eyeColour2: 320,
  tint: 340,
  skinColour: 340,
  whitePatches: 380,
  points: 340,
  whitePatchesTint: 320,
  vitiligo: 340,
  accessory: 380,
  scar: 380,
  tortieMask: 420,
  tortiePattern: 420,
  tortieColour: 420,
  sprite: 380,
};

// --- Helpers ---

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomDelays(): Partial<Record<ParamTimingKey, number>> {
  const d: Partial<Record<ParamTimingKey, number>> = {};
  for (const key of PARAM_TIMING_ORDER) {
    d[key] = rand(45, 500);
  }
  return d;
}

function jitterDelays(base: Record<ParamTimingKey, number>, range: number): Partial<Record<ParamTimingKey, number>> {
  const d: Partial<Record<ParamTimingKey, number>> = {};
  for (const key of PARAM_TIMING_ORDER) {
    d[key] = Math.max(45, base[key] + rand(-range, range));
  }
  return d;
}

function tweakFew(base: Record<ParamTimingKey, number>, count: number, range: number): Partial<Record<ParamTimingKey, number>> {
  const d: Partial<Record<ParamTimingKey, number>> = { ...base };
  const keys = pickN(PARAM_TIMING_ORDER, count);
  for (const key of keys) {
    d[key] = Math.max(45, base[key] + rand(-range, range));
  }
  return d;
}

function randomSubsetLimits(count: number): Partial<Record<ParamTimingKey, boolean>> {
  const limits: Partial<Record<ParamTimingKey, boolean>> = {};
  const keys = pickN(PARAM_TIMING_ORDER, count);
  for (const key of keys) {
    limits[key] = true;
  }
  return limits;
}

// --- Category generators ---

type SlugRecord = { slug: string; category: string; config: V1Payload };

const configs: Array<{ category: string; config: V1Payload }> = [];

// Near-defaults (~5): normal presets with 1-3 params randomly tweaked ±20ms
for (let i = 0; i < 5; i++) {
  configs.push({
    category: "near-defaults",
    config: {
      v: 1,
      timing: {
        allowFastFlips: false,
        delays: tweakFew(NORMAL_DELAYS, rand(1, 3), 20),
        subsetLimits: {},
        pauseDelays: { flashyMs: 1000, calmMs: 1000 },
      },
    },
  });
}

// All-fast (~5): fast presets with slight per-param jitter ±10ms
for (let i = 0; i < 5; i++) {
  configs.push({
    category: "all-fast",
    config: {
      v: 1,
      timing: {
        allowFastFlips: true,
        delays: jitterDelays(FAST_DELAYS, 10),
        subsetLimits: {},
        pauseDelays: { flashyMs: 1000, calmMs: 1000 },
      },
    },
  });
}

// All-slow (~5): slow presets with slight per-param jitter
for (let i = 0; i < 5; i++) {
  configs.push({
    category: "all-slow",
    config: {
      v: 1,
      timing: {
        allowFastFlips: false,
        delays: jitterDelays(SLOW_DELAYS, 15),
        subsetLimits: {},
        pauseDelays: { flashyMs: 1000, calmMs: 1000 },
      },
    },
  });
}

// Fully random delays (~30)
for (let i = 0; i < 30; i++) {
  configs.push({
    category: "random-delays",
    config: {
      v: 1,
      timing: {
        allowFastFlips: Math.random() > 0.5,
        delays: randomDelays(),
        subsetLimits: {},
        pauseDelays: { flashyMs: 1000, calmMs: 1000 },
      },
    },
  });
}

// Random + subset limits (~15)
for (let i = 0; i < 15; i++) {
  configs.push({
    category: "random-subset-limits",
    config: {
      v: 1,
      timing: {
        allowFastFlips: Math.random() > 0.5,
        delays: randomDelays(),
        subsetLimits: randomSubsetLimits(rand(2, 6)),
        pauseDelays: { flashyMs: 1000, calmMs: 1000 },
      },
    },
  });
}

// Random + custom pauses (~15)
for (let i = 0; i < 15; i++) {
  configs.push({
    category: "random-custom-pauses",
    config: {
      v: 1,
      timing: {
        allowFastFlips: Math.random() > 0.5,
        delays: randomDelays(),
        subsetLimits: {},
        pauseDelays: { flashyMs: rand(1000, 10000), calmMs: rand(1000, 10000) },
      },
    },
  });
}

// Sparse payloads (~10): no subsetLimits key, no pauseDelays key
for (let i = 0; i < 10; i++) {
  configs.push({
    category: "sparse",
    config: {
      v: 1,
      timing: {
        allowFastFlips: Math.random() > 0.5,
        delays: randomDelays(),
      },
    } as V1Payload,
  });
}

// Edge cases (~15)
// All-45ms (minimum)
configs.push({
  category: "edge-all-min",
  config: {
    v: 1,
    timing: {
      allowFastFlips: true,
      delays: Object.fromEntries(PARAM_TIMING_ORDER.map((k) => [k, 45])),
      subsetLimits: {},
      pauseDelays: { flashyMs: 1000, calmMs: 1000 },
    },
  },
});

// All-500ms (maximum)
configs.push({
  category: "edge-all-max",
  config: {
    v: 1,
    timing: {
      allowFastFlips: false,
      delays: Object.fromEntries(PARAM_TIMING_ORDER.map((k) => [k, 500])),
      subsetLimits: {},
      pauseDelays: { flashyMs: 1000, calmMs: 1000 },
    },
  },
});

// Only 1 param set (rest omitted)
for (let i = 0; i < 3; i++) {
  const key = pick(PARAM_TIMING_ORDER);
  configs.push({
    category: "edge-single-param",
    config: {
      v: 1,
      timing: {
        allowFastFlips: Math.random() > 0.5,
        delays: { [key]: rand(45, 500) },
      },
    } as V1Payload,
  });
}

// 8 params with subsets + 8 without
for (let i = 0; i < 3; i++) {
  const subsetKeys = pickN(PARAM_TIMING_ORDER, 8);
  const limits: Partial<Record<ParamTimingKey, boolean>> = {};
  for (const k of subsetKeys) limits[k] = true;
  configs.push({
    category: "edge-half-subset",
    config: {
      v: 1,
      timing: {
        allowFastFlips: Math.random() > 0.5,
        delays: randomDelays(),
        subsetLimits: limits,
        pauseDelays: { flashyMs: 1000, calmMs: 1000 },
      },
    },
  });
}

// pauseDelays at min/max boundaries
configs.push({
  category: "edge-pause-min",
  config: {
    v: 1,
    timing: {
      allowFastFlips: false,
      delays: randomDelays(),
      subsetLimits: {},
      pauseDelays: { flashyMs: 1000, calmMs: 1000 },
    },
  },
});

configs.push({
  category: "edge-pause-max",
  config: {
    v: 1,
    timing: {
      allowFastFlips: false,
      delays: randomDelays(),
      subsetLimits: {},
      pauseDelays: { flashyMs: 10000, calmMs: 10000 },
    },
  },
});

// Mixed edge cases: very fast + very slow params
for (let i = 0; i < 4; i++) {
  const delays: Partial<Record<ParamTimingKey, number>> = {};
  for (const key of PARAM_TIMING_ORDER) {
    delays[key] = Math.random() > 0.5 ? rand(45, 60) : rand(400, 500);
  }
  configs.push({
    category: "edge-mixed-extremes",
    config: {
      v: 1,
      timing: {
        allowFastFlips: true,
        delays,
        subsetLimits: randomSubsetLimits(rand(0, 4)),
        pauseDelays: { flashyMs: rand(1000, 10000), calmMs: rand(1000, 10000) },
      },
    },
  });
}

// --- Post to API ---

async function main() {
  console.log(`Seeding ${configs.length} v1 timing presets...\n`);

  const results: SlugRecord[] = [];
  let success = 0;
  let fail = 0;

  for (const { category, config } of configs) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`  FAIL [${category}] ${res.status}: ${text}`);
        fail++;
        continue;
      }
      const json = (await res.json()) as { slug: string };
      const delays = config.timing.delays;
      const delayValues = Object.values(delays).filter((v): v is number => typeof v === "number");
      const minDelay = delayValues.length ? Math.min(...delayValues) : 0;
      const maxDelay = delayValues.length ? Math.max(...delayValues) : 0;
      const subsetCount = config.timing.subsetLimits ? Object.keys(config.timing.subsetLimits).length : 0;
      const hasPause = !!config.timing.pauseDelays;

      console.log(
        `  OK  [${category}] slug=${json.slug}  delays=${minDelay}-${maxDelay}ms  subsets=${subsetCount}  fastFlips=${config.timing.allowFastFlips}  pauses=${hasPause}`,
      );
      results.push({ slug: json.slug, category, config });
      success++;
    } catch (err) {
      console.error(`  FAIL [${category}]`, err);
      fail++;
    }
  }

  console.log(`\nDone: ${success} created, ${fail} failed.`);

  const outPath = new URL("../tmp/test-v1-slugs.json", import.meta.url).pathname;
  await Bun.write(outPath, JSON.stringify(results, null, 2));
  console.log(`Saved to ${outPath}`);
}

main().catch(console.error);
