"""Narrow, bright stream with grassy banks, rounded bends and closed ends."""

import tilekit as kit
import waterkit

PALETTE = kit.ramp("water", "waterDark", "waterLight", "dirt", "grass") + [kit.BASE["foam"]]


def _color(tile, i, j, distance):
    radius = 3.5 / 16
    if distance > radius + 1 / 16:
        return "grass"
    if distance > radius:
        return "dirt"
    if distance > radius - 1 / 16:
        return "waterDark"
    phase = (j + round(16 * tile.t)) % 16
    if i == 7 and phase == 2:
        return "foam"
    if (i == 7 and phase in (1, 2, 3)) or (i == 9 and phase in (9, 10)):
        return "waterLight"
    return "water"


def build(tile):
    pixels = {}
    radius = 3.5 / 16
    for j in range(16):
        for i in range(16):
            d = 0 if tile.fill else waterkit.channel_distance(tile, (i + 0.5) / 16, (j + 0.5) / 16)
            if d > radius + 2 / 16:
                continue
            pixels[i, j] = _color(tile, i, j, d)
    waterkit.draw_pixels(pixels, "stream")
