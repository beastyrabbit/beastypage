"""A low plank deck with paired piles and finished end caps."""

import tilekit as kit

PALETTE = kit.ramp("wood", "woodLight", "trunk")
P = 1 / 16


def build(tile):
    left, right = (-1 if tile.w else P), (2 if tile.e else 15 * P)
    dark, wood, light = kit.mat("trunk"), kit.mat("wood"), kit.mat("woodLight")
    # The single tile is a compact jetty; a row is a lower, continuous wharf.
    deck = 9 * P if tile.shape == "single" else 8 * P
    for x in (3 * P, 12 * P):
        kit.box(x, P, x + 2 * P, deck, dark, -0.10, 0.20)
        kit.box(x, 2 * P, x + P, deck, wood, -0.14, -0.11)
    kit.box(left, deck - 2 * P, right, deck - P, dark, -0.26, 0.30)
    kit.box(left, deck - P, right, deck + 2 * P, wood, -0.30, 0.30)
    kit.box(left, deck + P, right, deck + 2 * P, light, -0.34, -0.31)
    for x in (4 * P, 8 * P, 12 * P):
        kit.box(x, deck - P, x + P, deck + 2 * P, dark, -0.36, -0.34)
    for x in (3 * P, 12 * P):
        kit.box(x, deck, x + P, deck + P, light, -0.38, -0.36)
    if not tile.w:
        kit.box(left, deck - 2 * P, left + P, deck + 2 * P, dark, -0.39, -0.37)
    if not tile.e:
        kit.box(right - P, deck - 2 * P, right, deck + 2 * P, dark, -0.39, -0.37)
