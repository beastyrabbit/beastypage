"""A branching-antler stag and a long-eared grazing doe, in side view."""

import tilekit as kit

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

def _stamp(canvas, art, x=0, y=0, mirror=False):
    """Place pixel art in the picture plane; dots leave the background clear."""
    for row, line in enumerate(art):
        for col, ink in enumerate(line):
            if ink != ".":
                px = x + (len(line) - 1 - col if mirror else col)
                py = y + row
                assert 0 <= px < 16 and 0 <= py < 16
                canvas[py][px] = ink


def _draw(canvas):
    # One front-facing mesh per ink. Pixel-aligned quads survive the 4x
    # supersampling without losing eyes, ear gaps or the one-pixel outline.
    for ink, color in COLORS.items():
        verts, faces = [], []
        for row, line in enumerate(canvas):
            col = 0
            while col < 16:
                if line[col] != ink:
                    col += 1
                    continue
                end = col + 1
                while end < 16 and line[end] == ink:
                    end += 1
                x0, x1 = col / 16, end / 16
                z0, z1 = (15 - row) / 16, (16 - row) / 16
                start = len(verts)
                verts.extend([(x0, 0, z0), (x1, 0, z0),
                              (x1, 0, z1), (x0, 0, z1)])
                faces.append(tuple(start + i for i in range(4)))
                col = end
        if faces:
            kit.mesh(verts, faces, kit.mat(color), name="animal-" + ink)


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
    _draw(canvas)

