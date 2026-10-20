"""Uneven ranks of sunflowers with large seed discs and heart-shaped leaves."""

import math

import tilekit as kit

PALETTE = kit.ramp("foliageDark", "foliage", "foliageLight", "#f4c632", "#603c25") + ["#ffe684"]
_MATERIALS = {}


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
            obj = kit.mesh(verts, faces, _ink(color), name="sunflowers")
            obj.visible_shadow = False
            obj.visible_diffuse = False
            obj.visible_glossy = False


def _flower(p, tile, x, base, height, radius, index, back=False):
    sway = .55 * math.sin(math.tau * (tile.t + (x + base) / 16))
    if radius + 1 < x < 15 - radius and base + height - radius > 3 and base + height + radius < 14:
        height += tile.alt * .45
    cx, cz = x + sway, base + height
    depth = -.4 + base * .025
    green = "foliage" if back else "foliageLight"
    p.poly([(x - .4, base), (x + .4, base), (cx + .3, cz),
            (cx - .3, cz)], green, depth)
    for side, level in ((-1, .28), (1, .57)):
        nx, z = x + sway * level, base + height * level
        # Notched shoulders and a pointed tip give a heart-shaped silhouette.
        p.poly([(nx, z), (nx + side * .7, z + 1.35),
                (nx + side * 1.7, z + 1.6), (nx + side * 2, z + .8),
                (nx + side * 2.7, z + .9), (nx + side * 3, z + .15),
                (nx + side * 2.3, z - 1), (nx + side * .7, z - .45)],
               green, depth - .02)
        p.poly([(nx, z), (nx + side * 2.8, z + .1),
                (nx + side * .8, z - .6)], "foliageDark", depth - .03)
    turned = index % 4 == 2
    width = .66 if turned else 1
    outline = []
    for k in range(24):
        angle = math.tau * k / 24
        r = radius if k % 2 == 0 else radius * .79
        outline.append((cx + math.cos(angle) * r * width, cz + math.sin(angle) * r))
    p.poly(outline, "#f4c632", depth - .06)
    p.poly([(cx - radius * width * .85, cz + .3),
            (cx - radius * width * .6, cz + radius * .8),
            (cx, cz + radius), (cx + radius * width * .75, cz + radius * .5),
            (cx + radius * width * .4, cz + .1)], "#ffe684", depth - .07)
    discx = cx + (radius * .18 if turned else 0)
    p.poly([(discx + math.cos(math.tau * k / 8) * radius * .51 * width,
             cz + math.sin(math.tau * k / 8) * radius * .51) for k in range(8)],
           "#603c25", depth - .08)
    p.rect(discx - .7 * width, cz + .05, .95 * width, .8,
           kit.shade("#603c25", 1.22), depth - .09)


def build(tile):
    p = _Picture()
    p.rect(-1, -1, 18, 10.5 if not tile.n else 18, "foliageDark", .9)
    for dz in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if not tile.has(dx, dz):
                continue
            # Different heights, spacings and turns break the old rosette grid.
            distant = ((1, 8.8, 4.4, 2, 2), (5.5, 7.9, 5.3, 2.3, 1),
                       (10.2, 8.5, 3.6, 1.8, 3), (14.1, 7.4, 6, 2.1, 0))
            if tile.shape == "single":
                distant = ((3.3, 6.8, 5.6, 2.4, 2), (11.5, 7, 5.3, 2.3, 1))
            for x, base, h, r, index in distant:
                _flower(p, tile, x + dx * 16, base + dz * 16, h, r, index, True)
            near = ((3.4, -1.4, 8.7, 3.4, 0), (11.2, -.8, 10.2, 2.9, 2))
            if tile.shape == "mass":
                near = ((2.5, -1.4, 8.4, 3.2, 1), (9.2, -1, 9.4, 3.5, 0),
                        (14.6, -.7, 6, 2.8, 2))
            if tile.shape == "single":
                near = ((4.7, -.7, 6.1, 3.6, 0), (12.1, -.8, 9, 3.1, 1))
            for x, base, h, r, index in near:
                _flower(p, tile, x + dx * 16, base + dz * 16, h, r, index)
    # Low broad leaves close the ground without soil lines between cells.
    for dx in (-1, 0, 1):
        if dx and not tile.has(dx, 0):
            continue
        for i, x in enumerate((.8, 5.5, 10.4, 14)):
            x += dx * 16
            p.poly([(x - 2, 0), (x - 2.5, 1.6), (x - 1, 2.4),
                    (x, 1.5), (x + 1.1, 3), (x + 2.3, 2.3), (x + 1, 0)],
                   "foliage" if i % 2 else "foliageLight", -.9)
    p.finish()
