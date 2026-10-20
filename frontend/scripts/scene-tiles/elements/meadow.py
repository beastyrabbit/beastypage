"""Lush tussocks with small drifts of daisies, poppies and purple wildflowers."""

import math

import tilekit as kit

PALETTE = (kit.ramp("grass", "grassLight", "red", "#a58bd6")
           + [kit.BASE["white"], "#f6d354", "#ae873b", "#739ad9"])
_MATERIALS = {}

# Separate species, spacing and heights, rather than recolouring one stamp.
# Coordinates are blossom centres in pixels, safely inside the open borders.
_FLOWERS = (
    ((3.5, 5.5, 3, "daisy"), (8.5, 10.5, 3, "daisy"),
     (12.5, 4.5, 2, "daisy")),
    ((4.5, 8.5, 3, "poppy"), (10.5, 3.5, 2, "poppy"),
     (12.5, 11.5, 3, "cornflower")),
    ((7.5, 12.5, 5, "yellow"),),
    ((3.5, 10.5, 3, "purple"), (6.5, 3.5, 2, "yellow"),
     (10.5, 7.5, 3, "purple"), (13.5, 12.5, 2, "yellow")),
)
_TUFTS = (
    ((5, 3), (11, 7)),
    ((4, 2), (8, 7)),
    ((4, 5), (11, 3), (8, 8)),
    ((5, 6), (12, 2)),
)


def _ink(color):
    """Flat illustration colour; regular atlas pixels still receive scene tint."""
    if color not in _MATERIALS:
        material = kit.mat(color).copy()
        nodes = material.node_tree.nodes
        nodes.clear()
        ink = nodes.new("ShaderNodeEmission")
        ink.inputs["Color"].default_value = kit.linear(kit.BASE.get(color, color))
        ink.inputs["Strength"].default_value = 1
        output = nodes.new("ShaderNodeOutputMaterial")
        material.node_tree.links.new(ink.outputs[0], output.inputs["Surface"])
        # No tilekit glow metadata: daylight art must darken normally at night.
        _MATERIALS[color] = material
    return _MATERIALS[color]


class _Picture:
    def __init__(self):
        self.parts = {}

    def poly(self, points, color, depth):
        verts, faces = self.parts.setdefault(color, ([], []))
        start = len(verts)
        verts.extend((x / 16, depth, z / 16) for x, z in points)
        faces.append(tuple(range(start, len(verts))))

    def rect(self, x, z, w, h, color, depth):
        self.poly([(x, z), (x + w, z), (x + w, z + h), (x, z + h)], color, depth)

    def finish(self):
        for color, (verts, faces) in self.parts.items():
            obj = kit.mesh(verts, faces, _ink(color), name="meadow")
            obj.visible_shadow = False
            obj.visible_diffuse = False
            obj.visible_glossy = False


def _grass(p, tile, x, z, index):
    sway = .55 * math.sin(math.tau * (tile.t + (x + z) / 16))
    depth = .25 + z * .012
    color = "grassLight" if index % 3 else "grass"
    # Broad clumps carry the grass colour, with a few taller blades.
    p.poly([(x - 3, z), (x - 3.5, z + 1.3), (x - 2.6, z + 2.3),
            (x - 1, z + 2.8), (x + .7, z + 2.5), (x + 2.8, z + 1.2),
            (x + 3.3, z)], kit.shade(kit.BASE["grass"], 1.22), depth)
    p.poly([(x - 1.6, z + .5), (x - 1.9 + sway, z + 4),
            (x - .3, z + 1.7), (x + .35 + sway, z + 5.3),
            (x + 1.05, z + 1.5), (x + 2.2 + sway, z + 3.2),
            (x + 1.9, z + .5)], color, depth - .01)


def _flower(p, tile, x, top, height, kind):
    sway = .3 * math.sin(math.tau * (tile.t + (x + top) / 16))
    head, z = x + sway, top - height
    depth = -.35
    p.poly([(x - .5, z), (x + .5, z), (head + .5, top),
            (head - .5, top)], kit.shade(kit.BASE["grass"], .72), depth)
    p.poly([(x, z + .5), (x + 1.5, z + 1.5),
            (x + 1, z + .25)], "grassLight", depth - .01)
    if kind == "daisy":
        # A three-pixel cross with a full pixel of yellow at its centre.
        p.rect(head - 1.5, top - .5, 3, 1, "white", depth - .03)
        p.rect(head - .5, top - 1.5, 1, 3, "white", depth - .03)
        p.rect(head - .5, top - .5, 1, 1, "#f6d354", depth - .04)
    elif kind == "poppy":
        p.rect(head - 1.5, top - .5, 3, 2, "red", depth - .03)
        p.rect(head - .5, top - .5, 1, 1,
               kit.shade(kit.BASE["red"], .72), depth - .04)
        p.rect(head - 1.5, top + .5, 1, 1,
               kit.shade(kit.BASE["red"], 1.22), depth - .04)
    else:
        color = {"yellow": "#f6d354", "purple": "#a58bd6",
                 "cornflower": "#739ad9"}[kind]
        p.rect(head - 1.5, top - .5, 3, 1, color, depth - .03)
        p.rect(head - .5, top - .5, 1, 2, color, depth - .03)
        centre = "#ae873b" if kind == "yellow" else kit.shade("#a58bd6", .72)
        p.rect(head - .5, top - .5, 1, 1, centre, depth - .04)


def _seed(p, tile, x, top):
    head = x + .35 * math.sin(math.tau * (tile.t + x / 16))
    p.poly([(x - .5, top - 5), (x + .5, top - 5),
            (head + .5, top), (head - .5, top)],
           kit.shade(kit.BASE["grass"], .72), -.25)
    p.rect(head - .5, top - 1, 1, 3, "#ae873b", -.27)
    p.rect(head - 1.5, top, 1, 1, "#f6d354", -.28)


def build(tile):
    p = _Picture()
    alt = tile.alt % len(_FLOWERS)
    p.rect(-1, -1, 18, 13.4 if not tile.n else 18, "grass", .9)
    for dz in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if not tile.has(dx, dz):
                continue
            for i, (x, z) in enumerate(((1, -.8), (7.4, .6), (13.8, -.3),
                                      (3.8, 5.1), (10.3, 4.2),
                                      (.5, 10), (6.6, 9), (13, 10.4))):
                _grass(p, tile, x + dx * 16, z + dz * 16, i)
            if tile.n:
                # Interior cover is low and dense, with no repeated skyline.
                for i, (x, z) in enumerate(_TUFTS[alt]):
                    _grass(p, tile, x + dx * 16, z + dz * 16, i + 1)
    # Flowers never cross an open side, so neighbouring alternatives can mix.
    for i, (x, top, height, kind) in enumerate(_FLOWERS[alt]):
        if not tile.n and i == (1 if alt == 0 else len(_FLOWERS[alt]) - 1):
            top = 14.5
            height = 5
        _flower(p, tile, x, top, height, kind)
    if not tile.n:
        # Different tall blades and seed stalks break up the closed north edge.
        x = (5, 9, 4, 7)[alt]
        _grass(p, tile, x, 10, alt)
    if alt == 2:
        _seed(p, tile, 12.5, 14 if not tile.n else 9)
    p.finish()
