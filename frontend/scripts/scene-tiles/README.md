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
blender -b --factory-startup --python-exit-code 1 -P scripts/scene-tiles/run.py -- --sheet lake --threads 3
# sheet:   scripts/scene-tiles/out/sheets/lake.png
# preview: scripts/scene-tiles/out/preview/lake.png (sample groups, every frame, 4x)
```

`--key square:` limits the run to matching keys while iterating. Such a sheet
is for the preview only: the pack refuses any staged sheet that misses tiles
from the manifest, so render it in full before publishing.

## Full run

```sh
pnpm exec tsx scripts/scene-tiles/manifest.ts
node scripts/scene-tiles/render.mjs --jobs 6 --threads 3   # renders, then packs
```

Renders are deterministic: an unchanged builder reproduces its sheet byte for
byte, so a diff in `public/scene-planner/tiles/` is always a real change.

The script uses `/usr/bin/blender` on Linux. On macOS, it uses
`/Applications/Blender.app/Contents/MacOS/Blender` when that file exists.
Set `BLENDER` to an absolute executable path to override the default:

```sh
BLENDER=/opt/blender/blender node scripts/scene-tiles/render.mjs --jobs 6 --threads 3
```

`node scripts/scene-tiles/render.mjs --help` prints usage without rendering or packing.

`--jobs` and `--threads` require positive integers. The Python runner also
requires a positive `--supersample`. Keep `--python-exit-code 1` before `-P`
when invoking Blender directly so Python exceptions fail the command.

The pack checks every indexed row, frame count, PNG dimension, and image
decode before writing. It stages the complete set beside the target, then
replaces the target directory, restoring the previous set if the move fails.
To check a render without changing `public/`, use a temporary target:

```sh
SCENE_TILES_TARGET="$(mktemp -d)/tiles" pnpm exec tsx scripts/scene-tiles/pack.ts
```

`SCENE_TILES_SOURCE` and `SCENE_TILES_MANIFEST` override the default
`scripts/scene-tiles/out/sheets` and `scripts/scene-tiles/out/manifest.json`
paths. Tests can also call `packTiles({ source, target, manifest })` directly.
