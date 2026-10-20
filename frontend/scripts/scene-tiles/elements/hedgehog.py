"""A low spiny hedgehog with a pale pointed face and tiny waddling feet."""

import tilekit as kit

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
    _stamp(canvas, FORAGING if tile.alt == 0 else SNIFFING,
           1, 5, mirror=tile.alt == 1)
    # The short legs alternate, with the snout and spines staying readable.
    if tile.frame in (1, 3):
        if tile.frame == 1:
            canvas[14][4], canvas[14][6] = ".", "#"
        else:
            canvas[14][10], canvas[14][12] = ".", "#"
    _draw(canvas)

