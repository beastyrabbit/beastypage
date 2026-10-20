"""Two leafy grape trellises per cell, with hanging fruit and earth paths."""

import tilekit as kit

PALETTE = kit.ramp("dirt", "foliage", "wood", "#75509c", "#b293d3")


def _patch(points, colour, depth):
    obj = kit.prism([(x / 16, z / 16) for x, z in points],
                    kit.mat(colour), -depth, -depth + .015)
    obj.visible_shadow = False
    obj.visible_diffuse = False


def _rect(x, z, w, h, colour, depth):
    _patch([(x, z), (x + w, z), (x + w, z + h), (x, z + h)], colour, depth)


def build(tile):
    top = 16 if tile.n else 11
    for z in range(top):
        left = 0 if tile.w else (1 if z % 4 < 2 else 2)
        right = 16 if tile.e else (15 if z % 3 else 14)
        _rect(left, z, right - left, 1, "dirt", .02)

    left, right = (-2 if tile.w else 1), (18 if tile.e else 15)
    for base in (1, 9):
        # Posts rise through the canopy; rail remains visible below the leaves.
        for x in (2, 14):
            _rect(x, base, 1, 6, "wood", .12)
            _rect(x, base + 4, 1, 2, "woodLight", .15)
        _rect(left, base + 3, right - left, 1, "wood", .16)
        for x in range(-2, 19, 4):
            if (x < 0 and not tile.w) or (x > 15 and not tile.e):
                continue
            height = 6 if x % 8 == 2 else 5
            _patch([(x - 1, base + 4), (x, base + 3),
                    (x + 2, base + 3), (x + 3, base + 4),
                    (x + 3, base + 5), (x + 2, base + 5),
                    (x + 2, base + height), (x, base + height),
                    (x, base + 5), (x - 1, base + 5)], "foliage", .22)
            _rect(x, base + height - 1, 1, 1, "foliageLight", .25)
        for x in (6, 11):
            # A three-pixel shoulder tapers to a single hanging grape.
            _patch([(x - 1, base + 4), (x + 2, base + 4),
                    (x + 2, base + 2), (x + 1, base + 1),
                    (x, base + 1), (x - 1, base + 2)], "#75509c", .30)
            _rect(x - 1, base + 3, 1, 1, "#b293d3", .33)
            _rect(x, base + 1, 1, 1, "#b293d3", .33)

    if not tile.s:
        for x in (3, 8, 12):
            _rect(x, 0, 2, 1, "foliage", .08)
