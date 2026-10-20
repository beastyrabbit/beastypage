"""Two rabbits: a tall watchful sitter and a smaller crouching companion."""

import tilekit as kit

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
    _draw(canvas)

