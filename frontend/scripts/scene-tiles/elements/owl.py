"""Tufted and round-headed tawny owls blinking on cut tree stumps."""

import tilekit as kit

FEATHERS = kit.ramp("#90623f")
PALETTE = FEATHERS + ["#2d241e", "#c6a574", "#e9c857", "#c58e3b",
                      "#493022", "#725035", "#b58b56", "#345337"]
COLORS = {"#": "#2d241e", "k": "#2d241e", "b": FEATHERS[0],
          "m": FEATHERS[1], "l": "#c6a574", "Y": "#e9c857",
          "n": "#c58e3b", "d": "#493022", "r": "#725035",
          "h": "#b58b56", "_": "#345337"}

HEADS = (
    (
        ".#........#.",
        ".#b######b#.",
        "#lYYllllYYl#",
        "#YkkYllYkkY#",
        "#YkkYllYkkY#",
        "#bYYlnllYYb#",
        ".#bmllllmb#.",
    ),
    (
        "............",
        "..########..",
        ".#YYllllYY#.",
        "#YkkYllYkkY#",
        "#YkkYllYkkY#",
        "#bYYlnllYYb#",
        ".#bmllllmb#.",
    ),
)
BODY = (
    ".#bmllllmb#.",
    ".#bmblblmb#.",
    "..#bllllb#..",
    "...#n##n#...",
)
STUMP = (
    ".##########.",
    "#hhrrrrrrhh#",
    ".#drdddrdd#.",
    ".##dd#ddd##.",
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
            # Shading is painted into the sprite. A flat surface keeps the
            # tiny black pupils from picking up light from their yellow rims.
            # No glow metadata: the scene still tints the entire owl normally.
            material = kit.mat(color).copy()
            nodes = material.node_tree.nodes
            nodes.clear()
            surface = nodes.new("ShaderNodeEmission")
            surface.inputs["Color"].default_value = kit.linear(color)
            surface.inputs["Strength"].default_value = 1
            output = nodes.new("ShaderNodeOutputMaterial")
            material.node_tree.links.new(surface.outputs[0], output.inputs["Surface"])
            kit.mesh(verts, faces, material, name="animal-" + ink)


def build(tile):
    canvas = [["."] * 16 for _ in range(16)]
    _stamp(canvas, ("...__________...",), y=15)
    # Keep all four stump rows below the owl, including its oval cut surface.
    _stamp(canvas, STUMP, 2, 11, mirror=tile.alt == 1)
    _stamp(canvas, BODY, 2, 7, mirror=tile.alt == 1)
    _stamp(canvas, HEADS[tile.alt], 2)
    blink = tile.frame == (2 if tile.alt == 0 else 3)
    if blink:
        for left in (3, 9):
            for y in range(2, 6):
                for x in range(left, left + 4):
                    canvas[y][x] = "#" if y == 3 else "l"
    _draw(canvas)

