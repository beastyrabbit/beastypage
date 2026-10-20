"""Slender concrete broadcast tower with a saucer pod and aircraft beacon."""

import tilekit as kit

PALETTE = kit.ramp("rockDark", "rockLight", "waterDark", "waterLight", "red") + [kit.BASE["glow"]]
P = 1 / 16


def _face(points, color, y=-.3):
    material = kit.mat(color) if isinstance(color, str) else color
    if "glow" in material:
        material.cycles.emission_sampling = "NONE"
    obj = kit.prism([(x * P, z * P) for x, z in points], material, y, y + .01)
    obj.visible_shadow = obj.visible_diffuse = obj.visible_glossy = False


def _box(a, b, c, d, color, y=-.3):
    _face([(a, b), (c, b), (c, d), (a, d)], color, y)


def build(tile):
    low = -16 if tile.s else 1
    high = 32 if tile.n else 9
    _box(7, low, 9, high, "rockDark")
    _box(7, low, 8, high, "rockLight", -.32)
    if not tile.s:
        _face([(4, 1), (12, 1), (9, 4), (7, 4)], "rockDark", -.34)
        _box(3, 1, 13, 2, "rockLight", -.36)
    if not tile.n:
        _face([(6, 6), (10, 6), (14, 9), (13, 11),
               (10, 12), (6, 12), (3, 11), (2, 9)], "rockDark", -.36)
        _face([(3, 10), (13, 10), (10, 12), (6, 12)], "rockLight", -.38)
        ring = kit.glow("glow", 1.3) if tile.variant == "night" else kit.mat("waterLight")
        _box(3, 8, 13, 10, ring, -.40)
        for x in (4, 7, 10):
            _box(x, 8, x + 1, 10, "waterDark", -.42)
        _box(4, 7, 12, 8, "rockLight", -.44)
        _box(8, 12, 9, 16, "rockDark", -.36)
        beacon = kit.glow("red", 1.6) if tile.frame in (0, 1) else kit.mat("red")
        _box(8, 15, 9, 16, beacon, -.44)
