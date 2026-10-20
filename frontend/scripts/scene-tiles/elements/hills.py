"""Rounded sunlit hilltops above one continuous, gently shaded hillside."""

import math

import woodkit as wood

PALETTE = [
    "#4f9a46", "#648b4c", "#759b54", "#83a65b", "#a3c575",
    "#466b3f", "#849d5b", "#728f50", "#709551",
]


def _crest(tile, x):
    # All crests meet at the same saddle. Only the exposed north edge gets
    # this profile: lower rows are uninterrupted ground, never more humps.
    rounded = .39 + .49 * math.sqrt(max(0, 1 - (2 * x - 1) ** 2))
    if tile.alt == 0:
        return rounded
    arch = math.sin(math.pi * x)
    double = .39 + .40 * arch ** .45 - .12 * arch ** 8 + .08 * math.sin(2 * math.pi * x) ** 2
    # The first pixel on either side is identical across alternatives.
    blend = max(0, min(1, (min(x, 1 - x) - 1 / 16) * 16))
    return rounded + (double - rounded) * blend


def _contour(x, z, alt):
    # Broad, curved diagonal slopes, with low contrast in the lower fields.
    # Periodic in both axes; alternatives change only inside a shared collar.
    u = max(0, min(1, (x - .125) / .75))
    v = max(0, min(1, (z - .125) / .75))
    collar = math.sin(math.pi * u) ** 2 * math.sin(math.pi * v) ** 2
    phase = x + z + .10 * math.sin(2 * math.pi * z)
    phase += (.18 if alt else -.16) * collar
    slope = math.sin(2 * math.pi * phase)
    return 8 if slope < -.35 else 2


def _tree_detail(x, z):
    tx, tz = .31, .58
    if abs(x - tx) < .027 and tz - .12 < z < tz:
        return 5
    crown = ((x - tx) / .10) ** 2 + ((z - tz) / .10) ** 2
    if crown < 1:
        return 5 if crown > .60 or x > tx + .035 else 3


def _pasture_detail(tile, x, z):
    if tile.n and not tile.s:
        return _tree_detail(x, z)
    elif tile.n and .24 < x < .51:
        contour = .30 + .12 * math.sin(math.pi * (x - .24) / .55)
        if abs(z - contour) < .034:
            return 5 if z < contour else 1


def _detail(tile, x, z):
    # One small landmark per tile, at different heights. No edge-crossing
    # strips or repeated rows of grass dashes. All lie inside the collar.
    if tile.alt == 0:
        return _pasture_detail(tile, x, z)
    elif tile.n and not tile.s:
        # A single oblique field parcel, with a softly contrasting edge.
        px, pz = x - .64, z - .51
        if abs(px + .36 * pz) < .13 and abs(pz - .28 * px) < .10:
            return 7 if pz < -.045 else 6
    return None


def _ridge_shade(tile, x, z, top, c):
    slope = _crest(tile, min(1, x + .02)) - _crest(tile, max(0, x - .02))
    depth = top - z
    if depth < .070:
        c = 4 if slope > -.025 else 8
    elif depth < .20:
        c = 3 if slope > -.025 else 1
    elif depth < .33 and slope < -.025:
        c = 8
    return c


def _ridge(tile, x, z, top, c):
    if not tile.n:
        if z > top:
            c = 0  # Ground tiles remain opaque above their ridge.
        else:
            c = _ridge_shade(tile, x, z, top, c)
    return c


def _paint(tile, x, z):
    top = _crest(tile, x)
    c = _contour(x, z, tile.alt)
    c = _ridge(tile, x, z, top, c)
    detail = _detail(tile, x, z)
    if detail is not None and (tile.n or z < top - .32):
        c = detail
    if not tile.s and z < .055:
        c = 2
    return c


def build(tile):
    p = wood.sample(tile, _paint, resolution=32, normalized=True)
    wood.draw_indices(p, PALETTE, 'rolling-hill', resolution=32, light=1.05)
