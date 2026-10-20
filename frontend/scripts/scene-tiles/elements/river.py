"""Broad river channels, with earth banks and a slow southward current.

The mask opens arms of a rounded channel, including bends and junctions.
All surface marks use cell-periodic coordinates, independent of the mask.
"""

import tilekit as kit
import waterkit

PALETTE = kit.ramp("water", "waterDark", "waterLight", "dirt", "grass")


def _current(tile, i, j):
    phase = (j + round(16 * tile.t)) % 16
    if ((i == 6 and phase in (2, 3, 4)) or (i == 10 and phase in (10, 11))
            or (i == 11 and phase == 10)):
        return "waterLight"
    if 3 <= i <= 5 and (j + i // 3) % 16 < 10:
        return "#326bb0"
    return "water"


def _color(tile, i, j, distance):
    radius = 6.5 / 16
    if distance > radius + 0.5 / 16:
        return "grass"
    if distance > radius:
        return "dirt"
    if distance > radius - 1 / 16:
        return "waterDark"
    return _current(tile, i, j)


def build(tile):
    pixels = {}
    radius = 6.5 / 16
    for j in range(16):
        for i in range(16):
            # Wide interiors retain the same current, without any bank pixels.
            d = 0 if tile.fill else waterkit.channel_distance(tile, (i + 0.5) / 16, (j + 0.5) / 16)
            if d > radius + 1.5 / 16:
                continue
            pixels[i, j] = _color(tile, i, j, d)
    waterkit.draw_pixels(pixels, "river")
