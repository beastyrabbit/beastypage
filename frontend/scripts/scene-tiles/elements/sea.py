"""Quiet open water, long swell bands, a pale horizon and a deep foreground."""

import math

import tilekit as kit

PALETTE = ["#24508a", "#3066a0", "#3a78c2", "#4789c5", "#65a5d9",
           "#8cc8f0", "#c0dfee", "#e6f4ff"]


def build(tile):
    pixels = {}
    pulse = math.sin(2 * math.pi * tile.t)
    for j in range(16):
        for i in range(16):
            color = 2
            # Straight, mostly continuous bands replace the small wave glyphs.
            # Their ends wrap at E/W; the top and bottom remain period-one.
            if j == 10:
                color = 3
            if j == 5:
                left = 0 if tile.w else 4 + round(pulse)
                right = 16 if tile.e else 13 + round(pulse)
                if left <= i < right:
                    color = 1
            if tile.shape == "row" and j == 11:
                left = 0 if tile.w else 7
                right = 16 if tile.e else 10
                if left <= i < right:
                    color = 3
            if not tile.s:
                if j < 2:
                    color = 0
                elif j < 4:
                    color = 1
            if not tile.n:
                if j == 15:
                    color = 5
                elif j == 14:
                    color = 4
                elif j >= 12:
                    color = 3
            if (not tile.w and i == 0) or (not tile.e and i == 15):
                color = min(color, 1)
            # Only the horizon-facing row sparkles, never every interior cell.
            # A single point briefly opens into a three-pixel reflection.
            if not tile.n and j == 8 and (not tile.w or not tile.e):
                center = 6 if not tile.w else 9
                phase = tile.frame if not tile.w else (tile.frame + 2) % 4
                if i == center and phase in (0, 1):
                    color = 7 if phase == 0 else 5
                elif i in (center - 1, center + 1) and phase == 0:
                    color = 4
            pixels[i, j] = PALETTE[color]
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
        kit.mesh(verts, faces, kit.mat(color), name="open-sea")
