"""One wide rainbow with downturned ends, or waving self-lit curtains."""

import math

import tilekit as kit

RAINBOW = ["#ef6565", "#f59b55", "#f4d66b", "#72cc8a", "#74b7ec", "#ab8bdd"]
AURORA = ["#4ade80", "#2dd4bf", "#a78bfa", "#298e82"]
PALETTE = RAINBOW + AURORA


def _aurora(tile):
    # Two broad, rippling hems with hanging, dithered tails. Pixel coverage
    # fades instead of alpha, which the tile pipeline cuts at 50 percent.
    verts, faces = [[] for _ in AURORA], [[] for _ in AURORA]
    bayer = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))
    for j in range(16):
        for i in range(16):
            x, z = (i + 0.5) / 16, (j + 0.5) / 16
            if (not tile.w and x < 0.06) or (not tile.e and x > 0.94):
                continue
            if not tile.s and z < 0.06:
                continue
            band = None
            for repeat in (-1, 0, 1):
                if (repeat == 1 and not tile.n) or (repeat == -1 and not tile.s):
                    continue
                for ribbon, level in enumerate((0.83, 0.64)):
                    wave = 0.075 * math.sin(math.tau * (x - tile.t) + ribbon * 1.6)
                    wave += 0.025 * math.sin(math.tau * (2 * x + tile.t))
                    depth = level + repeat + wave - z
                    length = (0.50 if ribbon == 0 else 0.43) + 0.05 * math.cos(math.tau * (x - tile.t) + ribbon)
                    end = min(1, x / 0.20 if not tile.w else 1, (1 - x) / 0.20 if not tile.e else 1)
                    length *= 0.7 + 0.3 * end
                    if not -0.045 <= depth < length:
                        continue
                    if depth < 0:
                        band = 2  # Violet fringe follows the upper edge only.
                    elif depth < 0.14:
                        band = 0  # Continuous bright green hem.
                    else:
                        fade = (depth - 0.14) / (length - 0.14)
                        density = min(1, (1 - fade) * 1.35)
                        if (bayer[j % 4][i % 4] + 0.5) / 16 > density:
                            continue
                        band = 1 if fade < 0.55 else 3
                    break
                if band is not None:
                    break
            if band is None:
                continue
            v, f = verts[band], faces[band]
            k = len(v)
            v.extend([(i / 16, 0, j / 16), ((i + 1) / 16, 0, j / 16), ((i + 1) / 16, 0, (j + 1) / 16), (i / 16, 0, (j + 1) / 16)])
            f.append((k, k + 1, k + 2, k + 3))
    for v, f, colour in zip(verts, faces, AURORA):
        if f:
            kit.mesh(v, f, kit.glow(colour, 0.15), name="aurora-ribbon")


def _arc_distance(tile, x, z):
    # A rounded, open-bottom arch. Only the top row carries its horizontal
    # crown; the side legs continue down through any open south edges.
    radius = 0.76
    dx = min(x - 0.10 if not tile.w else 4, 0.90 - x if not tile.e else 4)
    dz = 0.87 - z if not tile.n else 4
    if not (tile.w or tile.e):
        radius = 0.38
    qx, qz = radius - dx, radius - dz
    return math.hypot(max(qx, 0), max(qz, 0)) + min(max(qx, qz), 0) - radius


def build(tile):
    if tile.variant == "aurora":
        _aurora(tile)
        return
    thickness = 0.105 if tile.shape == "mass" else 0.070
    steps = 64
    verts, faces = [[] for _ in RAINBOW], [[] for _ in RAINBOW]
    for j in range(steps):
        for i in range(steps):
            x, z = (i + 0.5) / steps, (j + 0.5) / steps
            if not tile.s and z < 0.06:
                continue
            distance = _arc_distance(tile, x, z)
            if not -len(RAINBOW) * thickness < distance <= 0:
                continue
            band = min(5, int(-distance / thickness))
            v, f = verts[band], faces[band]
            k = len(v)
            v.extend([(i / steps, 0, j / steps), ((i + 1) / steps, 0, j / steps), ((i + 1) / steps, 0, (j + 1) / steps), (i / steps, 0, (j + 1) / steps)])
            f.append((k, k + 1, k + 2, k + 3))
    for v, f, colour in zip(verts, faces, RAINBOW):
        if f:
            kit.mesh(v, f, kit.mat(colour), name="rainbow-band")
