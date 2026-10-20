"""Flat facade materials, pixel geometry and sky mesh cells."""

import tilekit as kit

P = 1 / 16


class Shapes:
    """Keep each builder's paint cache separate from its glass materials."""

    def __init__(self, painted=False):
        self.painted = painted
        self.materials = {}

    def paint(self, color):
        if color not in self.materials:
            material = kit.mat(color).copy()
            material.node_tree.nodes.clear()
            node = material.node_tree.nodes.new("ShaderNodeEmission")
            node.inputs["Color"].default_value = kit.linear(kit.BASE.get(color, color))
            node.inputs["Strength"].default_value = 1
            out = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
            material.node_tree.links.new(node.outputs[0], out.inputs["Surface"])
            material.cycles.emission_sampling = "NONE"
            self.materials[color] = material
        return self.materials[color]

    def material(self, color):
        if isinstance(color, str):
            material = self.paint(color) if self.painted else kit.mat(color)
        else:
            material = color
        if "glow" in material:
            material.cycles.emission_sampling = "NONE"
        return material

    def face(self, points, color, y=-.3):
        obj = kit.prism([(x * P, z * P) for x, z in points],
                        self.material(color), y, y + .01)
        obj.visible_shadow = obj.visible_diffuse = obj.visible_glossy = False

    def polygon_box(self, a, b, c, d, color, y=-.3):
        self.face([(a, b), (c, b), (c, d), (a, d)], color, y)

    def box(self, a, b, c, d, color, y=-.3):
        obj = kit.box(a * P, b * P, c * P, d * P,
                      self.material(color), y, y + .01)
        obj.visible_shadow = obj.visible_diffuse = obj.visible_glossy = False


def add_pixel(verts, faces, tone, i, j, steps):
    vertices, polygons = verts[tone], faces[tone]
    k = len(vertices)
    vertices.extend([(i / steps, 0, j / steps), ((i + 1) / steps, 0, j / steps),
                     ((i + 1) / steps, 0, (j + 1) / steps), (i / steps, 0, (j + 1) / steps)])
    polygons.append((k, k + 1, k + 2, k + 3))


def raster(steps, count, tone_at):
    verts, faces = [[] for _ in range(count)], [[] for _ in range(count)]
    for j in range(steps):
        for i in range(steps):
            tone = tone_at(i, j)
            if tone is not None:
                add_pixel(verts, faces, tone, i, j, steps)
    return verts, faces
