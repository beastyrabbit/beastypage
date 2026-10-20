"""A low view through wheat: upright straw, plump ears and a travelling gleam."""

import math

import tilekit as kit

PALETTE = kit.ramp("#bf8d32", "#dfb44d", "#f4d879", "#97712e")
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
            obj = kit.mesh(verts, faces, _ink(color), name="wheat")
            obj.visible_shadow = False
            obj.visible_diffuse = False
            obj.visible_glossy = False


def _stalk(p, tile, x, base, index, back):
    height = 6.9 + (index * 7 % 5) * .29
    if back and not tile.n:
        height = 6.1 + (index * 3 % 4) * .36
    bend = .65 * math.sin(math.tau * (tile.t - x / 16 - base / 16))
    head, top = x + bend, base + height
    # Move only the ear; stems crossing an open edge stay identical.
    if 3 < x < 12 and 2 < top and top + 2.5 < 14:
        head += tile.alt * .4
        top += tile.alt * .35
    depth = -.3 + base * .025
    straw = ("#bf8d32", "#dfb44d", "#f4d879")[index % 3]
    # Long stems cross a broad, low-contrast moving light wave.
    for k in range(8):
        lo, hi = k / 8, (k + 1) / 8
        z = base + height * lo
        wave = 7.2 + 1.5 * math.sin(math.tau * (x / 16 - tile.t))
        color = "#f4d879" if abs(z - wave) < 1.45 else straw
        if z < 2 and not tile.s:
            color = "#bf8d32" if index % 3 else "#97712e"
        p.poly([(x + bend * lo - .33, z), (x + bend * lo + .33, z),
                (x + bend * hi + .3, base + height * hi),
                (x + bend * hi - .3, base + height * hi)], color, depth)
    p.poly([(x, base + 1.4), (x - 1.8, base + 3.9),
            (x - .35, base + 2.1)], "#dfb44d", depth - .01)
    # Two-pixel-wide, three-pixel-tall ears with a pale cap.
    ear = "#bf8d32" if index % 3 == 0 else "#dfb44d"
    p.poly([(head - .55, top - .5), (head - 1, top + .35),
            (head - .85, top + 1.5), (head - .05, top + 2.25),
            (head + .85, top + 1.35), (head + .8, top + .1),
            (head + .35, top - .5)], ear, depth - .04)
    p.rect(head - .65, top + 1.1, 1.05, .9, "#f4d879", depth - .05)
    p.poly([(head + .1, top - .4), (head + .05, top + .9),
            (head + .65, top + .6)], "#bf8d32", depth - .06)


def build(tile):
    p = _Picture()
    # Opaque crop body, with ears alone at the horizon.
    p.rect(-1, -1, 18, 12.4 if not tile.n else 18, "#bf8d32", .9)
    wave = [(x, 7 + 1.2 * math.sin(math.tau * (x / 16 - tile.t)))
            for x in range(-1, 18)]
    p.poly([(x, z - 1) for x, z in wave]
           + [(x, z + 1) for x, z in reversed(wave)], "#dfb44d", .8)
    positions = (.8, 3.5, 6.1, 8.9, 11.7, 14.5)
    for dz in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if not tile.has(dx, dz):
                continue
            for row, base in enumerate((-4.8, .3, 6.1)):
                for i, x in enumerate(positions):
                    offset = (.55 if row == 1 else 0) + (i % 2) * .18
                    _stalk(p, tile, x + offset + dx * 16, base + dz * 16,
                           i + row * 7, row == 2)
            if tile.shape == "mass":
                for i in range(4):
                    _stalk(p, tile, 1.5 + i * 4 + dx * 16, -7 + dz * 16,
                           i + 4, False)
    p.finish()
