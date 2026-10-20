"""Weeping willows with an arched crown and swaying pendant leaf curtains."""

import math

import tilekit as kit

DARK, LEAF, LIGHT = "#416e3a", "#729d49", "#aacb67"
BARK, BARK_LIGHT = kit.BASE["trunk"], kit.BASE["wood"]
PALETTE = kit.ramp(DARK, LEAF, LIGHT, "trunk", "wood")


def _draw(pixels):
    for color in sorted(set(pixels.values())):
        verts, faces = [], []
        for (x, z), value in pixels.items():
            if value != color:
                continue
            i = len(verts)
            verts.extend([(x / 16, 0, z / 16), ((x + 1) / 16, 0, z / 16),
                          ((x + 1) / 16, 0, (z + 1) / 16), (x / 16, 0, (z + 1) / 16)])
            faces.append((i, i + 1, i + 2, i + 3))
        kit.mesh(verts, faces, kit.mat(color), name="willow")


def _trunk(x, z, cx):
    if 1 <= z < 11 and abs(x - cx - .12 * z) < 1.1:
        return BARK_LIGHT if x < cx + .12 * z else BARK
    if 6 < z < 12 and abs(abs(x - cx) - (z - 5) * .70) < .7:
        return BARK
    return None


def _tree(tile, x, z):
    if not (1 <= x < 15 and 1 <= z < 15):
        return None
    color = _trunk(x, z, 7)
    sway = .65 * math.sin(math.tau * tile.t)
    u = (x - 8 - sway * .35) / 7
    crown = 10.3 + 4.5 * math.sqrt(max(0, 1 - u * u))
    if abs(u) < 1 and 9.4 <= z <= crown:
        color = LEAF if x < 10 else DARK
        if z > crown - 1.8 and x < 9:
            color = LIGHT
    # Unequal dangling strands leave real gaps around the bent trunk.
    for k, (cx, tip) in enumerate(((2, 4), (4, 3), (6, 5.5), (10, 4.5), (12, 2.5), (14, 5))):
        bend = sway * (14 - z) / 11
        center = cx + bend + .22 * math.sin(z * .7 + k)
        end = tip + .45 * math.sin(math.tau * tile.t + k)
        end += tile.alt * (1 if k % 2 == 0 else -.5)
        cap = 10.3 + 4.5 * math.sqrt(max(0, 1 - ((cx - 8) / 7) ** 2))
        if end < z < cap and abs(x - center) < .68:
            color = LIGHT if k % 3 == 0 else LEAF if k % 3 == 1 else DARK
    return color


def _outline(tile, x, z):
    """A whole corner cell rounds off the shoulder of the shared crown."""
    side = 1 + .65 * (1 - math.cos(math.tau * z / 16))
    if (not tile.w and x < side) or (not tile.e and x > 16 - side):
        return False
    if not tile.n:
        cap = 14.5 + .6 * math.sin(math.tau * x / 16) + .45 * math.sin(math.tau * x / 8)
        if z > cap:
            return False
        rx, rz = (13.5, 13.5) if tile.s else (7, 6)
        for closed, dx in ((not tile.w, x), (not tile.e, 16 - x)):
            if closed and (max(0, rx + 1 - dx) / rx) ** 2 + (max(0, z - 14.5 + rz) / rz) ** 2 > 1:
                return False
    return True


def _grove(tile, x, z):
    # The wide bent fork shows through gaps in the curtains, including the
    # middle row. Its endpoints are periodic across vertical joins.
    bend = .7 * math.sin(math.tau * z / 16)
    trunk = None
    if (tile.s or z >= 1) and abs(x - 8 - bend) < 1.1:
        trunk = BARK_LIGHT if x < 8 + bend else BARK
    if not tile.s and 5 < z < 12 and abs(abs(x - 8) - (z - 5) * .7) < .8:
        trunk = BARK
    if not _outline(tile, x, z):
        return trunk if not tile.s and z < 9 else None
    if abs(x - 8 - bend) < 2.1 and (tile.n or z < 10):
        return trunk
    color = None
    # Only the upper shoulder is solid. Beneath it, broad bundles separate
    # into tapering fronds of different lengths, with sky/ground between.
    if not tile.n and z > 10.3:
        color = LEAF if math.cos(math.tau * (x - 5) / 16) > 0 else DARK
        if z > 13 and 2 < x < 11:
            color = LIGHT
    phase = tile.mask * .9 + tile.alt * 2.1
    interior = 0 if min(x, z, 16 - x, 16 - z) < 1 else (
        math.sin(math.pi * x / 16) ** 2 * math.sin(math.pi * z / 16) ** 2
    )
    for i, (cx, width, tip) in enumerate(((2.4, 2.2, 3.4), (7, 2.5, 8), (13, 2.6, 2))):
        center = cx + .95 * math.sin(math.tau * z / 16 + i * 1.7)
        center += interior * 2.2 * math.sin(phase + i)
        center += .4 * math.sin(math.tau * tile.t + i) * math.sin(math.pi * z / 16) ** 2
        width += .55 * math.sin(math.tau * z / 16 + i * 2)
        end = tip + tile.alt * (1 if i != 1 else -1) * interior
        if not tile.s:
            if z < end:
                continue
            width *= min(1, .3 + (z - end) / 4)
        dx = (x - center + 8) % 16 - 8
        if abs(dx) < width:
            color = DARK if dx > width - .8 else LEAF
            if dx < -.3 and math.sin(math.tau * z / 16 + i) > -.1:
                color = LIGHT
    return trunk if color is None else color


def build(tile):
    painter = _tree if tile.shape in ("single", "row") else _grove
    pixels = {}
    for z in range(16):
        for x in range(16):
            color = painter(tile, x + .5, z + .5)
            if color is not None:
                pixels[x, z] = color
    _draw(pixels)
