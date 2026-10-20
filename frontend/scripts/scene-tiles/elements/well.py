"""Round stone well with an open dark mouth, roof, rope and wooden bucket."""

import math

import tilekit as kit
from fieldkit import box as _box, poly as _poly

PALETTE = kit.ramp("rock", "rockLight", "rockDark", "wood", "sandDark")


def _ellipse(x, z, rx, rz, color, front):
    _poly([(x + math.cos(i * math.pi / 8) * rx,
            z + math.sin(i * math.pi / 8) * rz) for i in range(16)], color, front)


def build(tile):
    if tile.element != "well":
        raise ValueError(f"Well builder received {tile.element!r}")
    _ellipse(8, 1.5, 6, 1.5, "rockDark", -0.15)
    _box(2, 2, 14, 6, "rockDark", -0.2)
    _box(3, 2, 13, 6, "rock", -0.25)
    for x0, z0, x1, z1 in ((3, 2, 6, 3), (7, 2, 10, 3), (11, 2, 13, 3),
                           (2, 4, 5, 5), (6, 4, 9, 5), (10, 4, 14, 5)):
        _box(x0, z0, x1, z1, "rockLight", -0.28)
    _ellipse(8, 6, 6, 2, "rockLight", -0.3)
    _ellipse(8, 6.5, 4.5, 1, "rockDark", -0.32)
    _box(3, 5, 4, 12, "wood", -0.34)
    _box(12, 5, 13, 12, "wood", -0.34)
    _box(3, 9, 13, 10, "sandDark", -0.35)
    _box(7, 6, 8, 11, "sandDark", -0.36)
    _box(6, 8, 9, 10, "wood", -0.37)
    _box(13, 8, 15, 9, "wood", -0.36)
    _box(14, 7, 15, 10, "wood", -0.37)
    _poly([(1, 11), (8, 16), (15, 11)], "rockDark", -0.39)
    _poly([(2, 11), (8, 15), (14, 11)], "wood", -0.4)
    _poly([(2, 12), (8, 15), (8, 14), (4, 12)], "sandDark", -0.42)
    _box(1, 10, 15, 11, "wood", -0.43)
    # Bucket hangs just above the mouth, with a visible handle and iron hoop.
    _box(8, 6, 9, 8, "rockDark", -0.44)
    _box(10, 6, 11, 8, "rockDark", -0.44)
    _box(8, 8, 11, 9, "rockDark", -0.44)
    _poly([(8, 4), (11, 4), (12, 7), (7, 7)], "wood", -0.46)
    _box(8, 5, 11, 6, "sandDark", -0.48)
