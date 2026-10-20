"""Glowing sun and moon, cropped from one continuous neighbourhood body."""

import math

import tilekit as kit
import townkit

PALETTE = ["#e7a743", "#ffcf4a", "#ffe27a", "#fff3c0", "#aab8d6", "#c9d0e2", "#e8ecf7"]


def _body(tile):
    if tile.shape == "single" or not tile.mask:
        return 0.5, 0.5, 0.29
    # Build the whole 3-cell disc in the neighbourhood and crop it. Mirrored
    # corner sections also join in 2x2 groups, giving a slightly pointed oval
    # there because the mask cannot distinguish those two group sizes.
    cx = _centre(tile.w, tile.e)
    cz = _centre(tile.s, tile.n)
    return cx, cz, 1.38


def build(tile):
    moon = tile.variant == "moon"
    colours = ["#aab8d6", "#c9d0e2", "#e8ecf7"] if moon else ["#e7a743", "#ffcf4a", "#ffe27a", "#fff3c0"]
    materials = [kit.glow(c, 0.15) for c in colours]
    steps = 32
    pulse = 0.025 * math.sin(math.tau * tile.t)
    cx, cz, radius = _body(tile)
    # Keep each large crater within a corner cell. The same sections then
    # assemble cleanly in 2x2 groups without cutting a crater at their join.
    craters = [(-0.55, 0.50, 0.13), (0.54, 0.51, 0.085), (0.52, -0.55, 0.17), (-0.52, -0.52, 0.09)]
    verts, faces = townkit.raster(
        steps, len(colours),
        lambda i, j: _tone(tile, moon, (i + 0.5) / steps, (j + 0.5) / steps,
                           cx, cz, radius, pulse, craters),
    )
    for v, f, material in zip(verts, faces, materials):
        if f:
            kit.mesh(v, f, material, name="moon" if moon else "sun")


def _centre(low, high):
    if not low and high:
        return 1.5
    if low and not high:
        return -0.5
    return 0.5


def _moon_tone(tile, x, z, d, cx, cz, radius, craters):
    if d > 0:
        return None
    # The crescent cuts away geometry to leave transparent sky.
    if tile.shape == "single" and math.hypot(x - 0.65, z - 0.64) < 0.28:
        return None
    tone = 1 if d > -0.055 else 2
    for dx, dz, r in craters:
        crater_x, crater_z = cx + dx * radius, cz + dz * radius
        if math.hypot(x - crater_x, z - crater_z) < max(0.045, r * radius) and d < -0.045:
            tone = 0 if z > crater_z else 1
    return tone


def _sun_tone(x, z, d, cx, cz, radius, pulse):
    if d > 0:
        # Periodic ray spacing also matches along open borders.
        ray = abs(math.sin(math.tau * 4 * x)) < 0.55 or abs(math.sin(math.tau * 4 * z)) < 0.55
        if 0.045 < d < 0.10 + pulse and ray:
            return 0
        return None
    tone = 1 if d > -0.055 else 2
    if math.hypot(x - (cx - 0.28 * radius), z - (cz + 0.35 * radius)) < radius * 0.34:
        tone = 3
    return tone


def _tone(tile, moon, x, z, cx, cz, radius, pulse, craters):
    distance = math.hypot(x - cx, z - cz) - radius
    if moon:
        return _moon_tone(tile, x, z, distance, cx, cz, radius, craters)
    return _sun_tone(x, z, distance, cx, cz, radius, pulse)
