"""Round cumulus billows, with white rims and cool shaded undersides."""

import math

import tilekit as kit
import townkit

PALETTE = [kit.BASE["cloudShade"], "#dde2ef", kit.BASE["cloud"], "#ffffff"]


def _cap(x, cx, cz, rx, rz):
    distance = abs(x - cx) / rx
    return cz + rz * math.sqrt(1 - distance * distance) if distance < 1 else -2


def _tone(tile, x, z):
    drift = 0.04 * math.sin(math.tau * tile.t)
    if tile.shape == "single":
        x -= drift
        bottom, top = _single_bounds(tile, x)
    else:
        bottom, top = _heap_bounds(tile, x, drift)
        if _outside_heap(tile, x, z):
            return None
    if z <= bottom or z >= top:
        return None

    base_tone = _base_tone(z, bottom)
    if base_tone is not None:
        return base_tone
    if _shaded_inside(tile, x, z, drift):
        return 1
    if not tile.n and top - z < 0.09 and (x < 0.75 or x > 0.88):
        return 3
    return 2


def build(tile):
    steps = 16
    verts, faces = [[] for _ in PALETTE], [[] for _ in PALETTE]
    for j in range(steps):
        for i in range(steps):
            tone = _tone(tile, (i + 0.5) / steps, (j + 0.5) / steps)
            if tone is None:
                continue
            townkit.add_pixel(verts, faces, tone, i, j, steps)
    for v, f, colour in zip(verts, faces, ["cloudShade", "#d8deee", "#f0f4ff", "#ffffff"]):
        if f:
            kit.mesh(v, f, kit.mat(colour), name="cloud")


def _single_bounds(tile, x):
    lobes = [(0.25, 0.46, 0.21, 0.25), (0.48, 0.55, 0.24, 0.35),
             (0.75, 0.44, 0.20, 0.26)]
    if tile.alt:
        lobes = [(0.25, 0.44, 0.20, 0.27), (0.55, 0.55, 0.23, 0.35),
                 (0.76, 0.43, 0.20, 0.25)]
    top = max(_cap(x, *lobe) for lobe in lobes)
    bottom = 0.23
    # End billows turn into the flat base without square ends.
    if x < 0.20 or x > 0.80:
        bottom += 0.09
    return bottom, top


def _heap_bounds(tile, x, drift):
    mass = tile.shape == "mass"
    bottom = -1 if tile.s else 0.16
    cx = (0.55 if tile.alt else 0.43) + drift
    lobes = [(cx, 0.48, 0.35, 0.47 if mass else 0.43)]
    # Open ends have anchored shoulders, independent of alt and frame.
    lobes += [(0 if tile.w else 0.23, 0.40, 0.27 if tile.w else 0.21, 0.24)]
    lobes += [(1 if tile.e else 0.77, 0.40, 0.27 if tile.e else 0.21, 0.24)]
    if tile.alt:
        lobes.append((0.28 + drift, 0.46, 0.22, 0.31))
    top = 2 if tile.n else max(_cap(x, *lobe) for lobe in lobes)
    return bottom, top


def _outside_heap(tile, x, z):
    # Scalloped side shoulders continue periodically down a tall heap.
    inset = 0.06 + 0.09 * (1 + math.cos(math.tau * (z - 0.12)))
    if not tile.n and z > 0.40:
        inset = 0.02
    return (not tile.w and x < inset) or (not tile.e and x > 1 - inset)


def _shaded_inside(tile, x, z, drift):
    # A broad crescent under each lobe gives the interior rounded volume.
    # Keep these details off every shared edge so different alts still join.
    if 0.12 < x < 0.88 and 0.12 < z < 0.88:
        cx = (0.55 if tile.alt else 0.43) + drift
        if tile.shape == "single":
            cz = 0.55
        elif tile.n:
            cz = 0.62
        else:
            cz = 0.48
        outer = ((x - cx) / 0.33) ** 2 + ((z - cz) / 0.28) ** 2
        inner = ((x - cx + 0.07) / 0.31) ** 2 + ((z - cz - 0.09) / 0.27) ** 2
        if outer < 1 and inner > 1:
            return True
        if tile.n and ((x - 0.70) / 0.23) ** 2 + ((z - 0.25) / 0.18) ** 2 < 1:
            return True
    return False


def _base_tone(z, bottom):
    if z < bottom + 0.14:
        return 0
    if z < bottom + 0.20:
        return 1
    return None
