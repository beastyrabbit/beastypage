"""Round shrubs and deep hedges built from overlapping irregular leaf sprays."""

import math

import tilekit as kit
import woodkit as wood

PALETTE = kit.ramp("foliageDark", "foliage", "foliageLight", "trunk")


def _draw(pixels):
    wood.draw_colors(pixels, 'shrub')


def _leaf(x, z, alt, motion):
    # Shared sprays straddle every open side with a period of exactly one cell.
    # Interior distortion moves the large clumps, but is zero in the border band.
    fade_x = math.sin(math.pi * (x - 2) / 12) ** 2 if 2 < x < 14 else 0
    fade_z = math.sin(math.pi * (z - 2) / 12) ** 2 if 2 < z < 14 else 0
    fade = fade_x * fade_z
    x += (4.6 if alt else -1.2) * fade
    z += (-3.6 if alt else .7) * fade
    x += motion * math.sin(math.tau * z / 16) * fade
    lobes = [(1, 3, 4.8, 3.5), (8, .5, 4, 3.3),
             (14, 8.5, 4.6, 4.1), (7, 12.5, 4.5, 3.8), (5.5, 6, 4.3, 3.2)]
    best = None
    for cx, cz, rx, rz in lobes:
        dx = (x - cx + 8) % 16 - 8
        dz = (z - cz + 8) % 16 - 8
        u, v = dx / rx, dz / rz
        angle = math.atan2(v, u)
        d = (u * u + v * v) / (1 + .14 * math.sin(3 * angle + cx))
        if best is None or d < best[0]:
            best = d, u, v, cx
    d, u, v, phase = best
    if d > .85 or u - v > .95:
        return "foliageDark"
    if (u + .25) ** 2 + (v - .34) ** 2 < .24 and d < .7:
        return "foliageLight"
    # Unequal dark notches break up the sprays without outlining every lobe.
    if v < -.25 and math.sin(u * 5 + phase) > .65:
        return "foliageDark"
    return "foliage"


def _hedge_top(x, hedge):
    top = 0
    for cx, cz, rx, rz in ((1, 7, 4, 4), (7.5, 7.5, 4.6, 5),
                            (14, 6.5, 4, 4.7)):
        dx = ((x - cx + 8) % 16 - 8) / rx
        if abs(dx) < 1:
            top = max(top, cz + rz * math.sqrt(1 - dx * dx))
    if not hedge:
        top += 2.4
    return top


def _inside(tile, x, z, single, hedge, motion):
    if single:
        # A broad three-lobed shrub, not a miniature hedge spray.
        crown = 7.5 + (1 if tile.alt else 0) + motion * .6
        lobes = ((4.5, 6, 3.6, 4.5), (crown, 7.4, 4.4, 5.1),
                 (11.8, 5.8, 3.4, 4.3))
        return z >= 2 and any(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1
                              for cx, cz, rx, rz in lobes)
    # Rounded, unequal lobes make the closed top a hedge silhouette.
    top = _hedge_top(x, hedge)
    flank = 1.1 + .6 * math.sin(math.tau * z / 16)
    return not ((not tile.w and x < flank) or (not tile.e and x > 16 - flank)
                or (not tile.s and z < 2) or (not tile.n and z > top))


def _shade(tile, px, pz, single, hedge, motion):
    color = _leaf(px, pz, tile.alt, motion)
    # Closed edges get a dark rim; the bottom carries a deep shadow.
    rim = (not tile.w and not _inside(tile, px - 1, pz, single, hedge, motion)
           or not tile.e and not _inside(tile, px + 1, pz, single, hedge, motion)
           or not tile.n and not _inside(tile, px, pz + 1, single, hedge, motion))
    if rim or not tile.s and pz < 3.5:
        color = "foliageDark"
    return color


def build(tile):
    pixels = {}
    single = tile.shape == "single"
    hedge = tile.shape == "row"
    motion = .7 * math.sin(math.tau * tile.t)

    for z in range(16):
        for x in range(16):
            px, pz = x + .5, z + .5
            if not _inside(tile, px, pz, single, hedge, motion):
                if not tile.s and z == 1 and x in (4, 10) and _inside(tile, px, 3.5, single, hedge, motion):
                    pixels[x, z] = "trunk"
                continue
            pixels[x, z] = _shade(tile, px, pz, single, hedge, motion)
    _draw(pixels)
