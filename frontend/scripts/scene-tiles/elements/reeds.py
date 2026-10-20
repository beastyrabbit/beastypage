"""Shore cattails: a closed clump or a reed bed with periodic E/W borders."""

import math

import tilekit as kit

PALETTE = kit.ramp("#648c3f", "#99b650", "#805333", "#b57b47") + ["#314d2f"]


def _poly(points, color, y=0):
    kit.prism([(x / 16, z / 16) for x, z in points], kit.mat(color), y, y + 0.025)


def _cattail(x, height, sway, bright=False):
    stem = "#648c3f"
    # Motion grows towards the seed head; feet remain anchored to the shore.
    _poly([(x - 0.6, 1), (x + 0.6, 1), (x + sway + 0.6, height),
           (x + sway - 0.6, height)], stem, 0.04)
    _poly([(x + sway - 1.3, height - 0.8), (x + sway + 1.3, height - 0.8),
           (x + sway + 1.3, height + 2.7), (x + sway + 0.3, height + 3.4),
           (x + sway - 1.3, height + 2.8)], PALETTE[6], -0.02)
    _poly([(x + sway - 0.9, height - 0.5), (x + sway + 0.9, height - 0.5),
           (x + sway + 0.9, height + 2.4), (x + sway + 0.3, height + 3),
           (x + sway - 0.9, height + 2.5)], "#805333", -0.04)
    if bright:
        _poly([(x + sway - 0.9, height), (x + sway - 0.1, height),
               (x + sway - 0.1, height + 2), (x + sway - 0.9, height + 2)],
              "#b57b47", -0.08)
    for direction, reach in ((-1, 3.2), (1, 2.6)):
        _poly([(x - 0.6, 1), (x + 0.6, 1),
               (x + direction * reach + sway * 0.6, height - 2),
               (x + direction * 1.5, 4)], "#99b650" if direction == -1 else stem, -0.12)


def build(tile):
    wave = math.sin(2 * math.pi * tile.t)
    if tile.shape == "single":
        # An isolated fan stays inside its cell, with no water painted behind it.
        _poly([(2, 1), (4, 0), (12, 0), (14, 1), (10, 2), (5, 2)], "#314d2f", 0.16)
        stems = ((5, 9), (8, 12), (11, 8)) if tile.alt == 0 else ((4, 8), (7, 10), (11, 11))
        for i, (x, height) in enumerate(stems):
            _cattail(x, height, wave * (0.75 if i % 2 else 1), i % 2 == 0)
        return

    # The shared base and edge fans repeat every cell. Closed ends are inset.
    left, right = (0 if tile.w else 1), (16 if tile.e else 15)
    _poly([(left, 0), (right, 0), (right, 1.5), (left, 1.5)], "#314d2f", 0.16)
    # Replicate only when the adjacent cell exists. These exact fans are alt
    # independent, so mixed alternatives and end cells meet at the same seam.
    for repeat in (-16, 0, 16):
        if (repeat < 0 and not tile.w) or (repeat > 0 and not tile.e):
            continue
        for x, height in ((3 + repeat, 10), (13 + repeat, 9)):
            _cattail(x, height, wave * 0.8, True)
    # Alternatives affect only the middle, safely away from E/W borders.
    x, height = (8, 12) if tile.alt == 0 else (7, 9)
    _cattail(x, height, -wave * 0.7, False)
