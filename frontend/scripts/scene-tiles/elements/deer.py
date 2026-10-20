"""A branching-antler stag and a long-eared grazing doe, in side view."""

import tilekit as kit
from animalkit import draw_canvas, stamp_canvas as _stamp

FUR = kit.ramp("#b67c49")
PALETTE = FUR + ["#382b25", "#edcf96", "#345337"]
COLORS = {"#": "#382b25", "k": "#382b25", "b": FUR[0],
          "m": FUR[1], "l": FUR[2], "w": "#edcf96", "_": "#345337"}

STAG = (
    "................",
    ".........#..#...",
    "........#.#.#...",
    ".........###....",
    ".......#..#.....",
    "........##mm#...",
    ".........#mkb#..",
    "..#.....#lm##...",
    ".#w#####lmm#....",
    "..#llllllmm#....",
    "..#mmmmmbb#.....",
    "...#bb###b#.....",
    "...#b#..#b#.....",
    "...#b#..#b#.....",
    "...##...##......",
)

DOE_BODY = (
    ".#.....##.",
    "#w#####lm#",
    ".#lllllmm#",
    ".#mmmmbbb#",
    "..#bb##b#.",
    "..#b#.#b#.",
    "..#b#.#b#.",
    "..##..##..",
)
DOE_HEAD = (
    ".#.#..",
    "#l#l#.",
    ".#lm#.",
    ".#mkw#",
    "..#mw#",
    "..###.",
)

def build(tile):
    canvas = [["."] * 16 for _ in range(16)]
    _stamp(canvas, ("...._______.....",), y=15)
    if tile.alt == 0:
        _stamp(canvas, STAG)
        # A single ear folds sideways, leaving the antlers still.
        if tile.frame == 2:
            canvas[4][7] = "."
            canvas[5][7] = "#"
    else:
        _stamp(canvas, DOE_BODY, 1, 7)
        # The muzzle dips toward the grass, then lifts on the loop.
        dip = (0, 1, 1, 0)[tile.frame % 4]
        _stamp(canvas, DOE_HEAD, 9, 5 + dip)
    draw_canvas(canvas, COLORS)

