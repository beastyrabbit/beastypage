"""Uneven alpine summits, angular rock faces, snow gullies and wooded feet."""

import math

import tilekit as kit
import woodkit as wood

PALETTE = [kit.BASE[c] for c in ("rockDark", "rock", "rockLight", "snow", "white")]
PALETTE += ["#354f46", "#59735c", "#b1b7c2"]
PALETTE += ["#5d6371"]
PROFILES = (
    ((0, .34), (.18, .67), (.43, .98), (.71, .65), (1, .34)),
    ((0, .34), (.25, .49), (.65, .76), (.84, .56), (1, .34)),
    ((0, .34), (.20, .69), (.34, .58), (.51, .91), (.76, .62), (1, .34)),
)
PEAKS = ((.43, .98), (.65, .76), (.51, .91))


def _height(x, alt):
    for (xa, za), (xb, zb) in zip(PROFILES[alt], PROFILES[alt][1:]):
        if xa <= x <= xb:
            return za + (zb - za) * (x - xa) / (xb - xa)
    return .34


def _gullies(x, z, alt, color):
    # Short, kinked snow remnants sit in gullies, rather than forming a
    # repeating white diagonal. All are inset from the shared borders.
    gullies = (
        ((.25, .75), (.33, .56), (.24, .40)),
        ((.69, .73), (.57, .60), (.62, .40)),
        ((.38, .78), (.25, .62), (.31, .49)),
    )
    for (xa, za), (xb, zb) in zip(gullies[alt], gullies[alt][1:]):
        if zb < z < za:
            gx = xa + (xb - xa) * (za - z) / (za - zb)
            if abs(x - gx) < .038:
                color = 3 if z > .54 else 7
    return color


def _flank(x, z, alt):
    # Unequal triangular faces meet along a broken ridge. Opposite boundary
    # segments share colours; interior warping varies their angles by alt.
    u = max(0, min(1, (x - .125) / .75))
    v = max(0, min(1, (z - .125) / .75))
    envelope = math.sin(math.pi * u) ** 2 * math.sin(math.pi * v) ** 2
    # Move the junction between faces, rather than sliding parallel stripes.
    # Piecewise linear displacement keeps the interior facets angular.
    cx, cz = ((.30, .67), (.68, .36), (.46, .43))[alt]
    edge = min(x, 1 - x, z, 1 - z)
    blend = max(0, min(1, (edge - .0625) / .16))
    cx = .43 + (cx - .43) * blend
    cz = .54 + (cz - .54) * blend
    px = x + (-.08, .06, -.06)[alt] * envelope
    pz = z + (.04, -.05, -.08)[alt] * envelope
    rim = ((0, 0), (.34, 0), (1, 0), (1, .63),
           (1, 1), (.34, 1), (0, 1), (0, .63), (0, 0))
    shades = (2, 1, 8, 1, 1, 2, 1, 8)
    color = 1
    for a, b, shade in zip(rim, rim[1:], shades):
        ax, az = a[0] - cx, a[1] - cz
        bx, bz = b[0] - cx, b[1] - cz
        qx, qz = px - cx, pz - cz
        if ax * qz - az * qx >= 0 and qx * bz - qz * bx >= 0:
            color = shade
            break
    color = _gullies(x, z, alt, color)
    # A few two-pixel scree chips break up the larger faces.
    scree = (((.64, .24), (.78, .34)),
             ((.29, .25), (.41, .39)),
             ((.65, .32), (.78, .19)))[alt]
    for sx, sz in scree:
        if abs(x - sx) < .055 and abs(z - sz - .35 * (x - sx)) < .025:
            color = 0
    return color


def _top(tile, x, alt):
    top = 1.1 if tile.n else _height(x, alt)
    if not tile.n:
        if not tile.w:
            top = min(top, .0625 + x * 2.2)
        if not tile.e:
            top = min(top, .0625 + (1 - x) * 2.2)
    return top


def _foothills(tile, x, z, c):
    if tile.s:
        return c
    # A serrated forested foothill band, with lit left edges.
    if z < .13:
        c = 5
    for tx, h in ((.08, .22), (.28, .18), (.48, .25), (.73, .20), (.92, .24)):
        width = .10 * (h - z) / max(.01, h - .07)
        if .07 < z < h and abs(x - tx) < width:
            c = 6 if x < tx else 5
    return c


def _paint(tile, x, z, alt, peak_x, peak_z):
    if (not tile.w and x < .03125) or (not tile.e and x > .96875):
        return None
    top = _top(tile, x, alt)
    if z > top or (not tile.s and z < .03125):
        return None
    c = _flank(x, z, alt)
    if not tile.n and z > peak_z - .22 - .15 * abs(x - peak_x):
        c = 4 if x <= peak_x else 3
    c = _foothills(tile, x, z, c)
    return c


def _pixel(tile, x, z):
    alt = tile.alt % 3
    peak_x, peak_z = PEAKS[alt]
    return _paint(tile, x, z, alt, peak_x, peak_z)


def build(tile):
    p = wood.sample(tile, _pixel, resolution=32, normalized=True)
    wood.draw_indices(p, PALETTE, 'alpine-flank', resolution=32)
