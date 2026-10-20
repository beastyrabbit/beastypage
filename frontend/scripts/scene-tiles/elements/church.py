"""Wide limestone church tower, slate steeple and a stained-glass nave."""

import math

import tilekit as kit

STONE = "#b4b2a1"
SLATE = "#7e8ba1"
PALETTE = kit.ramp("rockDark", STONE, "woodLight", "glow") + [
    SLATE, kit.BASE["paint"], kit.BASE["red"], kit.BASE["grassLight"],
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
    material = _paint(color) if isinstance(color, str) else color
    if "glow" in material:
        material.cycles.emission_sampling = "NONE"
    obj = kit.prism([(x * P, z * P) for x, z in points], material, y, y + .01)
    obj.visible_shadow = obj.visible_diffuse = obj.visible_glossy = False


def _box(a, b, c, d, color, y=-.3):
    _face([(a, b), (c, b), (c, d), (a, d)], color, y)


def _arch(x, z, w, h, color, y):
    r = w / 2
    points = [(x, z), (x + w, z), (x + w, z + h - r)]
    points += [(x + r + r * math.cos(a * math.pi / 8),
                z + h - r + r * math.sin(a * math.pi / 8)) for a in range(9)]
    _face(points, color, y)


def _disc(x, z, radius, color, y):
    _face([(x + radius * math.cos(a * math.pi / 8),
            z + radius * math.sin(a * math.pi / 8)) for a in range(16)], color, y)


def _rose(x, z, radius, glass):
    _disc(x, z, radius, "rockDark", -.54)
    _disc(x, z, radius - .65, glass, -.56)
    _box(x - .3, z - radius + .5, x + .3, z + radius - .5, STONE, -.58)
    _box(x - radius + .5, z - .3, x + radius - .5, z + .3, STONE, -.58)


def _door(x, width, height):
    _arch(x, 1, width, height, "rockDark", -.52)
    _arch(x + 1, 1, width - 2, height - 1, "woodLight", -.54)
    _box(x + width / 2 - .5, 1, x + width / 2 + .5, height - 1,
         kit.shade(kit.BASE["woodLight"], .72), -.56)
    _box(x + 1, 2, x + width - 1, 3, "rockDark", -.58)


def _single(glass):
    # A complete nave and a smaller side steeple fit into one cell.
    _box(1, 1, 12, 9, "rockDark")
    _box(2, 2, 11, 9, STONE, -.32)
    _face([(0, 8), (6, 13), (13, 8)], "rockDark", -.34)
    _face([(2, 9), (6, 12), (10, 9)], SLATE, -.36)
    _box(10, 1, 15, 11, "rockDark", -.38)
    _box(11, 2, 14, 11, STONE, -.40)
    _face([(9, 10), (12.5, 15), (16, 10)], "rockDark", -.42)
    _face([(10, 11), (12.5, 14), (13, 11)], SLATE, -.44)
    _box(12, 13, 13, 16, "rockDark", -.46)
    _box(11, 14, 14, 15, "rockDark", -.46)
    _arch(11, 6, 3, 4, "rockDark", -.48)
    _arch(12, 7, 1, 2, glass, -.50)
    _door(3, 6, 6)
    _rose(6, 8.5, 2.1, glass)
    _box(1, 1, 15, 2, "rockDark", -.60)


def build(tile):
    glass = kit.glow("glow", 1.4) if tile.variant == "night" else "red"
    if not tile.n and not tile.s:
        _single(glass)
        return

    left, right = (-16 if tile.w else 3), (32 if tile.e else 13)
    low, high = (-16 if tile.s else 1), (32 if tile.n else 7)
    _box(left, low, right, high, "rockDark")
    _box(left + (not tile.w), low, right - (not tile.e), high, STONE, -.32)
    _box(left + (not tile.w), low, left + 2, high,
         kit.shade(STONE, 1.22), -.34)
    if not tile.n:
        # Middle cells have identical keys. Keep the belfry beneath the steeple
        # here, instead of repeating clocks and bells down the whole tower.
        _box(2, 6, 14, 7, "rockDark", -.36)
        _face([(2, 7), (8, 14), (14, 7)], "rockDark", -.38)
        _face([(3, 8), (8, 14), (8, 8)], SLATE, -.40)
        _box(7, 13, 8, 16, "rockDark", -.42)
        _box(6, 14, 10, 15, "rockDark", -.42)
        for x in (4, 10):
            _arch(x, 1, 2, 5, "rockDark", -.44)
            for z in (2, 4):
                _box(x, z, x + 2, z + 1, kit.shade(STONE, .72), -.46)
        _disc(8, 3.5, 2.5, "rockDark", -.48)
        _disc(8, 3.5, 1.8, "paint", -.50)
        _box(7, 3, 8, 5, "rockDark", -.52)
        _box(8, 3, 10, 4, "rockDark", -.52)
    elif tile.s:
        # Mostly plain masonry, with one narrow slit and staggered joints.
        _arch(7, 6, 2, 5, "rockDark", -.38)
        _box(7.5, 7, 8.5, 10, glass, -.40)
        for x, z in ((5, 3), (9, 12)):
            _box(x, z, x + 2, z + 1, kit.shade(STONE, .72), -.36)

    if not tile.s:
        l, r = (-16 if tile.w else 1), (32 if tile.e else 15)
        _box(l, 1, r, 11, "rockDark", -.40)
        _box(l + 1, 2, r - 1, 11, STONE, -.42)
        _face([(l - 1, 10), (8, 16), (r + 1, 10)], "rockDark", -.44)
        _face([(l + 2, 11), (8, 15), (r - 2, 11)], SLATE, -.46)
        _door(5, 6, 8)
        _rose(8, 10.5, 2.2, glass)
        for x in (2, 12):
            _arch(x, 5, 2, 4, "rockDark", -.48)
            _arch(x + .5, 6, 1, 2.5, glass, -.50)
        _box(l, 1, r, 2, "rockDark", -.60)
