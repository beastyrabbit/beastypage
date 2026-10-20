"""Pixel illustration, planting and border helpers for fields and farm tiles."""

import tilekit as kit


def _ink(color, materials):
    """Flat daylight ink without glow metadata, so scene tint still applies."""
    if color not in materials:
        material = kit.mat(color).copy()
        nodes = material.node_tree.nodes
        nodes.clear()
        ink = nodes.new("ShaderNodeEmission")
        ink.inputs["Color"].default_value = kit.linear(kit.BASE.get(color, color))
        ink.inputs["Strength"].default_value = 1
        output = nodes.new("ShaderNodeOutputMaterial")
        material.node_tree.links.new(ink.outputs[0], output.inputs["Surface"])
        materials[color] = material
    return materials[color]


class Picture:
    def __init__(self, name, materials):
        self.name = name
        self.materials = materials
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
            obj = kit.mesh(verts, faces, _ink(color, self.materials), name=self.name)
            _unlit(obj)


def _unlit(obj):
    obj.visible_shadow = False
    obj.visible_diffuse = False
    obj.visible_glossy = False


def poly(points, color, front=-0.3):
    obj = kit.prism([(x / 16, z / 16) for x, z in points],
                    kit.mat(color), front, front + 0.01)
    _unlit(obj)


def box(x0, z0, x1, z1, color, front=-0.3):
    poly([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], color, front)


def lit_poly(points, color, front=-0.3):
    material = kit.mat(color) if isinstance(color, str) else color
    if "glow" in material:
        material.cycles.emission_sampling = "NONE"
    obj = kit.prism([(x / 16, z / 16) for x, z in points],
                    material, front, front + 0.01)
    _unlit(obj)


def lit_box(x0, z0, x1, z1, color, front=-0.3):
    lit_poly([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], color, front)


def patch(points, colour, depth):
    obj = kit.prism([(x / 16, z / 16) for x, z in points],
                    kit.mat(colour), -depth, -depth + .015)
    obj.visible_shadow = False
    obj.visible_diffuse = False


def rect(x, z, w, h, colour, depth):
    patch([(x, z), (x + w, z), (x + w, z + h), (x, z + h)], colour, depth)


def neighbours(tile):
    for dz in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if tile.has(dx, dz):
                yield dx, dz


def field_bounds(tile):
    return ((-1 if tile.w else 0), (2 if tile.e else 1),
            (-1 if tile.s else 0), (2 if tile.n else 1))


def rim(tile, material, front, back):
    left, right, bottom, top = field_bounds(tile)
    for closed, bounds in (
        (not tile.w, (0, bottom, .0625, top)), (not tile.e, (.9375, bottom, 1, top)),
        (not tile.s, (left, 0, right, .0625)), (not tile.n, (left, .9375, right, 1)),
    ):
        if closed:
            kit.box(*bounds, material, front, back)
