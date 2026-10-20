"""Broad river channels, with earth banks and a slow southward current.

The mask opens arms of a rounded channel, including bends and junctions.
All surface marks use cell-periodic coordinates, independent of the mask.
"""

import math

import tilekit as kit

PALETTE = kit.ramp("water", "waterDark", "waterLight", "dirt", "grass")


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
    radius = 6.5 / 16
    for j in range(16):
        for i in range(16):
            # Wide interiors retain the same current, without any bank pixels.
            d = 0 if tile.fill else _distance(tile, (i + 0.5) / 16, (j + 0.5) / 16)
            if d > radius + 1.5 / 16:
                continue
            if d > radius + 0.5 / 16:
                color = "grass"
            elif d > radius:
                color = "dirt"
            elif d > radius - 1 / 16:
                color = "waterDark"
            else:
                color = "water"
                # One broad, quiet darker current, rather than noisy ripples.
                if 3 <= i <= 5 and (j + i // 3) % 16 < 10:
                    color = "#326bb0"
                phase = (j + round(16 * tile.t)) % 16
                if (i == 6 and phase in (2, 3, 4)) or (i == 10 and phase in (10, 11)):
                    color = "waterLight"
                elif i == 11 and phase == 10:
                    color = "waterLight"
            pixels[i, j] = color
    _draw(pixels)


def _draw(pixels):
    """Batch pixel-sized front faces by material, avoiding tiny objects."""
    batches = {}
    for (i, j), color in pixels.items():
        verts, faces = batches.setdefault(color, ([], []))
        a = len(verts)
        x, z = i / 16, j / 16
        verts.extend(((x, 0, z), (x + 1 / 16, 0, z),
                      (x + 1 / 16, 0, z + 1 / 16), (x, 0, z + 1 / 16)))
        faces.append((a, a + 1, a + 2, a + 3))
    for color, (verts, faces) in batches.items():
        kit.mesh(verts, faces, kit.mat(color), name="river")
