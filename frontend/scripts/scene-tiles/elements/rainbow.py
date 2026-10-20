"""One wide rainbow with downturned ends, or waving self-lit curtains."""

import math

import tilekit as kit
import townkit

RAINBOW = ["#ef6565", "#f59b55", "#f4d66b", "#72cc8a", "#74b7ec", "#ab8bdd"]
AURORA = ["#4ade80", "#2dd4bf", "#a78bfa", "#298e82"]
PALETTE = RAINBOW + AURORA


def _aurora(tile):
    # Two broad, rippling hems with hanging, dithered tails. Pixel coverage
    # fades instead of alpha, which the tile pipeline cuts at 50 percent.
    bayer = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))
    verts, faces = townkit.raster(
        16, len(AURORA),
        lambda i, j: _aurora_pixel(tile, (i + 0.5) / 16, (j + 0.5) / 16, bayer[j % 4][i % 4]),
    )
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
    verts, faces = townkit.raster(
        steps, len(RAINBOW),
        lambda i, j: _rainbow_tone(tile, (i + 0.5) / steps, (j + 0.5) / steps, thickness),
    )
    for v, f, colour in zip(verts, faces, RAINBOW):
        if f:
            kit.mesh(v, f, kit.mat(colour), name="rainbow-band")


def _aurora_tone(tile, x, z, threshold):
    for repeat in (-1, 0, 1):
        if (repeat == 1 and not tile.n) or (repeat == -1 and not tile.s):
            continue
        for ribbon, level in enumerate((0.83, 0.64)):
            band = _ribbon_tone(tile, x, z, repeat, ribbon, level, threshold)
            if band is not None:
                return band
    return None


def _ribbon_tone(tile, x, z, repeat, ribbon, level, threshold):
    wave = 0.075 * math.sin(math.tau * (x - tile.t) + ribbon * 1.6)
    wave += 0.025 * math.sin(math.tau * (2 * x + tile.t))
    depth = level + repeat + wave - z
    length = (0.50 if ribbon == 0 else 0.43) + 0.05 * math.cos(math.tau * (x - tile.t) + ribbon)
    end = min(1, x / 0.20 if not tile.w else 1, (1 - x) / 0.20 if not tile.e else 1)
    length *= 0.7 + 0.3 * end
    if not -0.045 <= depth < length:
        return None
    if depth < 0:
        return 2  # Violet fringe follows the upper edge only.
    if depth < 0.14:
        return 0  # Continuous bright green hem.
    fade = (depth - 0.14) / (length - 0.14)
    density = min(1, (1 - fade) * 1.35)
    if (threshold + 0.5) / 16 > density:
        return None
    return 1 if fade < 0.55 else 3


def _aurora_pixel(tile, x, z, threshold):
    if (not tile.w and x < 0.06) or (not tile.e and x > 0.94):
        return None
    if not tile.s and z < 0.06:
        return None
    return _aurora_tone(tile, x, z, threshold)


def _rainbow_tone(tile, x, z, thickness):
    if not tile.s and z < 0.06:
        return None
    distance = _arc_distance(tile, x, z)
    if not -len(RAINBOW) * thickness < distance <= 0:
        return None
    return min(5, int(-distance / thickness))
