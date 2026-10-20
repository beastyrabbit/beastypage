"""Narrow, bright stream with grassy banks, rounded bends and closed ends."""

import math

import tilekit as kit

PALETTE = kit.ramp("water", "waterDark", "waterLight", "dirt", "grass") + [kit.BASE["foam"]]


def _distance(tile, x, z):
    distances = [math.hypot(x - 0.5, z - 0.5)]
    if tile.n:
        distances.append(math.hypot(x - 0.5, min(z - 0.5, 0)))
    if tile.s:
        distances.append(math.hypot(x - 0.5, max(z - 0.5, 0)))
    if tile.e:
        distances.append(math.hypot(min(x - 0.5, 0), z - 0.5))
    if tile.w:
        distances.append(math.hypot(max(x - 0.5, 0), z - 0.5))
    return min(distances)


def build(tile):
    pixels = {}
    radius = 3.5 / 16
    for j in range(16):
        for i in range(16):
            d = 0 if tile.fill else _distance(tile, (i + 0.5) / 16, (j + 0.5) / 16)
            if d > radius + 2 / 16:
                continue
            if d > radius + 1 / 16:
                color = "grass"
            elif d > radius:
                color = "dirt"
            elif d > radius - 1 / 16:
                color = "waterDark"
            else:
                color = "water"
                phase = (j + round(16 * tile.t)) % 16
                if (i == 7 and phase in (1, 2, 3)) or (i == 9 and phase in (9, 10)):
                    color = "waterLight"
                if i == 7 and phase == 2:
                    color = "foam"
            pixels[i, j] = color
    _draw(pixels)


def _draw(pixels):
    batches = {}
    for (i, j), color in pixels.items():
        verts, faces = batches.setdefault(color, ([], []))
        a = len(verts)
        x, z = i / 16, j / 16
        verts.extend(((x, 0, z), (x + 1 / 16, 0, z),
                      (x + 1 / 16, 0, z + 1 / 16), (x, 0, z + 1 / 16)))
        faces.append((a, a + 1, a + 2, a + 3))
    for color, (verts, faces) in batches.items():
        kit.mesh(verts, faces, kit.mat(color), name="stream")
