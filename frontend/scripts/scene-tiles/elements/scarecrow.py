"""A straw-hatted scarecrow whose patched coat flaps around a fixed cross."""

import math

import tilekit as kit

PALETTE = kit.ramp("trunk", "sand", "#bb633e", "#526c83", "woodLight")
P = 1 / 16


def _poly(points, color, front=-0.3):
    obj = kit.prism([(x * P, z * P) for x, z in points],
                    kit.mat(color), front, front + 0.01)
    obj.visible_shadow = False
    obj.visible_diffuse = False
    obj.visible_glossy = False


def _box(x0, z0, x1, z1, color, front=-0.3):
    _poly([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], color, front)


def build(tile):
    flap = math.sin(2 * math.pi * tile.t)
    cuff = math.cos(2 * math.pi * tile.t) * 0.6
    _box(5, 0, 11, 1, "trunk", -0.1)
    _box(7, 1, 9, 11, "trunk", -0.15)
    _box(2, 8, 14, 10, "woodLight", -0.2)
    outline = [(3, 11), (6, 11), (7, 10), (9, 10), (10, 11),
               (13, 10 + cuff), (14, 7 + cuff), (11, 7),
               (12 + flap, 3), (8 + flap, 4), (5 + flap, 3), (5, 7), (2, 7 - cuff)]
    _poly(outline, "trunk", -0.3)
    _poly([(3, 10), (6, 10), (8, 9), (10, 10), (12, 9 + cuff),
           (13, 8 + cuff), (10, 8), (11 + flap, 4),
           (8 + flap, 5), (6 + flap, 4), (6, 8), (3, 8 - cuff)], "#bb633e", -0.32)
    _box(8, 7, 10, 9, "#526c83", -0.35)
    _box(6 + flap, 4.5, 8 + flap, 6.5, "sand", -0.35)
    _box(7, 8, 8, 9, "sand", -0.36)
    _box(2, 7 - cuff, 3, 8 - cuff, "sand", -0.34)
    _box(13, 7 + cuff, 15, 8 + cuff, "sand", -0.34)
    _box(6, 10, 10, 14, "trunk", -0.38)
    _box(6, 11, 10, 14, "sand", -0.4)
    _box(7, 12, 8, 13, "trunk", -0.42)
    _box(9, 12, 10, 13, "trunk", -0.42)
    _box(4, 13, 12, 14, "trunk", -0.44)
    _box(3, 14, 13, 15, "sand", -0.46)
    _box(6, 14, 10, 16, "woodLight", -0.45)
    _box(6, 15, 10, 16, "sand", -0.47)
