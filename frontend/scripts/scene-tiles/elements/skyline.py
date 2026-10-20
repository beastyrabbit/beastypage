"""A distant stepped city, with three roof profiles and sparse window flicker."""

import math

import tilekit as kit

PALETTE = kit.ramp("builtDark", "built", "builtLight", "glow")
P = 1 / 16


def build(tile):
    # The first and last buildings always have the same height. Alternatives
    # vary only the interior, so mixed alternatives meet at the same roofline.
    heights = ((6, 11, 8, 6), (6, 8, 14, 6), (6, 14, 10, 6))[tile.alt % 3]
    if tile.shape == "mass":
        heights = tuple(min(15, h + 1) for h in heights)
    spans = ((0, 3), (3, 8), (8, 13), (13, 16))
    bottom = -1 if tile.s else 0
    for k, ((a, b), h) in enumerate(zip(spans, heights)):
        left = (a + (1 if a == 0 and not tile.w else 0)) * P
        right = (b - (1 if b == 16 and not tile.e else 0)) * P
        top = 2 if tile.n else h * P
        colour = "built" if k == 1 else "builtDark"
        # Far silhouettes use flat colour blocks. A taller alternative must
        # not cast a different shadow onto the fixed building at an open end.
        body = kit.box(left, bottom, right, top, kit.mat(colour))
        body.visible_shadow = False
        if not tile.n and k in (1, 2):
            ledge = kit.box(left, top - P, right, top, kit.mat("builtLight"), -0.28, -0.26)
            ledge.visible_shadow = False
            if k == 1 and tile.alt == 2:
                antenna = kit.box(5 * P, top, 6 * P, top + P, kit.mat("builtDark"))
                antenna.visible_shadow = False

        for x in range(a + 1, b - 1, 2):
            for z in range(2, 16 if tile.n else h - 1, 3):
                lit = (x + z + tile.alt) % 5 != 0
                # Only a few interior windows change, never the silhouette.
                if k in (1, 2) and (x + z) % 7 == 0:
                    lit = lit and math.sin(2 * math.pi * tile.t + x) > -0.4
                material = kit.glow("glow", 1.2) if tile.variant == "night" and lit else kit.mat("builtLight")
                if "glow" in material:
                    material.cycles.emission_sampling = "NONE"
                pane = kit.box(x * P, z * P, (x + 1) * P, (z + 1) * P, material, -0.31, -0.29)
                pane.visible_diffuse = False
                pane.visible_glossy = False
