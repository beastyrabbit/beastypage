"""A cream-sailed wooden dinghy, bobbing above a short waterline."""

import math

import bpy

import tilekit as kit

PALETTE = kit.ramp("wood", "woodLight", "trunk", "sand") + [
    kit.BASE["white"], kit.BASE["red"], kit.BASE["waterLight"], kit.BASE["foam"],
]
P = 1 / 16


def build(tile):
    bob = math.sin(math.tau * tile.t) * .65 * P
    # A rider has no water surface of its own. Only these short hull ripples
    # cover the receiving sea, lake or river, whose colour remains visible.
    kit.box(P, 2 * P, 4 * P, 3 * P, kit.mat("waterLight"), .35, .40)
    kit.box(5 * P, P, 11 * P, 2 * P, kit.mat("waterLight"), .35, .40)
    kit.box(12 * P, 2 * P, 15 * P, 3 * P, kit.mat("foam"), .35, .40)
    kit.prism([(P, 5 * P + bob), (14 * P, 5 * P + bob),
               (12 * P, 2 * P + bob), (4 * P, 2 * P + bob)], kit.mat("wood"))
    kit.box(2 * P, 4 * P + bob, 14 * P, 5 * P + bob, kit.mat("woodLight"), -.30, -.26)
    kit.box(4 * P, 2 * P + bob, 12 * P, 3 * P + bob, kit.mat("trunk"), -.30, -.27)
    kit.box(7 * P, 5 * P + bob, 8 * P, 15 * P + bob, kit.mat("trunk"), -.15, .08)
    kit.prism([(8 * P, 6 * P + bob), (14 * P, 6 * P + bob), (8 * P, 14 * P + bob)],
              kit.mat("white"), -0.25, -0.10)
    kit.prism([(P, 6 * P + bob), (7 * P, 6 * P + bob), (7 * P, 13 * P + bob)],
              kit.mat("sand"), -0.25, -0.10)
    kit.prism([(8 * P, 14 * P + bob), (11 * P, 14 * P + bob), (8 * P, 15 * P + bob)],
              kit.mat("red"), -0.20, -0.10)
    # Hull shadows must not recolour the small blue wake into detached planks.
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.visible_shadow = False
