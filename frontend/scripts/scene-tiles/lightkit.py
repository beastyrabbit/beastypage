"""A street lamp's pool of light on the ground.

The pool is one flat shape centred on the lamp's base line. Behind that line
it spreads wide along the ground into the cells left and right of the foot;
in front of it, a short lip stays inside the lamp's own column, so no part
falls into a diagonal cell that no tile could draw. The lamp's foot tile
draws the middle; combo tiles draw the ends and the lip on the neighbours.

Coordinates are pixels counted from the top-left of the lamp's foot cell, so
a neighbour samples the same shape with an offset of 16 per cell.
"""

import tilekit as kit

# Warm light tones. Glow pixels skip the night darkening, so these stay lit.
LIT = {"lit-core": "#ffd27a", "lit-mid": "#e3c58c", "lit-edge": "#c9a66b"}

BASE_X, BASE_Y = 8, 15.5
SPREAD = 19
SPREAD_DEPTH = 4.5
LIP = 7
LIP_DEPTH = 3
# The flame breathes a little, widening and narrowing the pool.
PULSE = (0, 0.7, 0.35, -0.5)


def material(name):
    material = kit.glow(LIT[name], strength=0.65)
    # Alpha cuts to binary in tilekit, so the faint rim relies on sparse
    # pixels, not transparency, to keep the scenery underneath visible.
    if name == "lit-edge":
        material.node_tree.nodes.get("Principled BSDF").inputs["Alpha"].default_value = 0.7
    return material


def _distance(gx, gy, frame):
    x = gx + 0.5 - BASE_X
    y = gy + 0.5 - BASE_Y
    pulse = PULSE[frame % 4]
    if y <= 0:
        return (x / (SPREAD + pulse)) ** 2 + (y / SPREAD_DEPTH) ** 2
    if 0 <= gx < 16:
        return (x / (LIP + pulse / 2)) ** 2 + (y / LIP_DEPTH) ** 2
    return None


def pool(gx, gy, frame):
    """Light tone at a pixel, or None. Dense near the lamp, sparse outwards,
    so it reads as light falling on the ground, not as paint."""
    d = _distance(gx, gy, frame)
    if d is None or d > 1:
        return None
    even = (gx + gy) % 2 == 0
    if d < 0.22:
        return "lit-core" if even else "lit-mid"
    if d < 0.55:
        return "lit-mid" if even else None
    return "lit-edge" if (gx + 2 * gy) % 4 == 0 else None


def cell(dx, dy, frame):
    """The pool's pixels inside the cell dx, dy cells from the lamp's foot,
    as {(column, row): tone} with rows counted from the top."""
    pixels = {}
    for column in range(16):
        for row in range(16):
            tone = pool(column + 16 * dx, row + 16 * dy, frame)
            if tone is not None:
                pixels[column, row] = tone
    return pixels


def draw(pixels, y, name="lamp-pool"):
    """Pixels as flat glowing quads facing the camera at depth y."""
    batches = {}
    for (column, row), tone in pixels.items():
        verts, faces = batches.setdefault(tone, ([], []))
        x0, x1 = column / 16, (column + 1) / 16
        z0, z1 = 1 - (row + 1) / 16, 1 - row / 16
        start = len(verts)
        verts.extend(((x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)))
        faces.append((start, start + 1, start + 2, start + 3))
    for tone, (verts, faces) in batches.items():
        kit.mesh(verts, faces, material(tone), name=name)
