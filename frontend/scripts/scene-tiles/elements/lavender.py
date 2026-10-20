"""Dense lavender mounds with upright flowers over narrow grey-green bases."""

import math

import tilekit as kit

PALETTE = kit.ramp("#393c31", "#75816e", "#57417b", "#9361c5", "#bf96e1")


def _patch(points, colour, depth):
    obj = kit.prism([(x / 16, z / 16) for x, z in points],
                    kit.mat(colour), -depth, -depth + .015)
    obj.visible_shadow = False
    obj.visible_diffuse = False


def _rect(x, z, w, h, colour, depth):
    _patch([(x, z), (x + w, z), (x + w, z + h), (x, z + h)], colour, depth)


def _bush(x, z, sway, depth):
    # Fifteen pixels wide, ten tall. The flower lengths follow the rounded
    # shoulder instead of sitting in a separate line above a flat canopy.
    heights = (6, 7, 8, 9, 9, 10, 9, 10, 10, 9, 9, 8, 8, 7, 6)
    for i, height in enumerate(heights):
        px = x - 7 + i
        _rect(px, z + 1, 1, height - 1, "#9361c5", depth)
        _rect(px, z, 1, 1 + (i % 4 == 0), "#75816e", depth + .01)
        # Dense, overlapping flowers occupy most of each mound. One-pixel
        # shadow channels leave individual upright spikes legible.
        shift = sway if i in (3, 5, 8, 11) else 0
        flower_top = z + height
        flower_bottom = z + 2 + (i % 3 == 0)
        _rect(px, flower_bottom, 1, flower_top - flower_bottom,
              "#9361c5" if i % 4 else kit.shade("#9361c5", .72), depth + .03)
        if i % 2 == 0 or i in (3, 9):
            _rect(px + shift, flower_top - 2, 1, 2,
                  "#bf96e1" if i < 9 else "#9361c5", depth + .04)
        if i in (2, 6, 10, 13):
            _rect(px, z + 1, 1, 2, "#57417b", depth + .05)


def build(tile):
    # A row is one lane of full-size bushes; masses interleave two lanes.
    # Soil stays below the northern flowers, leaving their tops transparent.
    several_rows = tile.shape == "mass" or tile.n or tile.s
    top = 16 if tile.n else (10 if several_rows else 3)
    for z in range(top):
        left = 0 if tile.w else 1
        right = 16 if tile.e else 15
        _rect(left, z, right - left, 1, "#393c31", .02)

    sway = round(.7 * math.sin(math.tau * tile.t))
    if several_rows:
        # Repeat in both axes. Neighbour copies complete the half bushes at
        # open edges; closed edges finish with a whole rounded mound.
        if tile.n:
            _bush(8, 14, sway, .10)
        centers = ([0] if tile.w else []) + ([16] if tile.e else [])
        if not (tile.w and tile.e):
            centers.append(8)
        for x in centers:
            _bush(x, 6, sway, .20)
        _bush(8, -2 if tile.s else 0, sway, .30)
    else:
        _bush(8, 1, sway, .30)
