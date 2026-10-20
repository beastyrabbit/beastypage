"""A red squirrel holds a nut beneath its muzzle, with a huge curled tail."""

import tilekit as kit
from animalkit import draw_canvas, stamp_canvas as _stamp

FUR = kit.ramp("#bc572d")
PALETTE = FUR + ["#392a28", "#ebc995", "#b58b4c", "#345337"]
COLORS = {"#": "#392a28", "k": "#392a28", "b": FUR[0],
          "r": FUR[1], "l": FUR[2], "w": "#ebc995",
          "n": "#b58b4c", "_": "#345337"}

TAIL = (
    "..####.",
    ".#llrr#",
    "#llrrr#",
    "#lrrb#.",
    "#lrb#..",
    "#lrb#..",
    ".#rr#..",
    ".#rrr#.",
    "..#rrr#",
    "...#rr#",
    "....##.",
)
SITTER = (
    "...#...",
    "..#l#..",
    "..#rl#.",
    ".#rlk##",
    "..#wwk#",
    "..#rw#.",
    ".#rrnn#",
    "#rrwnn#",
    "#rbww#.",
    ".#rrr##",
    ".######",
)

def build(tile):
    canvas = [["."] * 16 for _ in range(16)]
    _stamp(canvas, ("...__________...",), y=15)
    flick = (0, -1, 0, 1)[tile.frame % 4]
    if tile.alt == 0:
        _stamp(canvas, TAIL, 1, 2 + flick)
        _stamp(canvas, SITTER, 7, 4)
    else:
        # A left-facing sitter has its tail swept further behind its back.
        _stamp(canvas, TAIL, 8, 2 + flick, mirror=True)
        _stamp(canvas, SITTER, 1, 4, mirror=True)
        if tile.frame == 2:
            # One paw moves over the nut during a nibble.
            canvas[10][2] = "r"
    draw_canvas(canvas, COLORS)

