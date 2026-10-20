"""A low spiny hedgehog with a pale pointed face and tiny waddling feet."""

import tilekit as kit
from animalkit import draw_canvas, stamp_canvas as _stamp

SPINES = kit.ramp("#77513c")
PALETTE = SPINES + ["#322a28", "#d6b182", "#345337"]
COLORS = {"#": "#322a28", "k": "#322a28", "m": SPINES[1],
          "l": SPINES[2], "t": "#d6b182", "_": "#345337"}

FORAGING = (
    "...#.#.#......",
    "..#l#m#m#.....",
    ".#llmmmmm#....",
    "#lmmlmmmmm#...",
    ".#mmmmmlmm###.",
    "#mmmlmmmm#ttt#",
    ".#mmmmmmtlktk#",
    "..#mmmmmtttt#.",
    "...##ttttt##..",
    "...##....##...",
)
SNIFFING = (
    "....#.#.#.....",
    "...#m#m#l#....",
    "..#mmmmlll#...",
    ".#mmmmlmmlm#..",
    "#mmlmmmmmmm##.",
    ".#mmmmmml#tk#",
    ".#mmmmmmltttt#",
    "..#mmmmmtttt#.",
    "...##ttttt##..",
    "...##....##...",
)

def build(tile):
    canvas = [["."] * 16 for _ in range(16)]
    _stamp(canvas, ("...__________...",), y=15)
    _stamp(canvas, FORAGING if tile.alt == 0 else SNIFFING,
           1, 5, mirror=tile.alt == 1)
    # The short legs alternate, with the snout and spines staying readable.
    if tile.frame in (1, 3):
        if tile.frame == 1:
            canvas[14][4], canvas[14][6] = ".", "#"
        else:
            canvas[14][10], canvas[14][12] = ".", "#"
    draw_canvas(canvas, COLORS)

