"""Rounded dirt paths; two interiors share identical periodic grass verges."""

import math

import tilekit as kit
import waterkit

PALETTE = kit.ramp("dirt", "dirtLight", "sandDark", "grass", "grassLight", "rock")


def _distance(tile, x, z):
    # A straight collar makes the entire border pixel identical for bends,
    # junctions and straight runs, including supersampled coverage.
    if (tile.n and z > 0.91) or (tile.s and z < 0.09):
        return abs(x - 0.5)
    if (tile.e and x > 0.91) or (tile.w and x < 0.09):
        return abs(z - 0.5)
    bend = waterkit.bend_coordinates(tile.mask, x, z)
    if bend is not None:
        return _bend_distance(*bend)
    arms = [(0.5, 1.5, tile.n), (1.5, 0.5, tile.e),
            (0.5, -0.5, tile.s), (-0.5, 0.5, tile.w)]
    distances = [waterkit.segment_distance(x, z, 0.5, 0.5, bx, bz) for bx, bz, present in arms if present]
    return min(distances) if distances else waterkit.segment_distance(x, z, 0.40, 0.5, 0.60, 0.5)


def _bend_distance(u, v):
    if v > 1:
        return abs(u - 0.5)
    if u > 1:
        return abs(v - 0.5)
    return abs(math.hypot(1 - u, 1 - v) - 0.5)


def _track(x, z, distance, stones):
    # A broken worn track provides some texture at pixel scale.
    wear = math.cos(4 * math.pi * x) * math.cos(4 * math.pi * z)
    material = 0
    if distance > 0.15 and wear > 0.55:
        material = 2
    for k, (sx, sz, radius) in enumerate(stones):
        if ((x - sx) / 1.25) ** 2 + (z - sz) ** 2 < radius ** 2:
            return 5 if k % 3 == 0 else 2
    return material


def _material(tile, x, z, stones):
    distance = _distance(tile, x, z)
    # Whole-unit periodic detail keeps all open joins consistent.
    ripple = 0.013 * math.cos(6 * math.pi * x) * math.cos(6 * math.pi * z)
    if not tile.fill and distance > 0.355 + ripple:
        return None
    if not tile.fill and distance > 0.30 + ripple:
        grass = math.cos(8 * math.pi * x) * math.cos(8 * math.pi * z)
        return 4 if grass > 0.3 else 3
    if not tile.fill and distance > 0.245 + ripple:
        return 1
    return _track(x, z, distance, stones)


def build(tile):
    names = ("dirtLight", "dirt", "sandDark", "grass", "grassLight", "rock")
    materials = [kit.mat(name) for name in names]
    verts, groups = [], [[] for _ in materials]
    # Interior pebbles stay clear of every cell edge, even across alts.
    rng = tile.rng("trail-pebbles")
    stones = [(rng.uniform(0.18, 0.82), rng.uniform(0.18, 0.82), rng.uniform(0.035, 0.055))
              for _ in range(5)]
    steps = 64
    for j in range(-4, steps + 4):
        for i in range(-4, steps + 4):
            x, z = (i + 0.5) / steps, (j + 0.5) / steps
            material = _material(tile, x, z, stones)
            if material is None:
                continue
            waterkit.add_surface_pixel(verts, groups, material, i, j, steps)
    waterkit.draw_surface(verts, groups, materials, "trail-surface")
