"""Still sand flats, with wind ripples, shells and a darker wet south edge.

Alternatives change only inset shells and pebbles; open borders are identical.
"""

import tilekit as kit

PALETTE = kit.ramp("sand", "sandDark", "dirt") + [kit.BASE["foam"], kit.BASE["paint"]]


def build(tile):
    pixels = {}
    for j in range(16):
        for i in range(16):
            if ((not tile.w and i == 0) or (not tile.e and i == 15)
                    or (not tile.n and j == 15) or (not tile.s and j == 0)):
                continue
            color = "sand"
            # Two stepped, cell-periodic dune ripples, continuous across joins.
            rise = 1 if i % 16 in range(4, 12) else 0
            if (j - rise) % 8 == 2 and i % 8 < 6:
                color = "sandDark"
            if (j - rise) % 8 == 3 and i % 8 in (1, 2, 3, 4):
                color = "#f4d9a4"
            if not tile.s and j <= 3 + (i % 16 in range(5, 11)):
                color = "sandDark" if j >= 2 else "#ac895a"
            if (not tile.w and i == 1) or (not tile.e and i == 14):
                color = "sandDark"
            pixels[i, j] = color
    shells = ((4, 9), (10, 5)) if tile.alt == 0 else ((8, 10), (4, 6))
    for x, z in shells:
        for dx, dz, color in ((0, 0, "sandDark"), (1, 0, "sandDark"),
                              (0, 1, "foam"), (1, 1, "paint")):
            if (x + dx, z + dz) in pixels:
                pixels[x + dx, z + dz] = color
    if tile.shape == "mass":
        x, z = (11, 11) if tile.alt == 0 else (11, 6)
        pixels[x, z] = "dirt"
        pixels[x + 1, z] = "sandDark"
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
        kit.mesh(verts, faces, kit.mat(color), name="beach")
