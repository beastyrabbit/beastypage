"""Two rabbits: a tall watchful sitter and a smaller crouching companion."""

import tilekit as kit
from animalkit import draw_canvas, stamp_canvas as _stamp

FUR = kit.ramp("#b2a092", "#ddd9c7")
PALETTE = FUR + ["#393039", "#c98787", "#345337"]
COLORS = {"#": "#393039", "k": "#393039", "l": FUR[4],
          "w": FUR[5], "m": FUR[1], "p": "#c98787", "_": "#345337"}

SITTER = (
    ".#...#.",
    "#l#.#l#",
    "#p#.#p#",
    "#l#.#l#",
    ".#lll#.",
    ".#lkl#.",
    "..#ww##",
    "..#lw#.",
    ".#llw#.",
    "#lmlw#w",
    "#mllw##",
    ".#mmm#.",
    ".#####.",
)
CROUCHER = (
    ".#.#..",
    "#m#m#.",
    ".#mm#.",
    ".#mk##",
    "#mmww#",
    "#mmlm#",
    ".####.",
)

def build(tile):
    canvas = [["."] * 16 for _ in range(16)]
    _stamp(canvas, (".._____.._____..",), y=15)
    hop = (0, 1, 0, 0)[tile.frame % 4]
    if tile.alt == 0:
        _stamp(canvas, SITTER, 1, 2)
        _stamp(canvas, CROUCHER, 9, 8 - hop)
        if tile.frame == 2:
            canvas[2][2], canvas[2][1] = ".", "#"
    else:
        # The upright rabbit watches in the other direction.
        _stamp(canvas, SITTER, 8, 2, mirror=True)
        _stamp(canvas, CROUCHER, 1, 8 - hop, mirror=True)
        if tile.frame == 2:
            canvas[11][1] = "p"
    draw_canvas(canvas, COLORS)

