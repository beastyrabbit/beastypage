"""Renders Scene Planner tile sheets in Blender.

    blender -b --factory-startup -P scripts/scene-tiles/run.py -- \
        --sheet lake [--sheet pond] [--key square:] [--threads 4]

Each sheet is built by a module: elements/<element>.py for element tiles,
ground.py for empty land, edges.py and combos.py for overlays. A module defines

    PALETTE = [...]           # optional colours tiles snap to (default: all
                              # tilekit.BASE colours with a shade either side)
    def build(tile): ...      # makes the geometry for one tile and frame

Output in scripts/scene-tiles/out/:
    sheets/<sheet>.png        one row per tile, one column per frame
    sheets/<sheet>.glow.png   self-lit pixels, if any
    sheets/<sheet>.json       key → [row, frames]
    preview/<sheet>.png       sample groups on a backdrop, 4x, every frame
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import tempfile
import time
import traceback

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import tilekit as kit  # noqa: E402

CELL = 16


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=os.path.join(HERE, "out", "manifest.json"))
    parser.add_argument("--out", default=os.path.join(HERE, "out"))
    parser.add_argument("--sheet", action="append", required=True)
    parser.add_argument("--key", default="", help="only render keys containing this")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--supersample", type=int, default=4)
    return parser.parse_args(argv)


def load_builder(sheet: str):
    name = sheet if sheet in ("ground", "edges", "combos") else os.path.join("elements", sheet)
    path = os.path.join(HERE, f"{name}.py")
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    spec = importlib.util.spec_from_file_location(f"builder_{sheet.replace('-', '_')}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

_holdout: bpy.types.Material | None = None


def holdout() -> bpy.types.Material:
    global _holdout
    if _holdout is None:
        _holdout = bpy.data.materials.new("tk-holdout")
        if hasattr(_holdout, "use_nodes"):
            _holdout.use_nodes = True
        nodes = _holdout.node_tree.nodes
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        hold = nodes.new("ShaderNodeHoldout")
        _holdout.node_tree.links.new(hold.outputs[0], out.inputs["Surface"])
    return _holdout


def render(path: str, factor: int, palette):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return kit.downsample(kit.read_png(path), factor, palette)


def glow_pass(path: str, factor: int):
    """Renders only self-lit surfaces; everything else blocks them."""
    swapped = []
    colours = set()
    for obj in bpy.context.scene.objects:
        if obj.type not in {"MESH", "CURVE", "SURFACE", "META", "FONT"}:
            continue
        for slot in obj.material_slots:
            if slot.material is None:
                continue
            if "glow" in slot.material:
                colours.add(slot.material["glow"])
            else:
                swapped.append((slot, slot.material))
                slot.material = holdout()
    if not colours:
        for slot, material in swapped:
            slot.material = material
        return None
    palette = [c for value in colours for c in (value, kit.shade(value, 0.8), kit.shade(value, 1.15))]
    try:
        return render(path, factor, palette)
    finally:
        for slot, material in swapped:
            slot.material = material


def uses_glow() -> bool:
    for obj in bpy.context.scene.objects:
        for slot in getattr(obj, "material_slots", []):
            if slot.material is not None and "glow" in slot.material:
                return True
    return False


def render_sheet(sheet: str, jobs: list[dict], args, manifest: dict) -> int:
    builder = load_builder(sheet)
    palette = getattr(builder, "PALETTE", None) or kit.GLOBAL_PALETTE
    factor = args.supersample
    kit.setup_scene(CELL * factor, args.threads)

    columns = max(job["frames"] for job in jobs)
    tiles = np.zeros((len(jobs), CELL, columns * CELL, 4), dtype=np.float32)
    glows = np.zeros_like(tiles)
    any_glow = False
    errors = 0
    tmp = tempfile.mkdtemp(prefix=f"tiles-{sheet}-")
    started = time.time()

    for row, job in enumerate(jobs):
        for frame in range(job["frames"]):
            tile = kit.Tile(job, frame)
            kit.clear()
            try:
                builder.build(tile)
            except Exception:
                errors += 1
                print(f"[{sheet}] build failed for {job['key']} frame {frame}")
                traceback.print_exc()
                continue
            path = os.path.join(tmp, "frame.png")
            pixels = render(path, factor, palette)
            glow = glow_pass(os.path.join(tmp, "glow.png"), factor) if uses_glow() else None
            # Short loops repeat to fill the sheet's columns.
            for col in range(frame, columns, job["frames"]):
                x = col * CELL
                tiles[row, :, x : x + CELL] = pixels
                if glow is not None:
                    glows[row, :, x : x + CELL] = glow
                    any_glow = True
        if (row + 1) % 25 == 0:
            print(f"[{sheet}] {row + 1}/{len(jobs)} tiles, {time.time() - started:.0f}s")

    out = os.path.join(args.out, "sheets")
    os.makedirs(out, exist_ok=True)
    sheet_pixels = tiles.reshape(len(jobs) * CELL, columns * CELL, 4)
    kit.write_png(os.path.join(out, f"{sheet}.png"), sheet_pixels)
    entry = {
        "sheet": sheet,
        "file": f"{sheet}.png",
        "columns": columns,
        "tiles": {job["key"]: [row, job["frames"]] for row, job in enumerate(jobs)},
    }
    if any_glow:
        kit.write_png(
            os.path.join(out, f"{sheet}.glow.png"),
            glows.reshape(len(jobs) * CELL, columns * CELL, 4),
        )
        entry["glow"] = f"{sheet}.glow.png"
    with open(os.path.join(out, f"{sheet}.json"), "w") as fh:
        json.dump(entry, fh)

    write_preview(sheet, jobs, tiles, glows if any_glow else None, args, manifest)
    print(
        f"[{sheet}] done: {len(jobs)} tiles in {time.time() - started:.0f}s, "
        f"{errors} errors"
    )
    return errors


# ---------------------------------------------------------------------------
# Preview
# ---------------------------------------------------------------------------

SAMPLES = {
    "single": [[(0, 0)]],
    "row": [[(x, 0) for x in range(5)], [(x, y) for x in range(4) for y in range(2)]],
    "column": [[(0, y) for y in range(4)], [(x, y) for x in range(2) for y in range(4)]],
    "square": [[(x, y) for x in range(3) for y in range(3)]],
    "mass": [[(x, y) for x in range(5) for y in range(3) if (x, y) not in {(0, 0), (4, 0), (4, 1)}]],
    "path": [[(1, 0), (1, 1), (2, 1), (2, 2), (2, 3), (1, 3), (0, 3), (0, 4)]],
}

MATERIAL_COLOURS = {
    "water": "water",
    "sand": "sand",
    "rock": "rock",
    "ground": "meadow",
    "foliage": "foliage",
    "built": "asphalt",
    "wood": "wood",
    "air": "#8fc1ea",
    "cloud": "cloud",
}


def mask_of(cells: set, x: int, y: int) -> int:
    """y grows downward, like grid rows."""
    mask = 0
    if (x, y - 1) in cells:
        mask |= kit.N
    if (x + 1, y) in cells:
        mask |= kit.E
    if (x, y + 1) in cells:
        mask |= kit.S
    if (x - 1, y) in cells:
        mask |= kit.W
    return mask


def fill(canvas, x, y, colour):
    canvas[y * CELL : (y + 1) * CELL, x * CELL : (x + 1) * CELL, :3] = kit.rgb(kit.BASE.get(colour, colour))
    canvas[y * CELL : (y + 1) * CELL, x * CELL : (x + 1) * CELL, 3] = 1


def over(canvas, x, y, tile):
    region = canvas[y * CELL : (y + 1) * CELL, x * CELL : (x + 1) * CELL]
    a = tile[..., 3:4]
    region[...] = tile * a + region * (1 - a)


def write_preview(sheet, jobs, tiles, glows, args, manifest):
    index = {job["key"]: row for row, job in enumerate(jobs)}
    frames = tiles.shape[2] // CELL
    panels = []

    def frame_of(row, f):
        tile = tiles[row, :, f * CELL : (f + 1) * CELL].copy()
        if glows is not None:
            g = glows[row, :, f * CELL : (f + 1) * CELL]
            tile = g * g[..., 3:4] + tile * (1 - g[..., 3:4])
        return tile

    if sheet == "ground":
        # Each zone as a 6 x 3 field with alternatives scattered as in the app.
        for zone in ("far", "mid", "front"):
            panel = np.zeros((3 * CELL, 6 * CELL * frames, 4), dtype=np.float32)
            for f in range(frames):
                for y in range(3):
                    for x in range(6):
                        alt = (x * 7 + y * 13) % 4
                        over(panel, x + 6 * f, y, frame_of(index[f"{zone}:{alt}"], f))
            panels.append(panel)
    elif sheet in ("edges", "combos"):
        for job in jobs:
            row = index[job["key"]]
            p = job["params"]
            side = p["side"]
            src = MATERIAL_COLOURS.get(p.get("from", ""), "#b08a5a")
            onto = MATERIAL_COLOURS.get(p.get("onto", ""), "meadow")
            if sheet == "combos":
                combo = next(c for c in manifest["combos"] if c["id"] == p["combo"])
                src = manifest["elements"].get(combo["from"][0], {}).get("color", "#888888")
                first = combo["onto"][0]
                onto = (
                    "meadow" if first == "empty-ground"
                    else "#8fc1ea" if first == "empty-sky"
                    else manifest["elements"].get(first, {}).get("color", "#888888")
                )
            dx, dy = {"N": (0, -1), "E": (1, 0), "S": (0, 1), "W": (-1, 0)}[side]
            panel = np.zeros((3 * CELL, 3 * CELL * frames, 4), dtype=np.float32)
            for f in range(frames):
                for y in range(3):
                    for x in range(3):
                        fill(panel, x + 3 * f, y, onto)
                fill(panel, 1 + dx + 3 * f, 1 + dy, src)
                over(panel, 1 + 3 * f, 1, frame_of(row, f))
            panels.append(panel)
    else:
        spec = manifest["elements"][sheet]
        backdrop = "#8fc1ea" if "sky" in (spec.get("zones") or []) else "meadow"
        alts = spec.get("alts") or 1
        for shape in spec["shapes"]:
            for variant in ["base", *(spec.get("variants") or [])]:
                for sample in SAMPLES[shape]:
                    cells = set(sample)
                    w = max(x for x, _ in cells) + 3
                    h = max(y for _, y in cells) + 3
                    panel = np.zeros((h * CELL, w * CELL * frames, 4), dtype=np.float32)
                    for f in range(frames):
                        for y in range(h):
                            for x in range(w):
                                fill(panel, x + w * f, y, backdrop)
                        for x, y in cells:
                            alt = (y * 7 if spec.get("altByRow") else x * 7 + y * 13) % alts
                            key = f"{shape}:{mask_of(cells, x, y)}:{variant}:{alt}"
                            if key in index:
                                over(panel, x + 1 + w * f, y + 1, frame_of(index[key], f))
                    panels.append(panel)

    width = max(p.shape[1] for p in panels)
    gap = CELL // 2
    height = sum(p.shape[0] + gap for p in panels)
    sheet_img = np.zeros((height, width, 4), dtype=np.float32)
    sheet_img[..., :3] = 0.12
    sheet_img[..., 3] = 1
    y = 0
    for p in panels:
        sheet_img[y : y + p.shape[0], : p.shape[1]] = p
        y += p.shape[0] + gap
    big = sheet_img.repeat(4, axis=0).repeat(4, axis=1)
    out = os.path.join(args.out, "preview")
    os.makedirs(out, exist_ok=True)
    kit.write_png(os.path.join(out, f"{sheet}.png"), big)


def main():
    args = parse_args()
    with open(args.manifest) as fh:
        manifest = json.load(fh)
    errors = 0
    for sheet in args.sheet:
        jobs = [j for j in manifest["jobs"] if j["sheet"] == sheet and args.key in j["key"]]
        if not jobs:
            print(f"[{sheet}] no jobs")
            errors += 1
            continue
        try:
            errors += render_sheet(sheet, jobs, args, manifest)
        except FileNotFoundError as error:
            print(f"[{sheet}] no builder: {error}")
            errors += 1
    sys.exit(1 if errors else 0)


main()
