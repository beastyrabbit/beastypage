"""Striped, pear-shaped hot-air balloon with rigging and a wicker basket."""

import math

import tilekit as kit

PALETTE = ["#a8504a", "#d9534f", "#f18486", "#ffe2a0", "#fff3c0", "#5b3a25", "#b07a48"]


def build(tile):
    bob = (1 - math.cos(math.tau * tile.t)) / 32
    # Cross sections make every stripe follow the tapered envelope.
    levels = [(0.33, 0.07), (0.42, 0.16), (0.57, 0.28), (0.73, 0.29), (0.85, 0.22), (0.90, 0.10), (0.92, 0.0)]
    stripe_colours = ["#a8504a", "#f18486", "#ffe2a0", "#d9534f", "#a8504a"]
    for stripe, colour in enumerate(stripe_colours):
        verts, faces = [], []
        lo, hi = -1 + stripe * 0.4, -1 + (stripe + 1) * 0.4
        for z, width in levels:
            verts.extend([(0.5 + lo * width, -0.03, z + bob), (0.5 + hi * width, -0.03, z + bob)])
        for j in range(len(levels) - 1):
            k = j * 2
            faces.append((k, k + 1, k + 3, k + 2))
        kit.mesh(verts, faces, kit.mat(colour), name="envelope-stripe")
    # Broad highlight high on the lit side.
    kit.prism([(0.32, 0.73 + bob), (0.36, 0.79 + bob), (0.42, 0.81 + bob), (0.38, 0.73 + bob)], kit.mat("#fff3c0"), -0.06, -0.04)
    rope = kit.mat("trunk")
    kit.box(0.405, 0.19 + bob, 0.45, 0.36 + bob, rope, -0.02, 0.02)
    kit.box(0.55, 0.19 + bob, 0.595, 0.36 + bob, rope, -0.02, 0.02)
    kit.prism([(0.40, 0.08 + bob), (0.60, 0.08 + bob), (0.63, 0.22 + bob), (0.37, 0.22 + bob)], kit.mat("woodLight"), -0.06, 0.06)
    kit.box(0.37, 0.19 + bob, 0.63, 0.23 + bob, rope, -0.08, -0.06)
    kit.box(0.54, 0.08 + bob, 0.60, 0.19 + bob, kit.mat("wood"), -0.08, -0.06)
