"""A red squirrel holds a nut beneath its muzzle, with a huge curled tail."""

import tilekit as kit

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
    _draw(canvas)

