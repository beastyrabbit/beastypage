"""Dense tulip beds, one flower colour per alternative and grid row."""

import math

import tilekit as kit
from fieldkit import patch as _patch, rect as _rect

COLOURS = ("#d94b52", "#edc533", "#e779af", "#e9e8d9")
HIGHLIGHTS = ("#ff9693", "#fff29a", "#ffc4df", "#ffffff")
PALETTE = (kit.ramp("#6d7950", "#3f7d3a")
           + list(COLOURS) + list(HIGHLIGHTS) + ["#947753"])


def _soil(tile):
    top = 16 if tile.n else 11
    for z in range(top):
        left = 1 if z % 3 else 2
        if tile.w:
            left = 0
        right = 15 if z % 4 else 14
        if tile.e:
            right = 16
        _rect(left, z, right - left, 1, "#6d7950", .02)
    # Short soil dashes stay below the stems, never outlining the field.
    for x in (3, 10):
        _rect(x, 0, 3, 1, "#947753", .08)


def _row(tile, row, base, colour, highlight):
    for column in range(-1, 5):
        x = 1 + column * 4 + (2 if row == 0 else 0)
        # The repeat at x=0/16 is the same alt across each open E/W join.
        if (x < 1 and not tile.w) or (x > 14 and not tile.e):
            continue
        rise = column % 2
        sway = round(.7 * math.sin(math.tau * tile.t + row * .8))
        _rect(x, base, 1, 3 + rise, "#3f7d3a", .15)
        _patch([(x, base), (x - 1.5, base + 2), (x - 1.5, base + 3),
                (x + .5, base + 1)], "#3f7d3a", .19)
        _patch([(x + .5, base), (x + 2, base + 1), (x + 2, base + 3)],
               "#3f7d3a", .20)
        fx, cup = x - 1 + sway, base + 3 + rise
        # Two pixels across and three high, with a notched tulip lip.
        _patch([(fx + .3, cup), (fx + 1.7, cup), (fx + 2, cup + 3),
                (fx + 1, cup + 2.5), (fx, cup + 3)], colour, .27)
        _rect(fx, cup + 1, 1, 1.7, highlight, .30)


def build(tile):
    colour = COLOURS[tile.alt % 4]
    highlight = HIGHLIGHTS[tile.alt % 4]
    _soil(tile)
    for row, base in enumerate((1, 9)):
        _row(tile, row, base, colour, highlight)
