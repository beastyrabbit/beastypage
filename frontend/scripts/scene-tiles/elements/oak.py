"""Broad, knotted oaks; joined cells form a single scalloped leafy grove."""

import math

import tilekit as kit

PALETTE = kit.ramp("foliageDark", "foliage", "foliageLight", "trunk", "wood")
DARK, LEAF, LIGHT = (kit.BASE[c] for c in ("foliageDark", "foliage", "foliageLight"))
BARK, BARK_LIGHT = kit.BASE["trunk"], kit.BASE["wood"]


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
        kit.mesh(verts, faces, kit.mat(color), name="oak")


def _trunk(x, z, cx, alt):
    bend = .65 * math.sin((z - 1) * .6 + alt)
    width = 1.25 + max(0, 3 - z) * .65
    if 1 <= z < 10 and abs(x - cx - bend) < width:
        return BARK_LIGHT if x < cx + bend - .3 else BARK
    if 4 < z < 9 and abs(abs(x - cx) - (z - 3) * .8) < .75:
        return BARK
    return None


def _tree(tile, x, z):
    if not (1 <= x < 15 and 1 <= z < 15):
        return None
    color = _trunk(x, z, 8, tile.alt)
    sway = .50 * math.sin(math.tau * tile.t)
    # Uneven overlapping lobes give the oak a low, heavy crown.
    for cx, cz, rx, rz in ((4.3, 9.2, 3.5, 3.6), (7.4, 11.5, 4.4, 3.6),
                            (11.8, 9.8, 3.3, 3.9), (8.4, 7.9, 4.7, 2.6)):
        u = (x - cx - sway - tile.alt * .22) / rx
        v = (z - cz) / rz
        if u * u + v * v < 1:
            color = DARK
            if (u + .10) ** 2 + (v - .14) ** 2 < .69:
                color = LEAF
            if (u + .28) ** 2 + (v - .32) ** 2 < .19:
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
    for i, (cx, cz) in enumerate(((5, 5), (10, 10), (5, 11))):
        phase = seed * .73 + i * 2.4
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
        if u * u + v * v < 1:
            color = DARK
            if (u + .14) ** 2 + (v - .16) ** 2 < .86:
                color = LEAF
            if (u + .32) ** 2 + (v - .38) ** 2 < .27:
                color = LIGHT
    return color


def _grove(tile, x, z):
    # Stretch the fork into the high underside of the large shared crown.
    trunk = _trunk(x, z * .72, 7.5 + tile.alt * 2, tile.alt) if not tile.s else None
    if x < 1 or x > 15:
        trunk = None
    if not _outline(tile, x, z):
        return trunk
    color = _clumps(tile, x, z)
    floor = 10.5 + .8 * math.sin(math.tau * x / 16) + .5 * math.sin(math.tau * x / 8)
    if not tile.s and z < floor + 1.6:
        color = DARK
    if (not tile.w and x < 2.5) or (not tile.e and x > 13.5):
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
