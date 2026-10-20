"""Lake: open water with a rippling surface, a dark lip along the shore and
rounded outer corners. Shapes share one look; a single cell is a small pool."""

import math

import tilekit as kit

PALETTE = kit.ramp("water", "waterLight", "waterDark") + [kit.BASE["foam"]]

# Inset of the shore on a closed side, in units (1 px = 1/16).
SHORE = 2 / 16
RADIUS = 5 / 16


def _outside_corner(x, z, cx, cz):
    near_x = x < cx if cx < 0.5 else x > cx
    near_z = z < cz if cz < 0.5 else z > cz
    return near_x and near_z and math.hypot(x - cx, z - cz) > RADIUS


def inside(tile, x: float, z: float) -> bool:
    """Whether (x, z) is water: the cell plus open neighbours, minus a shore
    strip on closed sides and rounded outer corners."""
    left = -1 if tile.w else SHORE
    right = 2 if tile.e else 1 - SHORE
    bottom = -1 if tile.s else SHORE
    top = 2 if tile.n else 1 - SHORE
    if not (left <= x <= right and bottom <= z <= top):
        return False
    for closed_x, closed_z, cx, cz in (
        (not tile.w, not tile.s, left + RADIUS, bottom + RADIUS),
        (not tile.e, not tile.s, right - RADIUS, bottom + RADIUS),
        (not tile.w, not tile.n, left + RADIUS, top - RADIUS),
        (not tile.e, not tile.n, right - RADIUS, top - RADIUS),
    ):
        if closed_x and closed_z and _outside_corner(x, z, cx, cz):
            return False
    return True


def surface(tile, x: float, z: float) -> float:
    # A broad swell catches the light without the old checkerboard ripples.
    return 0.002 * kit.periodic(z, 1, tile.t) + 0.001 * kit.periodic(x, 1, -tile.t)


def _glints(tile):
    # Short glints drift by one pixel, then settle back on the loop.
    glint = kit.mat("waterLight", rough=0.3)
    for gx, z in ((0.15, 0.3), (0.55, 0.62), (0.8, 0.2)):
        for repeat in (-1, 0, 1):
            x = gx + math.sin(2 * math.pi * tile.t) / 16 + repeat
            if inside(tile, x, z) and inside(tile, x + 3 / 16, z):
                kit.box(x, z, x + 3 / 16, z + 1 / 16, glint, -0.06, -0.02)


def build(tile):
    water = kit.mat("water", rough=0.35)
    steps = 48
    lo, hi = -0.25, 1.25
    verts, faces, index = [], [], {}
    for j in range(steps + 1):
        for i in range(steps + 1):
            x = lo + (hi - lo) * i / steps
            z = lo + (hi - lo) * j / steps
            index[i, j] = len(verts)
            verts.append((x, -surface(tile, x, z), z))
    for j in range(steps):
        for i in range(steps):
            cx = lo + (hi - lo) * (i + 0.5) / steps
            cz = lo + (hi - lo) * (j + 0.5) / steps
            if inside(tile, cx, cz):
                faces.append((index[i, j], index[i + 1, j], index[i + 1, j + 1], index[i, j + 1]))
    kit.mesh(verts, faces, water, smooth=True, name="lake")

    _shore(tile)
    _glints(tile)


def _shore(tile):
    # Dark lip just inside closed shores, so the edge reads at 16 px.
    lip = kit.mat("waterDark", rough=0.6)
    lip_left = -0.25 if tile.w else SHORE + RADIUS
    lip_right = 1.25 if tile.e else 1 - SHORE - RADIUS
    if not tile.s:
        kit.box(lip_left, SHORE, lip_right, SHORE + 1.5 / 16, lip, -0.05, 0.05)
    if not tile.n:
        kit.box(lip_left, 1 - SHORE - 1 / 16, lip_right, 1 - SHORE, kit.mat("waterLight", 0.5), -0.05, 0.05)
