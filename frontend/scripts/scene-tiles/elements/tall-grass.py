"""Open wild grass, with waving blades and ochre seed heads on tall stems."""

import math

import tilekit as kit

PALETTE = kit.ramp("foliageDark", "grass", "grassLight", "sandDark")


def _tussock(tile, x, z):
    """A broad rooted fan, with three seed-bearing stems above its leaves."""
    color = None
    if 1 <= z < 4 and 3 <= x < 13:
        color = 0 if z < 2 else 3
    # Blades share a dense root, then fan out to a twelve-pixel silhouette.
    blades = ((6, 2, 8), (6.5, 3, 11), (7, 5, 7), (7.5, 6, 12),
              (8, 8, 9), (8.5, 10, 13), (9, 12, 10), (10, 14, 7),
              (6, 4, 6), (10, 11, 6))
    for k, (root, tip, height) in enumerate(blades):
        u = (z - 1) / height
        if not 0 <= u <= 1:
            continue
        wind = .65 * math.sin(math.tau * tile.t + k * .55)
        tip += tile.alt * (.7 if k % 2 else -.5)
        cx = root + (tip - root) * u + wind * u * u
        width = 1.05 * (1 - .6 * u)
        if abs(x - cx) < width:
            color = (4, 7, 3, 6)[k % 4]
        if k in (1, 3, 5) and .78 < u < 1 and abs(x - cx) < .9:
            color = 11 if x < cx else 10
    return color


def _grass(tile, x, z):
    single = tile.shape == "single"
    if single:
        return _tussock(tile, x, z)
    if (single or not tile.w) and x < 1:
        return None
    if (single or not tile.e) and x > 15:
        return None
    # A sparse tuft versus a band versus a deeper, vertically repeating thicket.
    mass = tile.shape == "mass"
    color = None
    if 1 <= z < 3 and (not single or 3 < x < 13):
        color = 0 if z < 2 else 3
    inner = 2 < x < 14 and 2 < z < 14
    alt = tile.alt if inner else 0
    for dz in (-1, 0, 1) if mass else (0,):
        if dz and not tile.has(0, dz):
            continue
        for repeat in (-1, 0, 1):
            # Positions and motion repeat exactly over all open sides.
            for k, (root, tip, height) in enumerate(((1, -1.8, 8), (3, 4.2, 11),
                    (5, 2.4, 7), (7, 8.8, 13), (9, 12.1, 9),
                    (11, 9.7, 12), (13, 15.4, 7), (15, 16.8, 10))):
                if single and not 3 <= root <= 13:
                    continue
                h = height + (alt if k % 3 == 0 else 0)
                local_z = z - dz * 16 - 1
                u = local_z / h
                if not 0 <= u <= 1:
                    continue
                wind = .85 * math.sin(math.tau * tile.t + root * math.tau / 16)
                cx = repeat * 16 + root + (tip - root + wind) * u * u
                cx += alt * (1.4 if k % 2 else -1.1) * u
                width = .72 * (1 - .65 * u)
                if abs(x - cx) < width:
                    color = (4, 7, 3)[k % 3]
                # Seed heads are a full pixel wide and two or three pixels tall.
                if k in (1, 3, 5) and .79 < u < 1 and abs(x - cx) < .75:
                    color = 10 if x < cx else 9
        if mass and (tile.n or dz < 0):
            # Offset rear tufts bridge the vertical boundary without a solid fill.
            for k, root in enumerate((2, 6, 10, 14)):
                u = (z - dz * 16 - 8) / 12
                if 0 <= u <= 1:
                    cx = root + math.sin(math.tau * tile.t + root) * u
                    if abs(x - cx) < .65 * (1 - .5 * u):
                        color = 1 if k % 2 else 4
    return color


def build(tile):
    verts, faces = [[] for _ in PALETTE], [[] for _ in PALETTE]
    for z in range(16):
        for x in range(16):
            c = _grass(tile, x + .5, z + .5)
            if c is None:
                continue
            n = len(verts[c])
            verts[c] += [(x / 16, 0, z / 16), ((x + 1) / 16, 0, z / 16),
                         ((x + 1) / 16, 0, (z + 1) / 16), (x / 16, 0, (z + 1) / 16)]
            faces[c].append((n, n + 1, n + 2, n + 3))
    for c, v, f in zip(PALETTE, verts, faces):
        if f:
            kit.mesh(v, f, kit.mat(c), name="wild-grass")
