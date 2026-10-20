"""Quiet open water, long swell bands, a pale horizon and a deep foreground."""

import math

import waterkit

PALETTE = ["#24508a", "#3066a0", "#3a78c2", "#4789c5", "#65a5d9",
           "#8cc8f0", "#c0dfee", "#e6f4ff"]


def _bands(tile, i, j, pulse):
    # Straight, mostly continuous bands replace the small wave glyphs.
    # Their ends wrap at E/W; the top and bottom remain period-one.
    if j == 10:
        return 3
    if j == 5:
        return _band(tile, i, 4 + round(pulse), 13 + round(pulse), 1)
    if tile.shape == "row" and j == 11:
        return _band(tile, i, 7, 10, 3)
    return 2


def _band(tile, i, left, right, color):
    left = 0 if tile.w else left
    right = 16 if tile.e else right
    return color if left <= i < right else 2


def _shore(tile, i, j, color):
    if not tile.s and j < 4:
        color = 0 if j < 2 else 1
    if not tile.n and j >= 12:
        color = {15: 5, 14: 4}.get(j, 3)
    if (not tile.w and i == 0) or (not tile.e and i == 15):
        color = min(color, 1)
    return color


def _sparkle(tile, i, j, color):
    # Only the horizon-facing row sparkles, never every interior cell.
    # A single point briefly opens into a three-pixel reflection.
    if tile.n or j != 8 or (tile.w and tile.e):
        return color
    center = 6 if not tile.w else 9
    phase = tile.frame if not tile.w else (tile.frame + 2) % 4
    if i == center and phase in (0, 1):
        return 7 if phase == 0 else 5
    if i in (center - 1, center + 1) and phase == 0:
        return 4
    return color


def build(tile):
    pixels = {}
    pulse = math.sin(2 * math.pi * tile.t)
    for j in range(16):
        for i in range(16):
            color = _bands(tile, i, j, pulse)
            color = _shore(tile, i, j, color)
            color = _sparkle(tile, i, j, color)
            pixels[i, j] = PALETTE[color]
    waterkit.draw_pixels(pixels, "open-sea")
