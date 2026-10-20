"""Faceted boulders, low rubble rows and mossy, overlapping outcrops."""

import math

import tilekit as kit

PALETTE = kit.ramp("rock", "rockLight", "rockDark", "foliage", "foliageLight")


def _draw(pixels):
    for color in set(pixels.values()):
        verts, faces = [], []
        for (x, z), value in pixels.items():
            if value != color:
                continue
            i = len(verts)
            verts.extend([(x / 16, 0, z / 16), ((x + 1) / 16, 0, z / 16),
                          ((x + 1) / 16, 0, (z + 1) / 16), (x / 16, 0, (z + 1) / 16)])
            faces.append((i, i + 1, i + 2, i + 3))
        kit.mesh(verts, faces, kit.mat(color), name="rock-facets")


def _stone(pixels, cx, cz, rx, rz, tile, solid=False):
    for z in range(16):
        for x in range(16):
            # Finished group silhouette; neighbouring copies are never random.
            crest = 13 + math.floor(1.5 * math.cos(math.tau * (x + .5) / 16))
            flank = 1 + int(math.cos(math.tau * (z + .5) / 16) > .65)
            if ((not tile.w and x < flank) or (not tile.e and x > 15 - flank)
                    or (not tile.s and z < 1) or (not tile.n and z > crest)):
                continue
            u, v = (x + .5 - cx) / rx, (z + .5 - cz) / rz
            if abs(u) > 1 or abs(v) > 1 or abs(u) + abs(v) > 1.53:
                continue
            color = "rockDark"
            if v > -.55 and u < .72 and abs(u) + abs(v) < 1.4:
                color = "rock"
            # Short upper-left facets avoid the repeated diagonal bands that
            # made a rock mass read as stacked copies of a single tile.
            facet = .24 + .13 * math.sin((cx % 16) * 1.7 + cz % 16)
            interior = (math.sin(math.pi * (x - 2) / 12) ** 2
                        * math.sin(math.pi * (z - 2) / 12) ** 2
                        if 2 < x < 14 and 2 < z < 14 else 0)
            facet -= .3 * tile.alt * interior
            if v > facet and -.8 < u < .1 + .18 * math.cos(cz % 16) + .3 * tile.alt * interior:
                color = "rockLight"
            if v < -.1 and u > .35 + .18 * v:
                color = "rockDark"
            if solid and .05 < u < .24 and -.2 < v < .35:
                color = "rockDark"
            pixels[x, z] = color


def _outcrop_inside(tile, x, z):
    crest = 13 + math.floor(1.5 * math.cos(math.tau * (x + .5) / 16))
    flank = 1 + int(math.cos(math.tau * (z + .5) / 16) > .65)
    return not ((not tile.w and x < flank) or (not tile.e and x > 15 - flank)
                or (not tile.s and z < 1) or (not tile.n and z > crest))


def _outcrop(tile, pixels):
    # The connected rock underneath reads as deep crevices between boulders.
    for z in range(16):
        for x in range(16):
            if _outcrop_inside(tile, x, z):
                pixels[x, z] = "rockDark"
    # Unequal boulders overlap at staggered heights, rather than paving rows.
    stones = ([(3.5, 10, 7, 6.5), (11, 3.5, 6, 5.5)]
              if tile.shape == "square" else
              [(10, 10, 7, 6.5), (2.5, 3.5, 6, 5)])
    copies = [(cx + dx, cz + dz, rx, rz)
              for dz in (-16, 0, 16) for dx in (-16, 0, 16)
              if tile.has(dx // 16, dz // 16)
              for cx, cz, rx, rz in stones]
    # Draw rear stones first across the whole neighbourhood, including joins.
    for cx, cz, rx, rz in sorted(copies, key=lambda s: -s[1]):
        for z in range(16):
            for x in range(16):
                if not _outcrop_inside(tile, x, z):
                    continue
                v = (z + .5 - cz) / rz
                u = (x + .5 - cx) / rx + .22 * v
                # Asymmetric clipped faces give each rock an angular profile.
                edge = max(abs(u), abs(v), (abs(u) + abs(v)) / 1.48)
                if edge > 1:
                    continue
                color = "rockDark"
                if edge < .94 and v > -.82 and u < .9:
                    color = "rock"
                    if v > .12 + .38 * u and u < .32:
                        color = "rockLight"
                    elif v < -.35 and u > .48:
                        color = "rockDark"
                # Moss sits on the upward face, with a short spill into a crack.
                crown = .57 + .10 * math.cos((x + .5 - cx) * 1.8)
                if edge < .9 and -.65 < u < .22 and v > crown:
                    color = "foliageLight" if v > crown + .15 else "foliage"
                # Alternate face splits stay away from open cell borders.
                if tile.alt and 2 < x < 13 and 2 < z < 13:
                    if -.08 < u < .12 and -.45 < v < .13:
                        color = "rockDark"
                    elif edge < .8 and -.5 < u < -.15 and .35 < v < .6:
                        color = "foliage"
                pixels[x, z] = color


def build(tile):
    pixels = {}
    if tile.shape == "single":
        _stone(pixels, 7.5, 6.5, 6.5, 5, tile, True)
        # Moss follows the crown and spills down a pair of face cracks.
        for x in range(2, 13):
            column = [z for px, z in pixels if px == x]
            if not column:
                continue
            top = max(column)
            if 3 <= x <= (10 if tile.alt else 8):
                pixels[x, top] = "foliageLight"
                if x in (4, 5, 8) or tile.alt and x in (9, 10):
                    pixels[x, top - 1] = "foliage"
        _stone(pixels, 12.5 if tile.alt else 3.5, 2.5, 2.5, 1.8, tile)
    elif tile.shape in ("square", "mass"):
        _outcrop(tile, pixels)
    else:
        # Render copies past the border: every crossing repeats at exactly 1.
        for dz in (-16, 0, 16):
            for dx in (-16, 0, 16):
                if not tile.has(dx // 16, dz // 16):
                    continue
                stones = [(3, 4, 4.5, 3.5), (11, 5, 5.5, 4.5)]
                if tile.n or tile.s:
                    stones += [(5, 12, 6, 7), (13, 13, 5, 6)]
                for cx, cz, rx, rz in sorted(stones, key=lambda s: -s[1]):
                    _stone(pixels, cx + dx, cz + dz, rx, rz, tile)
        # Alternatives change a small interior split, never any open border.
        if tile.alt:
            for x, z in ((7, 6), (8, 7), (8, 8)):
                if (x, z) in pixels:
                    pixels[x, z] = "rockDark"
    _draw(pixels)
