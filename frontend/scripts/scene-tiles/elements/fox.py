"""Orange side-view foxes with dark stockings and broad white-tipped tails."""

import tilekit as kit
from animalkit import draw_canvas, stamp_canvas as _stamp

FUR = kit.ramp("#d96b2b")
PALETTE = FUR + ["#382b2b", "#f0dfb7", "#345337"]
COLORS = {"#": "#382b2b", "k": "#382b2b", "b": FUR[0],
          "r": FUR[1], "l": FUR[2], "w": "#f0dfb7", "_": "#345337"}

WALKER = (
    "....#.#.",
    "...#r#r#",
    "...#rrr#",
    "..#rlkl#",
    ".#rrww##",
    "#rrrrw#.",
    "#bbwww#.",
    ".#b##b#.",
    ".##..##.",
)
TAIL = (
    ".##....",
    "#ww#...",
    "#wwr#..",
    ".#rrr#.",
    "..#rrr#",
    "...#rr#",
    "....###",
)
SITTER = (
    "...#.#.",
    "..#r#r#",
    "..#lrr#",
    ".#rlkl#",
    "..#ww##",
    "..#rw#.",
    ".#rrww#",
    ".#rbww#",
    "#rrbww#",
    ".##bb##",
)
CURLED_TAIL = (
    "....##.",
    ".###rr#",
    "#wwrrrr",
    "#wwrrr#",
    ".#####.",
)
LIFTED_TAIL = (
    ".##.##.",
    "#ww#rr#",
    "#wwrrrr",
    ".#rrrr#",
    "..####.",
)

def build(tile):
    canvas = [["."] * 16 for _ in range(16)]
    _stamp(canvas, ("..___________...",), y=15)
    flick = (0, -1, 0, 1)[tile.frame % 4]
    if tile.alt == 0:
        _stamp(canvas, TAIL, 1, 7 + flick)
        _stamp(canvas, WALKER, 6, 6)
    else:
        # The white tip lifts, while the seated paws remain planted.
        tail = LIFTED_TAIL if flick == -1 else CURLED_TAIL
        _stamp(canvas, tail, 1, 10)
        _stamp(canvas, SITTER, 7, 5)
    draw_canvas(canvas, COLORS)

