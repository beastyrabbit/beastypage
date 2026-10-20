"""Orange side-view foxes with dark stockings and broad white-tipped tails."""

import tilekit as kit

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
    _draw(canvas)

