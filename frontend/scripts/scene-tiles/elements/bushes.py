"""Round shrubs and deep hedges built from overlapping irregular leaf sprays."""

import math

import tilekit as kit

PALETTE = kit.ramp("foliageDark", "foliage", "foliageLight", "trunk")


def _draw(pixels):
    for color in sorted(set(pixels.values())):
        verts, faces = [], []
        for (x, z), value in pixels.items():
            if color != value:
                continue
            i = len(verts)
            verts.extend([(x / 16, 0, z / 16), ((x + 1) / 16, 0, z / 16),
                          ((x + 1) / 16, 0, (z + 1) / 16), (x / 16, 0, (z + 1) / 16)])
            faces.append((i, i + 1, i + 2, i + 3))
        kit.mesh(verts, faces, kit.mat(color), name="shrub")


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


def build(tile):
    pixels = {}
    single = tile.shape == "single"
    hedge = tile.shape == "row"
    motion = .7 * math.sin(math.tau * tile.t)

    def inside(x, z):
        if single:
            # A broad three-lobed shrub, not a miniature hedge spray.
            crown = 7.5 + (1 if tile.alt else 0) + motion * .6
            lobes = ((4.5, 6, 3.6, 4.5), (crown, 7.4, 4.4, 5.1),
                     (11.8, 5.8, 3.4, 4.3))
            return z >= 2 and any(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1
                                  for cx, cz, rx, rz in lobes)
        # Rounded, unequal lobes make the closed top a hedge silhouette.
        top = 0
        for cx, cz, rx, rz in ((1, 7, 4, 4), (7.5, 7.5, 4.6, 5),
                                (14, 6.5, 4, 4.7)):
            dx = ((x - cx + 8) % 16 - 8) / rx
            if abs(dx) < 1:
                top = max(top, cz + rz * math.sqrt(1 - dx * dx))
        if not hedge:
            top += 2.4
        flank = 1.1 + .6 * math.sin(math.tau * z / 16)
        return not ((not tile.w and x < flank) or (not tile.e and x > 16 - flank)
                    or (not tile.s and z < 2) or (not tile.n and z > top))

    for z in range(16):
        for x in range(16):
            px, pz = x + .5, z + .5
            if not inside(px, pz):
                if not tile.s and z == 1 and x in (4, 10) and inside(px, 3.5):
                    pixels[x, z] = "trunk"
                continue
            color = _leaf(px, pz, tile.alt, motion)
            # Closed edges get a dark rim; the bottom carries a deep shadow.
            rim = (not tile.w and not inside(px - 1, pz)
                   or not tile.e and not inside(px + 1, pz)
                   or not tile.n and not inside(px, pz + 1))
            if rim or not tile.s and pz < 3.5:
                color = "foliageDark"
            pixels[x, z] = color
    _draw(pixels)
