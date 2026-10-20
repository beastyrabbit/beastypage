"""Broad stone fountain with an upper bowl, arcing jets and falling splashes."""

import math

import tilekit as kit

PALETTE = kit.ramp("rockDark", "rockLight", "water", "waterLight") + [kit.BASE["foam"]]
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


def _box(a, b, c, d, color, y):
    _face([(a, b), (c, b), (c, d), (a, d)], color, y)


def _oval(x, z, rx, rz, color, y):
    _face([(x + rx * math.cos(k * math.pi / 8), z + rz * math.sin(k * math.pi / 8))
           for k in range(16)], color, y)


def build(tile):
    # Deep rounded basin fills fourteen pixels across and five pixels high.
    _oval(8, 2.5, 7, 2, "rockDark", -.30)
    _face([(1, 5), (15, 5), (14, 2), (12, 1), (4, 1), (2, 2)], "rockDark", -.32)
    _face([(2, 5), (14, 5), (13, 2), (4, 2), (3, 3)], "rockLight", -.34)
    _oval(8, 5, 7, 2.4, "rockDark", -.36)
    _oval(8, 5.3, 6.3, 1.8, "rockLight", -.38)
    _oval(8, 5.5, 5.2, 1.2, "water", -.40)
    _face([(2, 5), (3, 6), (6, 6.5), (6, 5.5), (3, 4.5)],
          kit.shade(kit.BASE["rockLight"], 1.22), -.42)
    _box(5, 3, 6, 4, "rockDark", -.43)
    _box(11, 2, 12, 4, "rockDark", -.43)
    # Column and a cupped upper tier, clear of the side streams.
    _face([(6, 4), (10, 4), (9, 9), (7, 9)], "rockDark", -.44)
    _box(7, 5, 8, 9, "rockLight", -.46)
    _face([(4, 10), (12, 10), (10, 8), (6, 8)], "rockDark", -.48)
    _face([(5, 10), (11, 10), (9, 9), (6, 9)], "rockLight", -.50)
    _oval(8, 10, 4, 1, "rockLight", -.52)
    _oval(8, 10.3, 2.8, .65, "water", -.54)
    jet = 13.6 + .45 * math.sin(2 * math.pi * tile.t)
    _box(7.5, 10, 8.5, jet, "waterLight", -.56)
    # Continuous bent jets at the crown, then detached falling drops.
    for side in (-1, 1):
        points = []
        for k in range(7):
            u = k / 6
            points.append((8 + side * (1 + 4.5 * u), jet - 7 * u * u))
        for a, b in zip(points[:4], points[1:5]):
            dx, dz = b[0] - a[0], b[1] - a[1]
            length = math.hypot(dx, dz)
            nx, nz = -.6 * dz / length, .6 * dx / length
            _face([(a[0] - nx, a[1] - nz), (b[0] - nx, b[1] - nz),
                   (b[0] + nx, b[1] + nz), (a[0] + nx, a[1] + nz)],
                  "waterLight", -.58)
        for k in range(2):
            u = .65 + ((k / 2 + tile.t) % 1) * .35
            x, z = 8 + side * (1 + 4.5 * u), jet - 7 * u * u
            _box(x - .5, z - .5, x + .5, z + .5, "foam", -.60)
        splash = (tile.frame + (1 if side == 1 else 0)) % 4
        x = 8 + side * 4.5
        _box(x - 1, 5.5, x + 1, 6.5, "waterLight", -.62)
        if splash in (1, 2):
            _box(x + side - .5, 6.5, x + side + .5, 7.5 + (splash == 1),
                 "foam", -.64)
    _box(7, jet, 9, jet + 1, "foam", -.62)
