"""Connected city facades, with a narrow tower and broader apartment blocks."""

import tilekit as kit

PALETTE = kit.ramp("built", "builtLight", "builtDark", "rock", "waterLight", "glow")
P = 1 / 16


def build(tile):
    inset = 4 * P if tile.shape == "column" else P
    left, right = (-1 if tile.w else inset), (2 if tile.e else 1 - inset)
    bottom, top = (-1 if tile.s else P), (2 if tile.n else 13 * P)
    kit.box(left, bottom, right, top, kit.mat("built"))
    if not tile.w:
        kit.box(left, bottom, left + P, top, kit.mat("builtLight"), -0.30, -0.27)
    if not tile.e:
        kit.box(right - P, bottom, right, top, kit.mat("builtDark"), -0.30, -0.27)

    # Repeating storey ledges leave the north/south tile boundary untouched.
    for z in (7 * P,):
        kit.box(left, z, right, z + P, kit.mat("builtLight"), -0.32, -0.29)
    if tile.shape == "mass":
        kit.box(7 * P, bottom, 8 * P, top, kit.mat("builtDark"), -0.30, -0.27)

    if not tile.n:
        kit.box(left, 12 * P, right, 13 * P, kit.mat("builtDark"), -0.35, -0.30)
        kit.box(left - (0 if tile.w else P), 13 * P,
                right + (0 if tile.e else P), 14 * P,
                kit.mat("builtLight"), -0.38, 0.30)
        if tile.alt:
            kit.box(9 * P, 14 * P, 10 * P, 16 * P, kit.mat("builtDark"), 0, 0.10)
        else:
            kit.box(5 * P, 14 * P, 8 * P, 15 * P, kit.mat("rock"), 0, 0.15)

    xs = (5 * P, 9 * P) if tile.shape == "column" else (3 * P, 7 * P, 11 * P)
    for row, z in enumerate((3 * P, 9 * P)):
        for col, x in enumerate(xs):
            if not tile.s and row == 0 and col == 1:
                continue
            kit.box(x, z - P, x + 2 * P, z + 2 * P, kit.mat("builtDark"), -0.34, -0.31)
            lit = (col + row + tile.alt) % 4 != 0
            glass = kit.glow("glow", 1.5) if tile.variant == "night" and lit else kit.mat("waterLight")
            _pane(x, z, x + 2 * P, z + 2 * P, glass, -0.37, -0.35)
    if not tile.s:
        kit.box(left, P, right, 2 * P, kit.mat("builtDark"), -0.32, -0.30)
        kit.box(6 * P, P, 10 * P, 6 * P, kit.mat("builtDark"), -0.39, -0.37)
        glass = kit.glow("glow", 1.2) if tile.variant == "night" else kit.mat("waterLight")
        _pane(7 * P, 2 * P, 9 * P, 5 * P, glass, -0.42, -0.40)
        kit.box(5 * P, 6 * P, 11 * P, 7 * P, kit.mat("builtLight"), -0.46, -0.40)


def _pane(x0, z0, x1, z1, material, y0, y1):
    # Keep self-lit windows from illuminating the facade's reusable borders.
    if "glow" in material:
        material.cycles.emission_sampling = "NONE"
    obj = kit.box(x0, z0, x1, z1, material, y0, y1)
    obj.visible_diffuse = False
    obj.visible_glossy = False
