"""Asphalt paths with curved bends, dashed centrelines and stone kerbs."""

import math

import tilekit as kit

PALETTE = kit.ramp("asphalt", "rockDark", "rock", "rockLight", "paint")


def _segment(x, z, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    return math.hypot(x - ax - t * dx, z - az - t * dz)


def _path(tile, x, z):
    # Rotate each bend to NE, a quarter circle centred at the outer corner.
    bends = {3: (x, z), 6: (1 - z, x), 12: (1 - x, 1 - z), 9: (z, 1 - x)}
    if tile.mask in bends:
        u, v = bends[tile.mask]
        if v > 1:
            return abs(u - 0.5), False
        if u > 1:
            return abs(v - 0.5), False
        radius = math.hypot(1 - u, 1 - v)
        distance = abs(radius - 0.5)
        along = 0.5 * math.atan2(1 - v, 1 - u)
        # Symmetric dash placement leaves the same gap at both tile exits.
        dash = 0.085 < along < 0.27 or math.pi / 4 - 0.27 < along < math.pi / 4 - 0.085
        return distance, dash
    arms = []
    for present, bx, bz, along in (
        (tile.n, 0.5, 1.5, 1 - z), (tile.e, 1.5, 0.5, 1 - x),
        (tile.s, 0.5, -0.5, z), (tile.w, -0.5, 0.5, x),
    ):
        if present:
            arms.append((_segment(x, z, 0.5, 0.5, bx, bz), 0.10 < along < 0.31))
    if not arms:
        return _segment(x, z, 0.36, 0.5, 0.64, 0.5), 0.39 < x < 0.61
    distance = min(d for d, _ in arms)
    # No centre paint in the middle of a junction.
    return distance, any(d < 0.045 and dash for d, dash in arms)


def build(tile):
    materials = [kit.mat(name) for name in ("asphalt", "rockDark", "rockLight", "paint")]
    verts, groups = [], [[] for _ in materials]
    steps = 64
    # Extend past the crop to keep open edges free of side faces/shadows.
    for j in range(-4, steps + 4):
        for i in range(-4, steps + 4):
            x, z = (i + 0.5) / steps, (j + 0.5) / steps
            distance, dash = _path(tile, x, z)
            if tile.fill:
                # Sparse, low-contrast aggregate; no kerbs or centre paint.
                pixel = (math.floor(x * 16) % 16, math.floor(z * 16) % 16)
                material = 1 if pixel in ((3, 4), (10, 7), (6, 12)) else 0
            elif distance > 0.385:
                continue
            elif distance < 0.31:
                material = 3 if distance < 0.045 and dash else 0
            else:
                # Dark gutter inside a broad, pale kerb.
                material = 1 if distance < 0.335 else 2
            a = len(verts)
            verts.extend([(i / steps, 0, j / steps), ((i + 1) / steps, 0, j / steps),
                          ((i + 1) / steps, 0, (j + 1) / steps), (i / steps, 0, (j + 1) / steps)])
            groups[material].append((a, a + 1, a + 2, a + 3))
    for material, faces in zip(materials, groups):
        if faces:
            kit.mesh(verts, faces, material, name="road-surface")
