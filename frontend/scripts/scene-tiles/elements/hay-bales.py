"""Golden rolled hay with spiral ends, or a stack of tied square bales."""

import math

import tilekit as kit

PALETTE = kit.ramp("#d8a33d", "#8c602d", "sand", "trunk")
P = 1 / 16


def _poly(points, color, front):
    obj = kit.prism([(x * P, z * P) for x, z in points],
                    kit.mat(color), front, front + 0.01)
    obj.visible_shadow = False
    obj.visible_diffuse = False
    obj.visible_glossy = False


def _box(x0, z0, x1, z1, color, front=-0.3):
    _poly([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], color, front)


def _line(a, b, width, color, front):
    dx, dz = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dz)
    nx, nz = -dz / length * width / 2, dx / length * width / 2
    _poly([(a[0] + nx, a[1] + nz), (a[0] - nx, a[1] - nz),
           (b[0] - nx, b[1] - nz), (b[0] + nx, b[1] + nz)], color, front)


def _roll(x, foot, r, front=-0.25):
    z = foot + r
    outline = [(math.cos(i * math.pi / 6), math.sin(i * math.pi / 6))
               for i in range(12)]
    _box(x - r + 1, foot - 0.5, x + r + r / 3, foot + 1, "#8c602d", front + 0.06)
    _poly([(x + dx * r + r / 3, z + dz * r) for dx, dz in outline], "#8c602d", front + 0.04)
    _poly([(x + dx * r, z + dz * r) for dx, dz in outline], "#8c602d", front)
    _poly([(x + dx * (r - 0.8), z + dz * (r - 0.8)) for dx, dz in outline],
          "#d8a33d", front - 0.02)
    _line((x - r * 0.5, z + r * 0.6), (x + r * 0.35, z + r * 0.6),
          1, "sand", front - 0.04)
    # A single continuous coil, rather than concentric target rings.
    points = []
    for i in range(15):
        angle = i / 14 * math.pi * 3
        radius = r * (0.68 - i / 14 * 0.6)
        points.append((x + math.cos(angle) * radius, z + math.sin(angle) * radius))
    for a, b in zip(points, points[1:]):
        _line(a, b, 1, "#8c602d", front - 0.06)


def _square(x0, z0, x1, z1):
    _box(x0, z0, x1, z1, "#8c602d", -0.25)
    _box(x0 + 1, z0 + 1, x1 - 1, z1, "#d8a33d", -0.3)
    _box(x0 + 1, z1 - 1, x1 - 1, z1, "sand", -0.32)
    for x in (x0 + 2, x1 - 3):
        _box(x, z0, x + 1, z1, "#8c602d", -0.34)


def build(tile):
    if tile.alt == 0:
        if tile.shape == "single":
            _roll(7, 1, 6)
        else:
            # Two ten-pixel rolls overlap in depth rather than shrinking to
            # fit side by side. Both spiral ends remain visible.
            _roll(10, 5, 4.8, -0.2)
            _roll(5.3, 1, 4.8, -0.35)
    else:
        _square(2, 1, 14, 6)
        _square(1, 6, 13, 11)
        _box(4, 11, 11, 12, "#d8a33d")
