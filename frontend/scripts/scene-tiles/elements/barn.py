"""Red timber barns with white braces and a mask-shaped gambrel gable."""

import math

import tilekit as kit
from fieldkit import lit_box as _box, lit_poly as _poly

PALETTE = kit.ramp("#b83f39", "#78352f", "rockDark", "paint", "glow")


def _line(a, b, color, front=-0.4):
    dx, dz = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dz)
    nx, nz = -dz / length * 0.5, dx / length * 0.5
    _poly([(a[0] + nx, a[1] + nz), (a[0] - nx, a[1] - nz),
           (b[0] - nx, b[1] - nz), (b[0] + nx, b[1] + nz)], color, front)


def _doors(bottom, top):
    _box(3, bottom, 13, top, "paint", -0.36)
    _box(4, bottom, 12, top - 1, "#78352f", -0.38)
    _box(7.5, bottom, 8.5, top - 1, "#b83f39", -0.41)
    _line((4, bottom), (12, top - 1), "paint", -0.42)
    _line((4, top - 1), (12, bottom), "paint", -0.42)


def _roof_bounds(tile, z, low, shoulder, upper_inset):
    left, right = (-16 if tile.w else 1), (32 if tile.e else 15)
    if z <= shoulder:
        inset = (z - low) / (shoulder - low) * 2
    else:
        inset = 2 + (z - shoulder) / (15 - shoulder) * (upper_inset - 2)
    return left if tile.w else left + inset, right if tile.e else right - inset


def _roof_panels(tile, low, shoulder, upper_inset):
    for z in range(low, 15):
        l0, r0 = _roof_bounds(tile, z, low, shoulder, upper_inset)
        l1, r1 = _roof_bounds(tile, z + 1, low, shoulder, upper_inset)
        _poly([(l0, z), (r0, z), (r1, z + 1), (l1, z + 1)], "rockDark", -0.32)
        inset_l, inset_r = (0 if tile.w else 1), (0 if tile.e else 1)
        if r1 - inset_r > l1 + inset_l:
            _poly([(l0 + inset_l, z), (r0 - inset_r, z),
                   (r1 - inset_r, z + 1), (l1 + inset_l, z + 1)], "#b83f39", -0.34)


def _roof(tile, compact, glass):
    low = 8 if compact else 0
    shoulder = low + (15 - low) * 0.58
    left, right = (-16 if tile.w else 1), (32 if tile.e else 15)
    upper_inset = 6 if not tile.w and not tile.e else 7
    _roof_panels(tile, low, shoulder, upper_inset)
    for closed, x, direction in ((not tile.w, left, 1), (not tile.e, right, -1)):
        if closed:
            _line((x, low), (x + direction * 2, shoulder), "paint", -0.38)
            _line((x + direction * 2, shoulder),
                  (x + direction * upper_inset, 15), "paint", -0.38)
    _box(left, low, right, low + 1, "paint", -0.39)
    # The hayloft is a small shutter in a compact barn, a broad door above a hall.
    bottom, top = (10, 12) if compact else (3, 8)
    half = 1 if compact else 3
    _box(8 - half - 1, bottom - 1, 8 + half + 1, top + 1, "paint", -0.4)
    _box(8 - half, bottom, 8 + half, top, "#78352f", -0.41)
    _box(8 - half, top - 2, 8 + half, top, glass, -0.43)
    if not compact:
        _line((5, bottom), (11, top - 2), "paint", -0.44)


def _walls(tile, compact, left, right):
    bottom, top = (-16 if tile.s else 1), (8 if compact else 32)
    _box(left, bottom, right, top, "#b83f39", -0.25)
    for x in range(-16, 33, 3):
        if left < x < right - 1:
            _box(x, bottom, x + 0.65, top, "#78352f", -0.28)
    if not tile.w:
        _box(left, bottom, left + 1, top, "paint", -0.31)
    if not tile.e:
        _box(right - 1, bottom, right, top, "paint", -0.31)


def _openings(tile, compact, left, right, glass):
    if not tile.s:
        _box(left, 1, right, 2, "rockDark", -0.33)
        _doors(2, 8 if compact else 13)
    else:
        _box(4, 5, 12, 11, "paint", -0.33)
        _box(5, 6, 11, 10, glass, -0.36)
        _box(7, 6, 8, 10, "paint", -0.38)
        _box(5, 7, 11, 8, "paint", -0.38)
        if tile.shape == "mass":
            _box(left, 14, right, 16, "paint", -0.32)


def build(tile):
    glass = kit.glow("glow", 1.5) if tile.variant == "night" else kit.mat("rockDark")
    compact = not tile.n and not tile.s
    if not tile.n and not compact:
        _roof(tile, False, glass)
        return
    left, right = (-16 if tile.w else 1), (32 if tile.e else 15)
    _walls(tile, compact, left, right)
    _openings(tile, compact, left, right, glass)
    if compact:
        _roof(tile, True, glass)
