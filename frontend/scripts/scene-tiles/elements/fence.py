"""Picket fence with continuous rails and capped posts at closed ends."""

import tilekit as kit

PALETTE = kit.ramp("wood", "woodLight", "trunk")


def build(tile):
    wood = kit.mat("wood")
    light = kit.mat("woodLight")
    dark = kit.mat("trunk")
    left = -0.12 if tile.w else 0.10
    right = 1.12 if tile.e else 0.90
    for z in (0.29, 0.53):
        kit.box(left, z, right, z + 0.09, dark, 0.02, 0.13)
        kit.box(left, z + 0.025, right, z + 0.09, wood, -0.01, 0.02)
    # Four pickets per unit; the gaps and rail heights repeat at open E/W.
    for x in (0.125, 0.375, 0.625, 0.875):
        kit.prism([(x - 0.055, 0.14), (x + 0.055, 0.14),
                   (x + 0.055, 0.70), (x, 0.78), (x - 0.055, 0.70)],
                  light, -0.12, 0.01)
        kit.box(x + 0.02, 0.14, x + 0.055, 0.69, wood, -0.13, -0.12)
    for closed, x in ((not tile.w, 0.115), (not tile.e, 0.885)):
        if closed:
            kit.box(x - 0.075, 0.10, x + 0.075, 0.80, wood, -0.17, 0.12)
            kit.box(x - 0.075, 0.10, x - 0.025, 0.80, light, -0.18, -0.17)
            kit.prism([(x - 0.10, 0.77), (x + 0.10, 0.77),
                       (x + 0.07, 0.84), (x - 0.07, 0.84)],
                      light, -0.19, 0.14)
