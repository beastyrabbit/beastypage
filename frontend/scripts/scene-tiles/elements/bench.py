"""Front-facing park bench, with warm slats and cast-iron legs."""

import tilekit as kit

PALETTE = kit.ramp("wood", "woodLight", "trunk", "builtDark", "rockDark")


def build(tile):
    iron = kit.mat("rockDark", metal=0.3)
    wood = kit.mat("wood")
    light = kit.mat("woodLight")
    # The supports show through the gaps between the backrest slats.
    for x in (0.25, 0.75):
        kit.box(x - 0.035, 0.12, x + 0.035, 0.72, iron, -0.02, 0.08)
        kit.box(x - 0.075, 0.10, x + 0.065, 0.17, iron, -0.18, 0.05)
    for bottom in (0.52, 0.69):
        kit.box(0.125, bottom, 0.875, bottom + 0.105, wood, -0.10, 0.06)
        kit.box(0.125, bottom + 0.065, 0.875, bottom + 0.105, light, -0.115, -0.10)
    # Broad seat, darker front apron, and raised iron armrests.
    kit.box(0.10, 0.36, 0.90, 0.47, wood, -0.31, 0.04)
    kit.box(0.10, 0.425, 0.90, 0.49, light, -0.33, -0.12)
    for x in (0.16, 0.84):
        kit.box(x - 0.03, 0.43, x + 0.03, 0.61, iron, -0.28, -0.16)
        kit.box(x - 0.06, 0.57, x + 0.065, 0.63, iron, -0.32, -0.12)
