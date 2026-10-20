"""Striped coastal tower; only the uppermost cell carries the lantern room."""

import math

import tilekit as kit

PALETTE = kit.ramp("red", "white", "builtDark", "rock", "glow")
P = 1 / 16


def build(tile):
    single = tile.shape == "single"
    bottom = -1 if tile.s else P
    top = 2 if tile.n else 9 * P
    _stripes(single, bottom, top)
    dark = kit.mat("builtDark")
    if not tile.s:
        kit.box(3 * P, 0, 13 * P, P, kit.mat("rock"), -0.33, 0.30)
        kit.box(7 * P, P, 9 * P, 4 * P, dark, -0.33, -0.30)
    if tile.n:
        kit.box(7 * P, 9 * P, 9 * P, 11 * P, dark, -0.33, -0.30)
    else:
        _lantern(tile, dark)


def _stripes(single, bottom, top):
    for band in range(-4, 8):
        lo, hi = max(bottom, band * 4 * P), min(top, (band + 1) * 4 * P)
        if hi <= lo:
            continue
        # A single lighthouse tapers. Stacked towers have an invariant width
        # at north/south borders, including where they meet the lantern tile.
        def bounds(z):
            taper = max(0, z) * 0.08 if single else 0
            return 4 * P + taper, 12 * P - taper

        x0, x1 = bounds(lo)
        x2, x3 = bounds(hi)
        colour = "white" if band % 2 == 0 else "red"
        kit.prism([(x0, lo), (x1, lo), (x3, hi), (x2, hi)], kit.mat(colour))
        kit.prism([(x1 - P, lo), (x1, lo), (x3, hi), (x3 - P, hi)],
                  kit.mat(kit.shade(kit.BASE[colour], 0.72)), -0.28, -0.26)


def _lantern(tile, dark):
    kit.box(3 * P, 9 * P, 13 * P, 10 * P, dark, -0.35, 0.30)
    kit.box(5 * P, 10 * P, 11 * P, 13 * P, dark, -0.30, 0.25)
    lantern = kit.mat("glow")
    if tile.variant == "night":
        pulse = (1 + math.cos(2 * math.pi * tile.t)) / 2
        lantern = kit.glow("#ffe8ad" if pulse > 0.75 else "glow", 1.2 + pulse * 2)
    if "glow" in lantern:
        lantern.cycles.emission_sampling = "NONE"
    pane = kit.box(6 * P, 10 * P, 10 * P, 13 * P, lantern, -0.34, -0.31)
    pane.visible_diffuse = False
    pane.visible_glossy = False
    kit.box(7 * P, 10 * P, 8 * P, 13 * P, dark, -0.37, -0.35)
    kit.prism([(4 * P, 13 * P), (12 * P, 13 * P), (9 * P, 15 * P), (7 * P, 15 * P)],
              kit.mat("red"), -0.40, 0.30)
    kit.box(7 * P, 15 * P, 9 * P, 16 * P, dark)
