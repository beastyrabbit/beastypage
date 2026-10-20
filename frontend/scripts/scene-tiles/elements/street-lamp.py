"""Iron lantern post; column tops carry the only lantern in the stack."""

import math

import tilekit as kit

PALETTE = kit.ramp("rockDark", "builtDark", "rock", "cloudShade", "glow")


def build(tile):
    iron = kit.mat("rockDark", metal=0.35)
    highlight = kit.mat("rock", metal=0.25)
    bottom = -0.10 if tile.s else 0.10
    top = 1.10 if tile.n else 0.66
    kit.box(0.455, bottom, 0.545, top, iron, -0.08, 0.06)
    kit.box(0.455, bottom, 0.48, top, highlight, -0.09, -0.08)
    if not tile.s:
        kit.box(0.35, 0.065, 0.65, 0.15, iron, -0.13, 0.14)
        kit.prism([(0.395, 0.15), (0.605, 0.15), (0.55, 0.32), (0.45, 0.32)],
                  iron, -0.10, 0.09)
        kit.box(0.40, 0.15, 0.46, 0.24, highlight, -0.115, -0.10)
    if tile.n:
        return

    kit.box(0.34, 0.63, 0.66, 0.70, iron, -0.15, 0.13)
    # The flicker changes one warm edge tone, never switches the lamp off.
    if tile.variant == "night":
        flicker = 0.5 + 0.5 * math.sin(2 * math.pi * tile.t)
        glass = kit.glow("glow", 1.3 + 0.1 * flicker)
        edge = kit.glow("#c99a51" if flicker < 0.3 else "#ffd27a", 0.25)
    else:
        glass = kit.mat("cloudShade")
        edge = kit.mat("rock")
    kit.prism([(0.395, 0.69), (0.605, 0.69), (0.64, 0.88), (0.36, 0.88)],
              glass, -0.11, 0.08)
    kit.box(0.52, 0.70, 0.59, 0.87, edge, -0.12, -0.11)
    for x in (0.37, 0.59):
        kit.box(x, 0.69, x + 0.04, 0.88, iron, -0.16, -0.12)
    kit.prism([(0.30, 0.87), (0.70, 0.87), (0.59, 0.96), (0.41, 0.96)],
              iron, -0.17, 0.15)
    kit.box(0.34, 0.88, 0.56, 0.91, highlight, -0.18, -0.17)
