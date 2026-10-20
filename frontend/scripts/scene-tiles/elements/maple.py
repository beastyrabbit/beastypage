"""Pointed red and orange maple crowns over sturdy forked trunks."""

import math

import tilekit as kit

DARK, LEAF, LIGHT = "#8c302b", "#cd4932", "#ef853e"
BARK, BARK_LIGHT = kit.BASE["trunk"], kit.BASE["wood"]
PALETTE = kit.ramp(DARK, LEAF, LIGHT, "trunk", "wood")


def _draw(pixels):
    for color in sorted(set(pixels.values())):
        verts, faces = [], []
        for (x, z), value in pixels.items():
            if value != color:
                continue
            i = len(verts)
            verts.extend([(x / 16, 0, z / 16), ((x + 1) / 16, 0, z / 16),
                          ((x + 1) / 16, 0, (z + 1) / 16), (x / 16, 0, (z + 1) / 16)])
            faces.append((i, i + 1, i + 2, i + 3))
        kit.mesh(verts, faces, kit.mat(color), name="maple")


def _trunk(x, z, cx):
    if 1 <= z < 10 and abs(x - cx) < 1.1 + max(0, 3 - z) * .35:
        return BARK_LIGHT if x < cx else BARK
    if 5 < z < 10 and abs(abs(x - cx) - (z - 4) * .65) < .7:
        return BARK
    return None


def _tree(tile, x, z):
    if not (1 <= x < 15 and 1 <= z < 15):
        return None
    color = _trunk(x, z, 8)
    sway = .5 * math.sin(math.tau * tile.t)
    # Angular overlapping fans make a taller, spikier crown than the oak.
    for k, (cx, cz, rx, rz) in enumerate(((7.5, 11.7, 4.8, 3.5), (4.6, 9, 3.6, 3.5),
                                          (11.5, 9.5, 3.8, 3.8), (8.5, 7, 4.3, 2.7))):
        u = (x - cx - sway - tile.alt * .22) / rx
        v = (z - cz) / rz
        if abs(u) + abs(v) < 1:
            color = DARK
            if abs(u + .08) + abs(v - .13) < .75:
                color = LEAF
            if abs(u + .23) + abs(v - .32) < .40:
                color = LIGHT
    return color


def _outline(tile, x, z):
    """A whole corner cell rounds off the shoulder of the shared crown."""
    side = 1 + .65 * (1 - math.cos(math.tau * z / 16))
    if (not tile.w and x < side) or (not tile.e and x > 16 - side):
        return False
    if not tile.n:
        cap = 14.5 + .6 * math.sin(math.tau * x / 16) + .45 * math.sin(math.tau * x / 8)
        if z > cap:
            return False
        rx, rz = (13.5, 13.5) if tile.s else (7, 6)
        for closed, dx in ((not tile.w, x), (not tile.e, 16 - x)):
            if closed and (max(0, rx + 1 - dx) / rx) ** 2 + (max(0, z - 14.5 + rz) / rz) ** 2 > 1:
                return False
    floor = 10.5 + .8 * math.sin(math.tau * x / 16) + .5 * math.sin(math.tau * x / 8)
    if not tile.s and z < floor:
        return False
    return True


def _clumps(tile, x, z):
    # Border lobes are anchored to the same world-periodic positions. Only
    # clumps wholly inside the tile change with the neighbour mask and alt.
    lobes = [(0, 6, 4.7, 4.1), (16, 6, 4.7, 4.1),
             (9, 0, 4.5, 4.8), (9, 16, 4.5, 4.8)]
    seed = tile.mask * 11 + tile.alt * 37
    warp = 0 if min(x, z, 16 - x, 16 - z) < 1 else (
        math.sin(math.pi * x / 16) ** 2 * math.sin(math.pi * z / 16) ** 2
    )
    sample_x = x + 2.7 * warp * math.sin(seed * .37)
    sample_z = z + 2.7 * warp * math.cos(seed * .61)
    for i, (cx, cz) in enumerate(((5, 10), (10, 5), (10, 11))):
        phase = seed * .57 + i * 2.4
        rx = 3.7 + .6 * (1 + math.sin(phase * 1.7))
        rz = 3.5 + .5 * (1 + math.cos(phase))
        cx += 1.1 * math.sin(phase) + .35 * math.sin(math.tau * tile.t + i)
        cz += 1.1 * math.cos(phase * 1.3)
        # Keep every variable lobe at least one pixel away from open joins.
        cx = max(rx + 1, min(15 - rx, cx))
        cz = max(rz + 1, min(15 - rz, cz))
        lobes.append((cx, cz, rx, rz))
    color = DARK
    for cx, cz, rx, rz in lobes:
        u, v = (sample_x - cx) / rx, (sample_z - cz) / rz
        if u * u + v * v < 1 + .12 * math.sin(5 * math.atan2(v, u)):
            color = DARK
            if (u + .14) ** 2 + (v - .16) ** 2 < .86:
                color = LEAF
            if (u + .32) ** 2 + (v - .38) ** 2 < .27:
                color = LIGHT
    return color


def _grove(tile, x, z):
    trunk = _trunk(x, z * .72, 7.5 + tile.alt * 2) if not tile.s else None
    if x < 1 or x > 15:
        trunk = None
    if not _outline(tile, x, z):
        return trunk
    color = _clumps(tile, x, z)
    floor = 10.5 + .8 * math.sin(math.tau * x / 16) + .5 * math.sin(math.tau * x / 8)
    if not tile.s and z < floor + 1.5:
        color = DARK
    return color


def build(tile):
    painter = _tree if tile.shape in ("single", "row") else _grove
    pixels = {}
    for z in range(16):
        for x in range(16):
            color = painter(tile, x + .5, z + .5)
            if color is not None:
                pixels[x, z] = color
    _draw(pixels)
