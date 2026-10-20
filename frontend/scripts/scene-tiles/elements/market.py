"""Tall open market stalls, striped canvas and crates of colourful produce."""

import math

import tilekit as kit

ORANGE = "#ed963c"
PALETTE = kit.ramp("trunk", "woodLight", "red", "grassLight") + [
    kit.BASE["paint"], ORANGE,
]
P = 1 / 16
_PAINT = {}


def _paint(color):
    if color not in _PAINT:
        material = kit.mat(color).copy()
        material.node_tree.nodes.clear()
        node = material.node_tree.nodes.new("ShaderNodeEmission")
        node.inputs["Color"].default_value = kit.linear(kit.BASE.get(color, color))
        node.inputs["Strength"].default_value = 1
        out = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
        material.node_tree.links.new(node.outputs[0], out.inputs["Surface"])
        material.cycles.emission_sampling = "NONE"
        _PAINT[color] = material
    return _PAINT[color]


def _face(points, color, y=-.3):
    obj = kit.prism([(x * P, z * P) for x, z in points], _paint(color), y, y + .01)
    obj.visible_shadow = obj.visible_diffuse = obj.visible_glossy = False


def _box(a, b, c, d, color, y=-.3):
    _face([(a, b), (c, b), (c, d), (a, d)], color, y)


def build(tile):
    left, right = (0 if tile.w else 1), (16 if tile.e else 15)
    # Red and green bays repeat within a cell because market has no alt keys.
    for bay, color in enumerate(("red", "grassLight")):
        a, b = max(left, bay * 8), min(right, (bay + 1) * 8)
        # Two thin poles, with open air behind produce rather than a wall.
        _box(a + 1, 1, a + 2, 13, "trunk")
        _box(b - 2, 1, b - 1, 13, "woodLight")
        _box(a, 1, b, 4, "trunk", -.32)
        _box(a + 1, 2, b - 1, 3, "woodLight", -.34)
        _box(a + 3, 1, a + 4, 4, "trunk", -.36)
        _box(a, 4, b, 5, "woodLight", -.38)
        for j, fruit in enumerate(("red", ORANGE, "grassLight")):
            x = a + .5 + j * (b - a - 1) / 3
            _box(x, 5, x + 2, 7, fruit, -.40)
            _box(x + .5, 7, x + 1.5, 7.8,
                 "grassLight" if j == 0 else fruit, -.42)
        _box(a, 4, b, 5, "woodLight", -.44)
        for x in (a, a + 3, b - 1):
            _box(x, 4, x + 1, 6, "trunk", -.46)
        # Four-pixel canvas and loose hems. Border columns never move.
        for x in range(int(a), int(b)):
            cloth = color if (x // 2) % 2 == 0 else "paint"
            phase = math.sin(2 * math.pi * tile.t + x * math.pi / 4)
            hem = 11 + .8 * phase if x not in (0, 1, 14, 15) else 11
            _box(x, hem, x + 1, 13, cloth, -.50)
            _face([(x, 13), (x + 1, 13), (x + 1, 14), (x, 14)],
                  cloth, -.48)
        _box(a, 14, b, 15, "trunk", -.52)
