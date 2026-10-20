"""Curtain-wall towers: blue glass, dark steel and a stepped Art Deco crown."""

import tilekit as kit

PALETTE = kit.ramp("builtDark", "water", "waterLight", "sand", "glow") + [kit.BASE["red"]]
P = 1 / 16
_RIMS = {}


def _rim(color):
    """Common spandrel paint is unlit, but is tinted normally by the app."""
    if color not in _RIMS:
        material = kit.mat(color).copy()
        material.node_tree.nodes.clear()
        paint = material.node_tree.nodes.new("ShaderNodeEmission")
        paint.inputs["Color"].default_value = kit.linear(kit.BASE[color])
        paint.inputs["Strength"].default_value = 1
        output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
        material.node_tree.links.new(paint.outputs[0], output.inputs["Surface"])
        material.cycles.emission_sampling = "NONE"
        _RIMS[color] = material
    return _RIMS[color]


def _box(a, b, c, d, color, y=-.3):
    material = kit.mat(color) if isinstance(color, str) else color
    if "glow" in material:
        material.cycles.emission_sampling = "NONE"
    obj = kit.box(a * P, b * P, c * P, d * P, material, y, y + .01)
    obj.visible_shadow = obj.visible_diffuse = obj.visible_glossy = False


def build(tile):
    alt = tile.alt % 3
    compact = not tile.n and not tile.s
    left, right = (-16 if tile.w else 3), (32 if tile.e else 13)
    bottom = -16 if tile.s else 1
    top = 9 if compact else 32 if tile.n else 8
    _box(left, bottom, right, top, "builtDark")
    # Border piers are common to every alternative, including N/S joins.
    for x in range(-12, 29, 4):
        if left <= x and x + 1 <= right:
            _box(x, bottom, x + 1, top, "waterLight", -.32)
    if alt == 2:
        _box(5, max(1, bottom), 12, min(15, top), "sand", -.33)
    rows = (3, 6) if compact else (1, 5, 9, 13)
    for z in rows:
        if z + 2 > top:
            continue
        for col, x in enumerate(range(5, 13, 3)):
            lit = (col + z + alt) % 5 != 0
            if col == 1 and z == (6 if compact else 9):
                lit = lit and tile.frame != 2
            color = ("water", "builtDark", "builtDark")[alt]
            _box(x, z, x + 2, z + 2, color, -.35)
            if tile.variant == "night" and lit:
                _box(x, z, x + 2, z + 2, kit.glow("glow", 1.3), -.37)
            elif alt == 0:
                _box(x, z + 1, x + 2, z + 2, "waterLight", -.37)
            elif alt == 1:
                _box(x, z + 1, x + 1, z + 2, "water", -.37)
        if alt == 2:
            _box(5, z + 2, 12, z + 3, "sand", -.39)
    if not tile.n:
        # A fixed-width lower crown meets any lower-storey alternative.
        _box(left, top - 1, right, top, "waterLight", -.40)
        l, r = (left if tile.w else 4), (right if tile.e else 12)
        crown = ("water", "builtDark", "sand")[alt]
        _box(l, top, r, 12, "builtDark", -.34)
        _box(max(4, l), top, min(12, r), 12, crown, -.35)
        if alt == 2:
            _box(5, 12, 11, 13, "sand", -.35)
            _box(6, 13, 10, 14, "sand", -.36)
        else:
            _box(6, 12, 10, 13, "waterLight" if alt == 0 else "builtDark", -.36)
            _box(5, top, 6, 12, "waterLight", -.38)
            _box(10, top, 11, 12, "waterLight", -.38)
        _box(8, 13, 9, 16, "builtDark", -.39)
        beacon = kit.glow("red", 1.5) if tile.frame in (0, 1) else kit.mat("builtDark")
        _box(8, 15, 9, 16, beacon, -.42)
    if not tile.s:
        _box(left, 1, right, 2, "builtDark", -.42)
        _box(6, 2, 11, 5, "builtDark", -.43)
        lobby = kit.glow("glow", 1.3) if tile.variant == "night" else kit.mat("waterLight")
        _box(7, 2, 10, 5, lobby, -.44)
        _box(8, 2, 9, 5, "builtDark", -.45)
        _box(5, 5, 12, 6, "waterLight", -.46)
    if tile.n:
        _box(left, 15, right, 16, _rim("builtDark"), -.60)
        for x in range(-12, 29, 4):
            if left <= x and x + 1 <= right:
                _box(x, 15, x + 1, 16, _rim("waterLight"), -.62)
