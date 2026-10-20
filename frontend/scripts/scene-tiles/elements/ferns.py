"""Three full-cell fern clumps with arching, paired-leaf fronds."""

import math

import tilekit as kit

PALETTE = kit.ramp("foliageDark", "foliage", "grassLight")


def _line(p, a, b, color):
    steps = max(1, math.ceil(math.dist(a, b) * 3))
    for i in range(steps + 1):
        t = i / steps
        p[round(a[0] + (b[0] - a[0]) * t),
          round(a[1] + (b[1] - a[1]) * t)] = color


def build(tile):
    p = {(x, 1): 0 for x in range(5, 12)}
    tips = (((1, 7), (3, 11), (7, 14), (11, 12), (14, 8)),
            ((1, 9), (4, 13), (9, 14), (13, 11), (14, 6)),
            ((1, 6), (2, 11), (6, 13), (11, 14), (14, 10)))[tile.alt]
    for k, (tx, tz) in enumerate(tips):
        sway = .75 * math.sin(math.tau * tile.t + k * .45)

        def point(t):
            return (8 + (tx - 8) * t + sway * t * t,
                    2 + (tz - 2) * t + 3.2 * math.sin(math.pi * t))

        # Staggered pinnules form distinct toothed arches rather than broad leaves.
        for t in (.26, .43, .60, .77):
            x, z = point(t)
            before, after = point(t - .03), point(t + .03)
            dx, dz = after[0] - before[0], after[1] - before[1]
            length = math.hypot(dx, dz)
            nx, nz = -dz / length, dx / length
            size = 1.9 * (1 - t) + .35
            for sign, color in ((-1, 1), (1, 4)):
                _line(p, (x, z), (x + sign * nx * size - dx * .35,
                                  z + sign * nz * size - dz * .35), color)
        for step in range(18):
            _line(p, point(step / 18), point((step + 1) / 18), 7 if k % 2 else 4)
    p[7, 2], p[8, 2], p[9, 2] = 0, 4, 0
    verts, faces = [[] for _ in PALETTE], [[] for _ in PALETTE]
    for (x, z), c in p.items():
        if not 0 <= x < 16 or not 0 <= z < 16:
            continue
        n = len(verts[c])
        verts[c] += [(x / 16, 0, z / 16), ((x + 1) / 16, 0, z / 16),
                     ((x + 1) / 16, 0, (z + 1) / 16), (x / 16, 0, (z + 1) / 16)]
        faces[c].append((n, n + 1, n + 2, n + 3))
    for c, v, f in zip(PALETTE, verts, faces):
        if f:
            kit.mesh(v, f, kit.mat(c), name="fern-fronds")
