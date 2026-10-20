"""Shared pixel meshes and channel geometry for water and path tiles."""

import math

import tilekit as kit


def _pixel(verts, faces, x, z, y=0, size=1 / 16):
    offset = len(verts)
    verts.extend(((x, y, z), (x + size, y, z),
                  (x + size, y, z + size), (x, y, z + size)))
    faces.append((offset, offset + 1, offset + 2, offset + 3))


def stamp(rows, x, z, colors, name, y=0, mirror=False):
    """Batch sprite pixels by symbol, leaving dots transparent."""
    for symbol in set("".join(rows)) - {"."}:
        verts, faces = _stamp_symbol(rows, x, z, y, mirror, symbol)
        kit.mesh(verts, faces, kit.mat(colors[symbol]), name=name)


def _stamp_symbol(rows, x, z, y, mirror, symbol):
    verts, faces = [], []
    for row, line in enumerate(rows):
        for col, value in enumerate(line[::-1] if mirror else line):
            if value == symbol:
                _pixel(verts, faces, (x + col) / 16,
                       (z + len(rows) - row - 1) / 16, y)
    return verts, faces


def bend_coordinates(mask, x, z):
    return {3: (x, z), 6: (1 - z, x), 12: (1 - x, 1 - z), 9: (z, 1 - x)}.get(mask)


def draw_pixels(pixels, name):
    batches = {}
    for (i, j), color in pixels.items():
        verts, faces = batches.setdefault(color, ([], []))
        _pixel(verts, faces, i / 16, j / 16)
    for color, (verts, faces) in batches.items():
        kit.mesh(verts, faces, kit.mat(color), name=name)


def point(side, u, v):
    """Map source-relative edge pixels into the receiving cell."""
    return {
        "N": (u / 16, 1 - v / 16),
        "E": (1 - v / 16, 1 - u / 16),
        "S": (1 - u / 16, v / 16),
        "W": (v / 16, u / 16),
    }[side]


def edge_batches(side, pixels):
    groups = {}
    for (u, v), colour in pixels.items():
        verts, faces = groups.setdefault(colour, ([], []))
        offset = len(verts)
        for a, b in ((u, v), (u + 1, v), (u + 1, v + 1), (u, v + 1)):
            x, z = point(side, a, b)
            verts.append((x, -0.1, z))
        # The side mapping preserves winding. Reverse to face the camera.
        faces.append(tuple(offset + i for i in (3, 2, 1, 0)))
    return groups


def channel_distance(tile, x, z):
    distances = [math.hypot(x - 0.5, z - 0.5)]
    if tile.n:
        distances.append(math.hypot(x - 0.5, min(z - 0.5, 0)))
    if tile.s:
        distances.append(math.hypot(x - 0.5, max(z - 0.5, 0)))
    if tile.e:
        distances.append(math.hypot(min(x - 0.5, 0), z - 0.5))
    if tile.w:
        distances.append(math.hypot(max(x - 0.5, 0), z - 0.5))
    return min(distances)


def segment_distance(x, z, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    return math.hypot(x - ax - t * dx, z - az - t * dz)


def add_surface_pixel(verts, groups, material, i, j, steps):
    offset = len(verts)
    verts.extend([(i / steps, 0, j / steps), ((i + 1) / steps, 0, j / steps),
                  ((i + 1) / steps, 0, (j + 1) / steps), (i / steps, 0, (j + 1) / steps)])
    groups[material].append((offset, offset + 1, offset + 2, offset + 3))


def draw_surface(verts, groups, materials, name):
    for material, faces in zip(materials, groups):
        if faces:
            kit.mesh(verts, faces, material, name=name)
