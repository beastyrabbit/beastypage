"""Asphalt paths with curved bends, dashed centrelines and stone kerbs."""

import math

import tilekit as kit
import waterkit

PALETTE = kit.ramp("asphalt", "rockDark", "rock", "rockLight", "paint")


def _path(tile, x, z):
    # Rotate each bend to NE, a quarter circle centred at the outer corner.
    bend = waterkit.bend_coordinates(tile.mask, x, z)
    if bend is not None:
        return _bend(*bend)
    arms = []
    for present, bx, bz, along in (
        (tile.n, 0.5, 1.5, 1 - z), (tile.e, 1.5, 0.5, 1 - x),
        (tile.s, 0.5, -0.5, z), (tile.w, -0.5, 0.5, x),
    ):
        if present:
            arms.append((waterkit.segment_distance(x, z, 0.5, 0.5, bx, bz), 0.10 < along < 0.31))
    if not arms:
        return waterkit.segment_distance(x, z, 0.36, 0.5, 0.64, 0.5), 0.39 < x < 0.61
    distance = min(d for d, _ in arms)
    # No centre paint in the middle of a junction.
    return distance, any(d < 0.045 and dash for d, dash in arms)


def _bend(u, v):
    if v > 1:
        return abs(u - 0.5), False
    if u > 1:
        return abs(v - 0.5), False
    distance = abs(math.hypot(1 - u, 1 - v) - 0.5)
    along = 0.5 * math.atan2(1 - v, 1 - u)
    # Symmetric dash placement leaves the same gap at both tile exits.
    dash = 0.085 < along < 0.27 or math.pi / 4 - 0.27 < along < math.pi / 4 - 0.085
    return distance, dash


def _material(tile, x, z):
    distance, dash = _path(tile, x, z)
    if tile.fill:
        # Sparse, low-contrast aggregate; no kerbs or centre paint.
        pixel = (math.floor(x * 16) % 16, math.floor(z * 16) % 16)
        return 1 if pixel in ((3, 4), (10, 7), (6, 12)) else 0
    if distance > 0.385:
        return None
    if distance < 0.31:
        return 3 if distance < 0.045 and dash else 0
    # Dark gutter inside a broad, pale kerb.
    return 1 if distance < 0.335 else 2


def build(tile):
    materials = [kit.mat(name) for name in ("asphalt", "rockDark", "rockLight", "paint")]
    verts, groups = [], [[] for _ in materials]
    steps = 64
    # Extend past the crop to keep open edges free of side faces/shadows.
    for j in range(-4, steps + 4):
        for i in range(-4, steps + 4):
            x, z = (i + 0.5) / steps, (j + 0.5) / steps
            material = _material(tile, x, z)
            if material is None:
                continue
            waterkit.add_surface_pixel(verts, groups, material, i, j, steps)
    waterkit.draw_surface(verts, groups, materials, "road-surface")
