"""Broad apple crowns in staggered planted rows, with short trunks and lanes."""

import math

import tilekit as kit

PALETTE = kit.ramp("foliageDark", "foliage", "trunk", "red", "grassLight")
P = 1 / 16


def _poly(points, color, front):
    obj = kit.prism([(x * P, z * P) for x, z in points],
                    kit.mat(color), front, front + 0.01)
    obj.visible_shadow = False
    obj.visible_diffuse = False
    obj.visible_glossy = False


def _box(x0, z0, x1, z1, color, front=-0.3):
    _poly([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], color, front)


def _crown(x, z, radius, color, front):
    points = [(-1, -0.5), (-0.75, -0.85), (-0.25, -1), (0.5, -0.9),
              (0.9, -0.5), (1, 0.15), (0.75, 0.7), (0.25, 1),
              (-0.4, 0.95), (-0.85, 0.55)]
    _poly([(x + dx * radius, z + dz * radius) for dx, dz in points], color, front)


def _tree(tile, x, foot, radius, phase):
    rustle = 0.35 * math.sin(2 * math.pi * tile.t + phase)
    z = foot + radius + 2
    front = -0.55 + foot * 0.012
    _box(x - 3, foot, x + 3, foot + 1, "foliageDark", front + 0.08)
    _box(x - 1, foot, x + 1, z - 1, "trunk", front + 0.04)
    _crown(x + rustle, z, radius, "foliageDark", front)
    _crown(x - 0.4 + rustle, z + 0.5, radius - 0.9, "foliage", front - 0.02)
    _crown(x - 1.2 + rustle, z + 1.8, radius * 0.48, "grassLight", front - 0.04)
    for dx, dz in ((-2.5, 0.5), (1.5, -2), (2, 2), (-1.5, 3)):
        # Alternative fruit positions stay inside the crown and away from
        # cell borders. Anything touching a join is identical in both alts.
        ax, az = x + dx + rustle, z + dz
        if tile.alt and 2 < ax < 13 and 2 < az < 13:
            ax += 0.75
        _box(ax - 0.6, az - 0.6, ax + 0.6, az + 0.6, "red", front - 0.06)


def build(tile):
    left, right = (-1 if tile.w else 1), (17 if tile.e else 15)
    if tile.shape == "single":
        _box(2, 0, 14, 2, "foliage")
        _tree(tile, 8, 1, 5.8, 0)
        return

    if tile.shape == "row":
        # Overlapping eleven-pixel crowns, with an uninterrupted mown lane.
        _box(left, 0, right, 3, "foliage", -0.1)
        _box(left, 1, right, 2, "grassLight", -0.12)
        for dx in (-1, 0, 1):
            if not tile.has(dx, 0):
                continue
            for x in (4.5, 12.5):
                if dx == 0:
                    if not tile.w and x < 8:
                        x = 5.5
                    if not tile.e and x > 8:
                        x = 10.5
                _tree(tile, x + 16 * dx, 1, 5.2, 0)
        return

    # Two trees per cell rather than four tiny ones. Adjacent planting rows
    # are offset by half a cell; neighbouring crowns overlap across joins.
    trees = []
    for dz in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if not tile.has(dx, dz):
                continue
            for x, foot, radius, phase in ((5.5, 8, 5.2, 0.7), (13, 0, 5.5, 0)):
                if not tile.n and dz == 0 and foot == 8:
                    foot = 3
                if not tile.e and dx == 0 and x > 8:
                    x = 10.5
                trees.append((x + dx * 16, foot + dz * 16, radius, phase))
    for z in (0, 8):
        _box(left, z, right, z + 3, "foliage", -0.1)
        _box(left, z + 1, right, z + 2, "grassLight", -0.12)
    for x, foot, radius, phase in sorted(trees, key=lambda tree: -tree[1]):
        _tree(tile, x, foot, radius, phase)
