"""Shape-aware woodland: conifer rows, sloping columns and leafy masses.

All geometry is a picture-plane mesh. This keeps the periodic border colours
independent of shadows from an alternative's different interior crown.
"""

import math

import tilekit as kit

PALETTE = [kit.BASE[c] for c in ("foliageDark", "foliage", "foliageLight", "trunk", "wood", "grass")]


def _pine(x, z, cx, base, height, width, phase, trunk=True):
    h = (z - base) / height
    if not 0 <= h <= 1:
        return None
    if trunk and h < .30 and abs(x - cx) < .035:
        return 4 if x < cx else 3
    color = None
    for bottom, tip, spread in ((.18, .69, 1), (.37, .85, .79), (.58, 1, .54)):
        if bottom <= h <= tip:
            center = cx + .028 * math.sin(phase) * h
            radius = width * .5 * spread * (tip - h) / (tip - bottom)
            if abs(x - center) <= radius:
                color = 1 if x < center else 0
                if x < center - .04 and h > bottom + .10:
                    color = 2
    return color


def _row(tile, x, z):
    color = 0 if .0625 <= z <= .14 else None
    if (not tile.w and x < .0625) or (not tile.e and x > .9375):
        color = None
    for k, cx in enumerate((.25, .75)):
        h = (.79, .86)[(k + tile.alt) % 2]
        c = _pine(x, z, cx, .10, h, .43, 2 * math.pi * tile.t + k)
        if c is not None:
            color = c
    return color


def _column(tile, x, z):
    # A dark needle-covered slope fills the gaps between overlapping trees.
    # Its edges repeat vertically, including when neighbouring alts differ.
    left = -1 if tile.w else .14 + .045 * math.sin(2 * math.pi * z)
    right = 2 if tile.e else .86 + .035 * math.sin(2 * math.pi * z)
    color = 0 if left <= x <= right else None
    if not tile.n and z > .60:
        color = None
    if not tile.s and z < .25:
        color = None
    # Rear crowns cross N/S; their layout and phase are shared by all alts.
    for dz in (-1, 0, 1):
        if not tile.has(0, dz):
            continue
        for k, (cx, base, h, width) in enumerate(((.62, .40, .91, .72), (.40, .045, .90, .76))):
            if k == 0 and dz == 0 and not tile.n:
                base, h = .09, .86
            if k == 1:
                h -= .025 * tile.alt
            # Trunks appear only along the bottom of the complete column.
            c = _pine(x, z - dz, cx, base, h, width,
                      2 * math.pi * tile.t + k, trunk=not tile.s and dz == 0)
            if c is not None:
                color = c
    return color


def _single(tile, x, z):
    return _pine(x, z, .50, .0625, .875 - .025 * tile.alt,
                 .76 + .04 * tile.alt, 2 * math.pi * tile.t)


def _woodland_edge(tile, x, z):
    side = 1 + .45 * math.sin(math.tau * z / 16)
    if (not tile.w and x < side) or (not tile.e and x > 16 - side):
        return False
    if not tile.n:
        # The entire corner cell is a rounded shoulder, rather than a tiny
        # bevel on a rectangular hedge. Individual crowns set the skyline.
        for closed, dx in ((not tile.w, x), (not tile.e, 16 - x)):
            if closed and dx < 12 and z > 2.5:
                if ((dx - 12) / 12) ** 2 + ((z - 2.5) / 13) ** 2 > 1:
                    return False
    return True


def _crown(x, z, cx, cz, rx, rz, species, phase):
    u, v = (x - cx) / rx, (z - cz) / rz
    u += .13 * v
    # Unequal lobes and a broad off-centre highlight avoid round leaf stamps.
    rim = 1 + .07 * math.sin(3 * math.atan2(v, u) + phase)
    if u * u + v * v > rim * rim:
        return None
    dark, leaf, light = ((0, 1, 2), (0, 1, 5), (0, 5, 2))[species]
    color = dark
    if (u + .10) ** 2 + (v - .16) ** 2 < .78:
        color = leaf
    if (u + .32) ** 2 + (v - .35) ** 2 < .23:
        color = light
    return color


def _woodland_floor(tile, x, z):
    color = None
    if tile.s:
        return color
    # Staggered, forked stems leave ground visible below a low understorey.
    for k, cx in enumerate((3.2 + tile.alt, 10.6 - .8 * tile.alt)):
        bend = .40 * math.sin(z * .48 + k + tile.alt)
        width = .65 + max(0, 2.5 - z) * .35
        if 1 < z < 9 and abs(x - cx - bend) < width:
            color = 4 if x < cx + bend - .12 else 3
        if 4 < z < 8 and abs(x - cx - (z - 4) * (.5 if k else -.6)) < .48:
            color = 3
    if not _woodland_edge(tile, x, z):
        return color
    # Small shadowed shrubs interrupt the underside without hiding the stems.
    for cx, cz, rx, rz in ((0, 7.8, 3.3, 2.3), (16, 7.8, 3.3, 2.3),
                            (6.5 + tile.alt, 6.7, 2.4, 1.8),
                            (12.5 - tile.alt, 7.7, 2.9, 2.0)):
        if ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1:
            color = 0 if z < cz + .4 else 1
    return color


def _canopy(tile, x, z):
    x, z = x * 16, z * 16
    color = _woodland_floor(tile, x, z)
    if not _woodland_edge(tile, x, z):
        return color
    floor = 8.2 + .7 * math.sin(math.tau * x / 16) + .45 * math.sin(math.tau * x / 8)
    if not tile.s and z < floor:
        return color

    seed = tile.mask * 13 + tile.alt * 41
    # The dark interior is continuous; crowns, not a rectangle, finish the N
    # edge. Only the interior varies, so open joins agree between both alts.
    cap = 10.5 + .6 * math.sin(math.tau * x / 16)
    color = 0 if tile.n or z < cap else None
    if not tile.n:
        # Rear firs rise above the broadleaf canopy. Corner firs move inward
        # and shorten so their tips survive the rounded outer shoulder.
        pines = [(4.5, 15.5, 5.5), (11.5, 13.8, 4.2)]
        if not tile.w:
            pines = [(10.3, 14.7, 5.2)]
        if not tile.e:
            pines = [(5.7, 14.7, 5.2)]
        if not tile.w and not tile.e:
            pines = [(8, 13.6, 5)]
        for k, (cx, tip, width) in enumerate(pines):
            cx += .3 * math.sin(seed + k) + .3 * math.sin(math.tau * tile.t + k)
            c = _pine(x / 16, z / 16, cx / 16, (tip - 8) / 16,
                      .5, width / 16, math.tau * tile.t + k, trunk=False)
            if c is not None:
                color = 1 if c == 2 else 0

    # Shared lobes straddle open borders. Their centres, shapes and shades
    # never depend on the mask or alternative on the other side of the join.
    crowns = []
    for cz, connected in ((0, tile.s), (16, tile.n)):
        if connected:
            for cx in (0, 16):
                crowns.append((cx, cz, 4.7, 4.4, 1, 2.7))
    crowns += [(0, 7.7, 4.7, 4.0, 0, .3), (16, 7.7, 4.7, 4.0, 0, .3)]
    if tile.s:
        crowns.append((8.3, 0, 5.0, 4.5, 1, 1.2))
    if tile.n:
        crowns.append((8.3, 16, 5.0, 4.5, 1, 1.2))

    for k, (cx, cz, rx, rz) in enumerate(((5, 10, 3.5, 4.0),
                                         (10.6, 9, 4.3, 3.4),
                                         (4.9, 4.5, 3.6, 2.8),
                                         (11, 3.7, 3.4, 3.2))):
        phase = seed * .61 + k * 2.3
        rx += .55 * math.sin(phase * 1.7)
        rz += .60 * math.cos(phase)
        cx += .85 * math.sin(phase) + .35 * math.sin(math.tau * tile.t + k)
        cz += 1.0 * math.cos(phase * 1.3)
        cx = max(rx + 1.2, min(14.8 - rx, cx))
        # N-edge crowns can rise into the skyline, but nothing variable may
        # reach an open border, including either end of the sway loop.
        cz = max(rz + 1.2, min(14.8 - rz, cz))
        if not tile.n:
            cz = min(cz, 12.1 - rz)
        crowns.append((cx, cz, rx, rz, (k + tile.alt + tile.mask) % 3, phase))

    for crown in crowns:
        c = _crown(x, z, *crown)
        if c is not None:
            color = c
    if not tile.s and z < floor + 1.2 and color is not None:
        color = 0
    return color


def build(tile):
    painter = {"row": _row, "column": _column, "single": _single}.get(tile.shape, _canopy)
    verts, faces = [[] for _ in PALETTE], [[] for _ in PALETTE]
    for j in range(32):
        z = (j + .5) / 32
        for i in range(32):
            x = (i + .5) / 32
            c = painter(tile, x, z)
            if c is None:
                continue
            n = len(verts[c])
            verts[c] += [(i / 32, 0, j / 32), ((i + 1) / 32, 0, j / 32), ((i + 1) / 32, 0, (j + 1) / 32), (i / 32, 0, (j + 1) / 32)]
            faces[c].append((n, n + 1, n + 2, n + 3))
    for color, v, f in zip(PALETTE, verts, faces):
        if f:
            kit.mesh(v, f, kit.mat(color), name="woodland-" + tile.shape)
