"""Endless countryside, meadow and swaying foreground turf.

Alternatives share border colours, without a repeated border decoration.
There are no neighbour masks or finished edges.
"""

import math
import random

import tilekit as kit


MEADOW = kit.BASE["meadow"]
GRASS = kit.BASE["grass"]
LIGHT = "#64aa50"
# Distant land in clear greens: the app adds the haze, so grey here goes flat.
FAR = "#5f9452"
LEAF = kit.BASE["foliage"]
SOFT = "#579f4a"
SHADE = "#499143"
HEDGE = "#4f7a48"
TREE = "#466e40"
CROP = "#9b9e70"
FLOWER = "#e1dfb4"
FIELD = "#72a35e"
PASTURE = "#809773"

PALETTE = kit.ramp("meadow") + [
    GRASS, LIGHT, FAR, LEAF, SOFT, SHADE, HEDGE, TREE, CROP, FLOWER, FIELD, PASTURE,
]

_materials = {}


def _material(color):
    # Flat ground cover uses its actual palette colour. This is not a glow
    # material: the application's daylight, season and distance grades apply.
    if color not in _materials:
        material = kit.mat(color, rough=1).copy()
        nodes = material.node_tree.nodes
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        pigment = nodes.new("ShaderNodeEmission")
        pigment.inputs["Color"].default_value = kit.linear(color)
        pigment.inputs["Strength"].default_value = 1
        material.node_tree.links.new(pigment.outputs[0], output.inputs["Surface"])
        _materials[color] = material
    return _materials[color]


class _Surface:
    """Batch picture-plane polygons by colour, with painter's-order depth."""

    def __init__(self):
        self.batches = {}
        self.layer = 0

    def polygon(self, points, color, wrap=False):
        self.layer += 1
        depth = -self.layer * 0.0001
        vertices, faces = self.batches.setdefault(color, ([], []))
        offsets = (-16, 0, 16) if wrap else (0,)
        for dz in offsets:
            for dx in offsets:
                if (
                    max(x + dx for x, _ in points) <= 0
                    or min(x + dx for x, _ in points) >= 16
                    or max(z + dz for _, z in points) <= 0
                    or min(z + dz for _, z in points) >= 16
                ):
                    continue
                start = len(vertices)
                vertices.extend(((x + dx) / 16, depth, (z + dz) / 16) for x, z in points)
                # Camera-facing winding also makes the geometry useful with
                # ordinary diffuse materials if the render rig changes.
                faces.append(tuple(range(start, start + len(points))))

    def rect(self, x, z, w, h, color, wrap=False):
        self.polygon(((x, z), (x + w, z), (x + w, z + h), (x, z + h)), color, wrap)

    def finish(self):
        for color, (vertices, faces) in self.batches.items():
            kit.mesh(vertices, faces, _material(color), name="ground-pigment")


def _fields(surface, alt):
    # Long terraces in two close greens. Both boundaries meet every alt at
    # the same height and slope; top and bottom remain the same base green.
    # The palette stays shared and unchanged so accepted meadow/turf renders
    # keep exactly their existing quantization.
    surface.rect(0, 0, 16, 16, FAR)
    lower_swell, upper_swell = (
        (0.9, -0.6), (-0.8, 1.0), (0.5, 0.8), (-1.0, -0.7),
    )[alt]

    def boundary(x, height, swell):
        return height + swell * math.sin(math.pi * x / 16) ** 2

    lower = [(x, boundary(x, 4, lower_swell)) for x in range(17)]
    upper = [(x, boundary(x, 11, upper_swell)) for x in range(17)]
    surface.polygon(lower + upper[::-1], FIELD)

    # Half the alternatives have no marks. The others carry just one small
    # distant accent, never a cell divider or a continuous dark outline.
    if alt == 1:
        x = 3
        z = math.floor(boundary(x + 0.5, 11, upper_swell))
        surface.rect(x, z, 1, 1, TREE)
    elif alt == 3:
        hedge = [(x, boundary(x, 4, lower_swell)) for x in range(9, 14)]
        surface.polygon(hedge + [(x, z + 1) for x, z in hedge[::-1]], HEDGE)


def _patches(seed):
    rng = random.Random(seed)
    return [(rng.uniform(0, 16), rng.uniform(0, 16),
             rng.uniform(1.1, 2.1), rng.choice((-1, 1))) for _ in range(28)]  # NOSONAR: seeded art noise, not security


def _patch_value(patches, x, z):
    value = 0
    for px, pz, radius, sign in patches:
        dx = (x - px + 8) % 16 - 8
        dz = (z - pz + 8) % 16 - 8
        value += sign * math.exp(-(dx * dx + dz * dz) / (radius * radius))
    return value


def _patch_color(patch):
    if patch > 0.24:
        return SOFT
    if patch < -0.3:
        return SHADE
    return MEADOW


def _base(surface, zone, alt):
    shared = _patches(1279)
    interior = _patches(6121 + alt * 997 + (41 if zone == "front" else 0))
    for z in range(16):
        for x in range(16):
            # Only the outermost pixels share a seed. Their subtle texture
            # joins mixed alternatives without a blank collar or bold motif.
            weight = min(1, min(x, z, 15 - x, 15 - z) / 2)
            edge_x = 0 if x == 15 else x
            edge_z = 0 if z == 15 else z
            patch = (1 - weight) * _patch_value(shared, edge_x, edge_z)
            patch += weight * _patch_value(interior, x, z)
            surface.rect(x, z, 1, 1, _patch_color(patch))


def _blade(surface, x, z, height, color, phase, t):
    sway = 0.5 * math.sin(2 * math.pi * (t + phase)) if height > 2 else 0
    surface.polygon(
        ((x, z), (x + 0.9, z), (x + 0.85 + sway, z + height),
         (x + 0.15 + sway, z + height)), color,
    )


def _grass(surface, tile):
    large = tile.zone == "front"
    rng = random.Random(8231 + tile.alt * 311 + (73 if large else 0))
    # Independent positions avoid the common staggered grid and edge tufts
    # that previously stamped the same mark into every cell.
    for i in range(21 if large else 10):
        height = rng.uniform(2.5, 3.4) if large and i < 3 else rng.uniform(1, 1.9)
        x = rng.uniform(1.1, 13.7)
        z = rng.uniform(1.1, 14.8 - height)
        color = rng.choice((GRASS, LIGHT, SOFT) if large else (SHADE, SOFT))  # NOSONAR: seeded art noise, not security
        _blade(surface, x, z, height, color, rng.random(), tile.t)  # NOSONAR: seeded art noise, not security

    if large and tile.alt in (1, 3):
        x, z = rng.uniform(2, 11), rng.uniform(2, 11)
        surface.rect(x, z, 2, 1, LEAF)
        surface.rect(x + 0.5, z + 0.75, 1, 1, SOFT)
    for _ in range((0, 1, 0, 2)[tile.alt]):
        x, z = rng.randrange(1, 15), rng.randrange(1, 15)  # NOSONAR: seeded art noise, not security
        surface.rect(x, z, 1, 1, FLOWER)


def build(tile):
    surface = _Surface()
    if tile.zone == "far":
        _fields(surface, tile.alt)
    else:
        _base(surface, tile.zone, tile.alt)
        _grass(surface, tile)
    surface.finish()
