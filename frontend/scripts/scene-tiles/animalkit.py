"""Pixel stamping and mesh helpers for the animal sprite builders."""

import tilekit as kit


def _art_pixels(rows, x, y, mirror, width=None):
    for dy, row in enumerate(rows):
        row_width = len(row) if width is None else width
        for dx, ink in enumerate(row):
            if ink != ".":
                px = x + (row_width - 1 - dx if mirror else dx)
                yield px, y + dy, ink


def stamp_canvas(canvas, art, x=0, y=0, mirror=False):
    """Stamp a bounded canvas, mirroring each row about its own width."""
    for px, py, ink in _art_pixels(art, x, y, mirror):
        assert 0 <= px < 16 and 0 <= py < 16
        canvas[py][px] = ink


def stamp_pixels(pixels, rows, x, y, mirror=False, translation=None):
    """Stamp an ordered pixel map, mirroring about the widest sprite row."""
    width = max(map(len, rows)) if mirror else None
    for px, py, ink in _art_pixels(rows, x, y, mirror, width):
        pixels[px, py] = translation.get(ink, ink) if translation else ink


def _quad(verts, faces, x0, x1, z0, z1):
    start = len(verts)
    verts.extend([(x0, 0, z0), (x1, 0, z0),
                  (x1, 0, z1), (x0, 0, z1)])
    faces.append(tuple(start + i for i in range(4)))


def _row_runs(line, ink):
    col = 0
    while col < 16:
        if line[col] != ink:
            col += 1
            continue
        end = col + 1
        while end < 16 and line[end] == ink:
            end += 1
        yield col, end
        col = end


def _canvas_geometry(canvas, ink):
    verts, faces = [], []
    for row, line in enumerate(canvas):
        for col, end in _row_runs(line, ink):
            _quad(verts, faces, col / 16, end / 16,
                  (15 - row) / 16, (16 - row) / 16)
    return verts, faces


def _pixel_geometry(pixels, ink):
    verts, faces = [], []
    for (x, y), value in pixels.items():
        if value == ink:
            _quad(verts, faces, x / 16, (x + 1) / 16,
                  (15 - y) / 16, (16 - y) / 16)
    return verts, faces


def _flat_material(color):
    # The owl's painted shading and pupils must not pick up rim lighting.
    # This emission surface deliberately carries no glow metadata.
    material = kit.mat(color).copy()
    nodes = material.node_tree.nodes
    nodes.clear()
    surface = nodes.new("ShaderNodeEmission")
    surface.inputs["Color"].default_value = kit.linear(color)
    surface.inputs["Strength"].default_value = 1
    output = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(surface.outputs[0], output.inputs["Surface"])
    return material


def _draw_inks(colors, geometry, prefix, flat=False):
    for ink, color in colors.items():
        verts, faces = geometry(ink)
        if faces:
            material = _flat_material(color) if flat else kit.mat(color)
            kit.mesh(verts, faces, material, name=prefix + ink)


def draw_canvas(canvas, colors, flat=False):
    """Merge horizontal runs into pixel-aligned quads, one mesh per ink."""
    _draw_inks(colors, lambda ink: _canvas_geometry(canvas, ink), "animal-", flat)


def draw_pixels(pixels, colors, prefix):
    """Keep individual quads and the pixel map's insertion order."""
    _draw_inks(colors, lambda ink: _pixel_geometry(pixels, ink), prefix)
