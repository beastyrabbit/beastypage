"""One broad deciduous tree, with a continuous crown and a rooted foot."""

import math

import tilekit as kit

PALETTE = kit.ramp("foliageDark", "foliage", "foliageLight", "trunk", "wood")


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
        kit.mesh(verts, faces, kit.mat(color), name="broadleaf")


def build(tile):
    # The two halves of a two-wide column share their centre at the join.
    cx = 0 if tile.w and not tile.e else 16 if tile.e and not tile.w else 8
    radius = 15 if tile.e or tile.w else 7.4
    single = tile.shape == "single" or not (tile.n or tile.s)
    rustle = .45 * math.sin(math.tau * tile.t)
    pixels = {}
    for z in range(16):
        for x in range(16):
            px, pz = x + .5, z + .5
            dx = px - cx
            # A four-pixel trunk only becomes fully exposed at the foot.
            width = 2 if tile.s else 2 + max(0, 4 - pz) * 1.1
            if 1 <= pz < (16 if tile.n else 10) and abs(dx) <= width:
                pixels[x, z] = "wood" if -1.8 < dx < -.6 else "trunk"
            if not single and tile.n and tile.s:
                # Forks show through small gaps in the lower crown.
                branch = 3 + abs(dx) / radius * 9
                if abs(dx) < radius * .8 and abs((pz % 16) - branch) < 1:
                    pixels[x, z] = "wood" if dx < 0 else "trunk"

            # Motion and side scallops repeat at every vertical boundary.
            sway = rustle * math.sin(math.pi * pz / 16) ** 2
            u = (dx - sway) / radius
            edge = .91 + .08 * math.sin(math.tau * pz / 16 + (1 if u < 0 else 2.8))
            if abs(u) > edge:
                continue
            rounded = math.sqrt(max(0, 1 - u * u))
            if single:
                top = 9.7 + 5.6 * rounded
                bottom = 9.7 - 4.8 * rounded
            else:
                top = 9.5 + 5.7 * rounded if not tile.n else 17
                bottom = 10.7 - 3.6 * rounded if not tile.s else -1
            top += .35 * math.sin((u + .2) * math.tau * 2)
            if not bottom <= pz <= top:
                continue

            # Keep the crown whole at joins, opening branch gaps inside cells.
            if tile.n and tile.s:
                gap_left = ((u + .34) / .34) ** 2 + ((pz - 6.3) / 2) ** 2 < 1
                gap_right = ((u - .38) / .30) ** 2 + ((pz - 7.5) / 1.8) ** 2 < 1
                if gap_left or gap_right:
                    continue

            # Overlapping sprays have unequal heights and widths, rather than
            # shading the whole crown in horizontal bands.
            best = None
            for lx, lz, rx, rz in ((-.35, 9, .68, 5.7), (.42, 3, .63, 4.8),
                                    (-.45, -1, .57, 4.3), (.48, 14, .55, 4.4)):
                a = (u - lx) / rx
                b = ((pz - lz + 8) % 16 - 8) / rz
                d = a * a + b * b
                if best is None or d < best[0]:
                    best = d, a, b
            d, a, b = best
            color = "foliage" if d < 1.15 else "foliageDark"
            if (a + .3) ** 2 + (b - .3) ** 2 < .36:
                color = "foliageLight"
            elif a - b > .85:
                color = "foliageDark"
            if abs(u) > edge - .12 or pz < bottom + 1 or pz > top - .65:
                color = "foliageDark"
            # A broad lit patch follows the rounded top, upper left of centre.
            if (not tile.n or single) and pz > 2:
                if ((u + .3) / .48) ** 2 + ((pz - 12) / 2.3) ** 2 < 1:
                    color = "foliageLight"
                elif 3 < pz < 8 and u > .15:
                    color = "foliageDark"
            pixels[x, z] = color
    _draw(pixels)
