"""Airy birches with pale, black-marked stems and small lime leaf sprays."""

import math

import tilekit as kit

DARK, LEAF, LIGHT, BARK, MARK = "#789d46", "#b1ca68", "#d8e7a3", "#e4e5cb", "#393b35"
PALETTE = kit.ramp(DARK, LEAF, LIGHT, BARK, MARK)
SHADE = "#57783d"
PALETTE += [SHADE]


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
        kit.mesh(verts, faces, kit.mat(color), name="birch")


def _stem(x, z, cx, height=11):
    if 1 <= z < height:
        dx = x - cx - (z - 1) * .08
        if abs(dx) < 1:
            return MARK if int(z) % 3 == 1 and dx > -.15 else BARK
        if 5 < z < 9 and abs(x - cx + (z - 4) * .65) < .48:
            return MARK
    return None


def _tree(tile, x, z):
    if not (1 <= x < 15 and 1 <= z < 15):
        return None
    # Row trees have two slim stems; the single has one complete tall birch.
    stems = (4, 10) if tile.shape == "row" else (7,)
    color = None
    for k, cx in enumerate(stems):
        c = _stem(x, z, cx, 12)
        if c is not None:
            color = c
        sway = .55 * math.sin(math.tau * tile.t + k * .7)
        for i, (dx, cz, rx, rz) in enumerate(((-1, 10, 2.6, 3.3), (1.3, 12, 2.8, 3),
                                               (2, 8.6, 2.5, 2.5))):
            rx += .5 if tile.shape == "single" else 0
            u = (x - cx - dx - sway - tile.alt * .25) / rx
            v = (z - cz) / rz
            if u * u + v * v < 1:
                color = DARK if u > .45 or v < -.7 else LEAF
                if (u + .20) ** 2 + (v - .25) ** 2 < .30:
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
    for i, (cx, cz) in enumerate(((5, 8), (10, 11), (10, 4))):
        phase = seed * .73 + i * 2.4
        rx = 2.8 + .7 * (1 + math.sin(phase * 1.7))
        rz = 3.5 + .6 * (1 + math.cos(phase))
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
    # Pale stems continue through the middle canopy, with matching endpoints
    # above and below each cell. Openings reveal bark and meadow together.
    trunk = None
    for cx in (4.5, 11):
        dx = x - cx - .45 * math.sin(math.tau * z / 16)
        if (tile.s or z >= 1) and abs(dx) < .85:
            trunk = MARK if int(z) % 5 == 2 and dx > -.2 else BARK
        if not tile.s and 7 < z < 13 and abs(x - cx + (z - 7) * .55) < .5:
            trunk = MARK
    if not _outline(tile, x, z):
        return trunk if not tile.s and z < 11 else None
    if not all(_outline(tile, x + dx, z + dz) for dx, dz in ((-1, 0), (1, 0), (0, 1))):
        return SHADE
    for cx, cz, rx, rz in ((4.5, 7 + 1.5 * math.sin(tile.mask + tile.alt), 2, 5.2),
                            (11, 8 + 2 * math.cos(tile.mask * .7 + tile.alt), 1.7, 4)):
        if (tile.n or z < 8.5) and min(x, z, 16 - x, 16 - z) >= 1 and ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1:
            return trunk
    color = _clumps(tile, x, z)
    floor = 10.5 + .8 * math.sin(math.tau * x / 16) + .5 * math.sin(math.tau * x / 8)
    if not tile.s and z < floor + 1:
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
