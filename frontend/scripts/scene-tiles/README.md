# Scene Planner tiles

Blender renders the Scene Planner's pixel tiles: 16 × 16 px per grid cell,
up to four animation frames, packed into sheets under
`public/scene-planner/tiles/`. The renderer falls back to its procedural
placeholder art for anything missing.

## The list

`lib/scene-planner/tileset.ts` defines every tile:

- **Element tiles**: element × shape class (single, row, column, square, mass,
  path) × neighbour mask (N=1, E=2, S=4, W=8) × variant (base, night, moon,
  aurora) × alternative.
- **Edges**: a material spilling into the next cell (`foliage>water:N` is
  grass and leaves on a water cell whose north side touches foliage).
- **Combos**: special overlays where two elements meet, such as `fall-splash`.

```sh
pnpm exec tsx scripts/scene-tiles/manifest.ts   # writes out/manifest.json
```

## Builders

One Python module per sheet: `elements/<element>.py`, `edges.py`,
`combos.py`. Each defines `build(tile)` and optionally `PALETTE`. Read the
docstring at the top of `tilekit.py` for the coordinate contract and
`elements/lake.py` for a worked example.

Render and check one sheet (from `frontend/`):

```sh
blender -b --factory-startup -P scripts/scene-tiles/run.py -- --sheet lake --threads 3
# sheet:   scripts/scene-tiles/out/sheets/lake.png
# preview: scripts/scene-tiles/out/preview/lake.png (sample groups, every frame, 4x)
```

`--key square:` limits the run to matching keys while iterating.

## Full run

```sh
pnpm exec tsx scripts/scene-tiles/manifest.ts
node scripts/scene-tiles/render.mjs --jobs 6 --threads 3   # renders, then packs
```

On a Mac, point `BLENDER` at `/Applications/Blender.app/Contents/MacOS/Blender`.
