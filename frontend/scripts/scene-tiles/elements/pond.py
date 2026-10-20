"""Small rounded pools, with quiet water, marginal reeds and lily pads."""

import math

import tilekit as kit

PALETTE = kit.ramp("water", "waterDark", "waterLight", "foliage", "grassLight", "trunk") + [kit.BASE["petal1"]]


def _inside(tile, x, z):
    inset, radius = 3 / 16, 3 / 16
    left, right = (-1 if tile.w else inset), (2 if tile.e else 1 - inset)
    bottom, top = (-1 if tile.s else inset), (2 if tile.n else 1 - inset)
    if not (left <= x <= right and bottom <= z <= top):
        return False
    for closed_x, closed_z, cx, cz, sx, sz in (
        (not tile.w, not tile.s, left + radius, bottom + radius, -1, -1),
        (not tile.e, not tile.s, right - radius, bottom + radius, 1, -1),
        (not tile.w, not tile.n, left + radius, top - radius, -1, 1),
        (not tile.e, not tile.n, right - radius, top - radius, 1, 1),
    ):
        if closed_x and closed_z and (x - cx) * sx > 0 and (z - cz) * sz > 0:
            if math.hypot(x - cx, z - cz) > radius:
                return False
    return True


def build(tile):
    pixels = {}
    inside = lambda i, j: _inside(tile, (i + 0.5) / 16, (j + 0.5) / 16)
    for j in range(16):
        for i in range(16):
            if not inside(i, j):
                continue
            color = "water"
            if not inside(i, j - 1) or not inside(i + 1, j):
                color = "waterDark"
            elif not inside(i, j + 1):
                color = "waterLight"
            elif j in (5, 10) and (i - round(math.sin(2 * math.pi * tile.t))) % 16 in (6, 7, 8):
                color = "waterLight"
            pixels[i, j] = color

    # Each decoration stays inside the cell and belongs to a closed shore.
    pads = []
    if not tile.s:
        pads.append((5, 5))
    if not tile.e:
        pads.append((10, 8))
    if not tile.n and tile.shape != "row":
        pads.append((7, 10))
    for k, (px, pz) in enumerate(pads):
        for dx, dz in ((0, 0), (1, 0), (2, 0), (0, 1), (1, 1)):
            if inside(px + dx, pz + dz):
                pixels[px + dx, pz + dz] = "grassLight" if dz else "foliage"
        if k == 0 and inside(px + 1, pz + 1):
            pixels[px + 1, pz + 1] = "petal1"
    if not tile.n:
        for x, height in ((4, 3), (6, 2), (11, 3)):
            for z in range(12, min(16, 12 + height)):
                pixels[x, z] = "trunk" if z == 12 + height - 1 else "foliage"
    if not tile.w:
        for x, height in ((2, 3), (3, 2)):
            for z in range(6, 6 + height):
                pixels[x, z] = "foliage"
    _draw(pixels)


def _draw(pixels):
    batches = {}
    for (i, j), color in pixels.items():
        verts, faces = batches.setdefault(color, ([], []))
        a = len(verts)
        x, z = i / 16, j / 16
        verts.extend(((x, 0, z), (x + 1 / 16, 0, z),
                      (x + 1 / 16, 0, z + 1 / 16), (x, 0, z + 1 / 16)))
        faces.append((a, a + 1, a + 2, a + 3))
    for color, (verts, faces) in batches.items():
        kit.mesh(verts, faces, kit.mat(color), name="pond")
