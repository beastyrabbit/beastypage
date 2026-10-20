"""A four-stage leaping silver fish, or two orange-and-white surface koi."""

import math

import tilekit as kit
import waterkit

PALETTE = kit.ramp("#57b6c9", "white", "#e78540", "waterLight") + ["#293e50"]
COLORS = {"D": "#293e50", "B": "#57b6c9", "W": "white",
          "O": "#e78540", "r": "waterLight"}


def _stamp(rows, x, z, y=0, mirror=False):
    waterkit.stamp(rows, x, z, COLORS, "fish-pixels", y, mirror)


def build(tile):
    frame = int(tile.t * 4) % 4
    if tile.alt == 1:
        bob = round(math.sin(2 * math.pi * tile.t))
        koi = ["...DDD...", "D.DWWODD.", ".DWWOWDOD", "D.DOWODD.", "...DDD..."]
        _stamp(["..rrrrrr..", "rr......rr", "..rrrrrr.."], 5, 7, 0.2)
        _stamp(koi, 5, 8 + bob, 0)
        _stamp(["..rrrrrr..", "rr......rr", "..rrrrrr.."], 1, 2, 0.2)
        _stamp(koi, 1, 3 - bob, -0.04, mirror=True)
        # A fin stroke alternates sides, without moving the waterline.
        _stamp(["O"], 6 + (frame % 2), 3 - bob, -0.06)
        return

    # Ascend at left, turn across the apex, descend at right, then disappear.
    if frame == 0:
        _stamp(["..rrrr....", "rr....rr..", "..rrrr...."], 0, 1, 0.2)
        _stamp(["....DD", "...DWD", "..DWWD", ".DBWD.", ".DBD..", "DDB...", "D.D..."], 2, 4)
        _stamp(["r..", "..r"], 1, 4, 0.1)
    elif frame == 1:
        _stamp(["..rrrrrr..", "rr......rr", "..rrrrrr.."], 0, 1, 0.2)
        _stamp(["....D....", "D.DDWWD..", ".DBWWWBDD", "D.DDBBDD.", "....D...."], 4, 10)
        _stamp(["r", ".", "r"], 3, 7, 0.1)
    elif frame == 2:
        _stamp(["..rrrrrr..", "rr......rr", "..rrrrrr.."], 5, 1, 0.2)
        _stamp(["D.D...", "DDB...", ".DBD..", ".DBWD.", "..DWWD", "...DWD", "....DD"], 8, 4)
        _stamp(["..r", "r.."], 13, 6, 0.1)
    else:
        _stamp(["...rrrrrrrr...", "rr..........rr", "...rrrrrrrr..."], 1, 1, 0.2)
        _stamp([
            ".r.......r.",
            "....r......",
            "r...W...r..",
            ".W..W..W..r",
            "..WrWrW....",
            "...WWW.....",
            ".WWWWWWW...",
        ], 3, 3, -0.04)
