"""Uneven mixed crowns above a dark, softly textured forest wall."""

import math

import tilekit as kit

PALETTE = ["#294638", "#365b3e", "#497446", "#658950", "#425b3b", "#34543d", "#3d6243"]


def _crown(x, z, cx, bottom, height, width, rounded=False):
    level = (z - bottom) / height
    if not 0 <= level <= 1:
        return None
    dx = x - cx
    if rounded:
        inside = (dx / width) ** 2 + ((level - .50) / .50) ** 2 < 1
    else:
        # Broad overlapping skirts keep the spruce from becoming a spike.
        spread = max((hi - level) / (hi - lo) * scale
                     for lo, hi, scale in ((0, .69, 1), (.24, .86, .83), (.49, 1, .62))
                     if lo <= level <= hi)
        inside = abs(dx) < width * spread
    if not inside:
        return None
    # Light catches only the upper-left crown, never a full trunk-height rim.
    return 2 if dx < -.015 and level > .45 else 1 if dx < .04 else 0


def _texture(x, z, alt):
    # Offset, broad crown islands. Neighbour copies continue through every
    # open border; changing alt affects only crowns inside the tile collar.
    c = 0
    crowns = ((.02, .29, .20, .14), (.43, .75, .23, .16), (.88, .86, .17, .13),
              (.69, .34, .20, .16), (.24, .02, .16, .12))
    interior = ((.35, .40, .14, .11),) if alt == 0 else ((.47, .43, .15, .12),)
    for cx, cz, width, height in crowns + interior:
        for rx in (-1, 0, 1):
            for rz in (-1, 0, 1):
                dx, dz = (x - cx - rx) / width, (z - cz - rz) / height
                # Broken upper arcs read as overlapping crowns rather than
                # bright oval dots. The body stays close to the wall colour.
                lobes = .15 * math.sin(8 * dx + 4 * dz)
                if dx * dx + dz * dz + lobes < 1:
                    c = 6 if .15 < dz < .65 and -.7 < dx < .05 else 5
    return c


def build(tile):
    verts, faces = [[] for _ in PALETTE], [[] for _ in PALETTE]
    # The border crown is fixed. Interior crowns change size, species and
    # spacing between alternatives, leaving matching open sides.
    trees = ((0, .16, .57, .16, True),)
    trees += (((.24, .22, .70, .20, False), (.63, .20, .46, .25, True),
               (.85, .19, .59, .17, False)) if tile.alt == 0 else
              ((.23, .21, .43, .20, True), (.53, .20, .77, .24, False),
               (.82, .18, .48, .19, False)))
    for j in range(32):
        z = (j + .5) / 32
        for i in range(32):
            x = (i + .5) / 32
            c = _texture(x, z, tile.alt) if tile.n or z < .48 else None
            if not tile.n:
                for rx in (-1, 0, 1):
                    if not tile.has(rx, 0):
                        continue
                    for k, (cx, bottom, height, width, rounded) in enumerate(trees):
                        # Animation is confined to the tall central tip.
                        sway = .025 * math.sin(2 * math.pi * tile.t) if k == 2 else 0
                        shade = _crown(x, z, cx + rx + sway, bottom, height, width, rounded)
                        if shade is not None:
                            c = shade
                # Crown fragments sit over the silhouettes without drawing
                # a stack of complete trees in the body of a tall mass.
                if c is not None and z < .48:
                    c = _texture(x, z, tile.alt)
            if (not tile.w and x < .055) or (not tile.e and x > .945):
                c = None if z > .27 else 4
            if not tile.s and z < .075:
                c = 4
            if c is None:
                continue
            n = len(verts[c])
            verts[c] += [(i / 32, 0, j / 32), ((i + 1) / 32, 0, j / 32),
                         ((i + 1) / 32, 0, (j + 1) / 32), (i / 32, 0, (j + 1) / 32)]
            faces[c].append((n, n + 1, n + 2, n + 3))
    for color, v, f in zip(PALETTE, verts, faces):
        if f:
            kit.mesh(v, f, kit.mat(color), name="mixed-forest-crowns")
