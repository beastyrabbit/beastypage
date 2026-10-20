"""Picture-plane meshes and periodic crowns shared by woodland builders."""

import math

import tilekit as kit


def polygon(points, color, depth, thickness):
    coords = [(x / 16, z / 16) for x, z in points]
    obj = kit.prism(coords, kit.mat(color), y0=depth, y1=depth + thickness)
    obj.visible_shadow = False


def quad(verts, faces, x, z, resolution=16):
    i = len(verts)
    verts.extend([(x / resolution, 0, z / resolution),
                  ((x + 1) / resolution, 0, z / resolution),
                  ((x + 1) / resolution, 0, (z + 1) / resolution),
                  (x / resolution, 0, (z + 1) / resolution)])
    faces.append((i, i + 1, i + 2, i + 3))


def draw_colors(pixels, name, ordered=True):
    colors = set(pixels.values())
    if ordered:
        colors = sorted(colors)
    for color in colors:
        verts, faces = [], []
        for (x, z), value in pixels.items():
            if value == color:
                quad(verts, faces, x, z)
        kit.mesh(verts, faces, kit.mat(color), name=name)


def sample(tile, painter, resolution=16, normalized=False):
    pixels = {}
    scale = resolution if normalized else 1
    for z in range(resolution):
        for x in range(resolution):
            color = painter(tile, (x + .5) / scale, (z + .5) / scale)
            if color is not None:
                pixels[x, z] = color
    return pixels


def _draw_palette(palette, verts, faces, name, light):
    for color, v, f in zip(palette, verts, faces):
        if f:
            if light != 1:
                color = kit.shade(color, light)
            kit.mesh(v, f, kit.mat(color), name=name)


def draw_indices(pixels, palette, name, resolution=16, clip=False, light=1):
    verts, faces = [[] for _ in palette], [[] for _ in palette]
    for (x, z), c in pixels.items():
        if clip and not (0 <= x < resolution and 0 <= z < resolution):
            continue
        quad(verts[c], faces[c], x, z, resolution)
    _draw_palette(palette, verts, faces, name, light)


def line(pixels, a, b, color, width=1):
    steps = max(1, math.ceil(math.dist(a, b) * 3))
    for i in range(steps + 1):
        t = i / steps
        x = round(a[0] + (b[0] - a[0]) * t)
        z = round(a[1] + (b[1] - a[1]) * t)
        for dx in range(width):
            pixels[x + dx, z] = color


def floor(x):
    return 10.5 + .8 * math.sin(math.tau * x / 16) + .5 * math.sin(math.tau * x / 8)


def _shoulder(tile, x, z):
    cap = 14.5 + .6 * math.sin(math.tau * x / 16) + .45 * math.sin(math.tau * x / 8)
    if z > cap:
        return False
    rx, rz = (13.5, 13.5) if tile.s else (7, 6)
    for closed, dx in ((not tile.w, x), (not tile.e, 16 - x)):
        if closed and (max(0, rx + 1 - dx) / rx) ** 2 + (max(0, z - 14.5 + rz) / rz) ** 2 > 1:
            return False
    return True


def outline(tile, x, z, closed_floor=True):
    """Round a whole corner cell off the shoulder of a shared crown."""
    side = 1 + .65 * (1 - math.cos(math.tau * z / 16))
    if (not tile.w and x < side) or (not tile.e and x > 16 - side):
        return False
    if not tile.n and not _shoulder(tile, x, z):
        return False
    if closed_floor and not tile.s and z < floor(x):
        return False
    return True


def interior(x, z):
    if min(x, z, 16 - x, 16 - z) < 1:
        return 0
    return math.sin(math.pi * x / 16) ** 2 * math.sin(math.pi * z / 16) ** 2


def _lobes(tile, centers, phase_scale, radii):
    # Border lobes stay fixed; only crowns inside the tile vary by mask and alt.
    lobes = [(0, 6, 4.7, 4.1), (16, 6, 4.7, 4.1),
             (9, 0, 4.5, 4.8), (9, 16, 4.5, 4.8)]
    seed = tile.mask * 11 + tile.alt * 37
    rx_base, rx_scale, rz_scale = radii
    for i, (cx, cz) in enumerate(centers):
        phase = seed * phase_scale + i * 2.4
        rx = rx_base + rx_scale * (1 + math.sin(phase * 1.7))
        rz = 3.5 + rz_scale * (1 + math.cos(phase))
        cx += 1.1 * math.sin(phase) + .35 * math.sin(math.tau * tile.t + i)
        cz += 1.1 * math.cos(phase * 1.3)
        # Keep variable lobes a pixel away from open joins throughout the sway.
        cx = max(rx + 1, min(15 - rx, cx))
        cz = max(rz + 1, min(15 - rz, cz))
        lobes.append((cx, cz, rx, rz))
    return lobes


def clumps(tile, x, z, colors, centers, phase_scale=.73, radii=(3.7, .6, .5), pointed=False):
    seed = tile.mask * 11 + tile.alt * 37
    warp = interior(x, z)
    sample_x = x + 2.7 * warp * math.sin(seed * .37)
    sample_z = z + 2.7 * warp * math.cos(seed * .61)
    dark, leaf, light = colors
    color = dark
    for cx, cz, rx, rz in _lobes(tile, centers, phase_scale, radii):
        u, v = (sample_x - cx) / rx, (sample_z - cz) / rz
        rim = 1
        if pointed:
            rim += .12 * math.sin(5 * math.atan2(v, u))
        if u * u + v * v < rim:
            color = dark
            if (u + .14) ** 2 + (v - .16) ** 2 < .86:
                color = leaf
            if (u + .32) ** 2 + (v - .38) ** 2 < .27:
                color = light
    return color


def grove(tile, x, z, trunk, clump, dark, shadow, dark_sides=False):
    if x < 1 or x > 15:
        trunk = None
    if not outline(tile, x, z):
        return trunk
    color = clump(tile, x, z)
    if not tile.s and z < floor(x) + shadow:
        color = dark
    if dark_sides and ((not tile.w and x < 2.5) or (not tile.e and x > 13.5)):
        color = dark
    return color
