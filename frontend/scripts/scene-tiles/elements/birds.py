"""A staggered flock of three distant birds, with offset wing beats."""

import math

import tilekit as kit

PALETTE = ["#2a2f3d", "#474b57"]


def _stroke(a, b, material, width=0.070):
    dx, dz = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dz)
    nx, nz = -dz / length * width / 2, dx / length * width / 2
    kit.prism([(a[0] - nx, a[1] - nz), (b[0] - nx, b[1] - nz), (b[0] + nx, b[1] + nz), (a[0] + nx, a[1] + nz)], material, -0.02, 0.02)


def build(tile):
    ink = kit.mat(PALETTE[0])
    drift = 0.025 * math.sin(math.tau * tile.t)
    for k, (x, z, span) in enumerate([(0.25, 0.69, 0.155), (0.73, 0.61, 0.145), (0.45, 0.30, 0.145)]):
        flap = 0.10 * math.cos(math.tau * tile.t + k * math.pi / 2)
        x += drift
        for side in (-1, 1):
            elbow = (x + side * span * 0.52, z + 0.045 + flap * 0.35)
            _stroke((x, z), elbow, ink)
            _stroke(elbow, (x + side * span, z + flap + 0.035), ink)
