"""Material fringes on the receiving cell, with water glints on a four-frame loop."""

import math

import tilekit as kit
import waterkit

PALETTE = kit.ramp(
    "grass", "grassLight", "foliageDark", "foliage", "foliageLight",
    "dirt", "dirtLight", "rockDark", "rock", "rockLight", "sand",
    "sandDark", "waterDark", "water", "waterLight", "built", "builtLight",
) + [kit.BASE["foam"]]


def _draw(side, pixels):
    # Batch coplanar pixel faces by colour. Empty pixels remain transparent.
    groups = waterkit.edge_batches(side, pixels)
    for colour, (verts, faces) in groups.items():
        kit.mesh(verts, faces, kit.mat(colour), name="fringe-" + colour)


def _foliage(pixels, u, depth):
    for v in range(depth):
        colour = "foliageDark" if v == depth - 1 else "foliage"
        if (u + 2 * v) % 5 == 1 and v < depth - 1:
            colour = "foliageLight"
        pixels[u, v] = colour
    # Chipped leaf tips, with occasional gaps behind the low shrubs.
    if u in (3, 7, 11):
        pixels[u + 1, depth - 2] = "foliageLight"
        pixels.pop((u, depth - 2), None)


def _ground(pixels, u, depth, onto):
    for v in range(depth):
        if v == 0:
            colour = "grass"
        elif v == 1:
            colour = "dirt" if onto in ("water", "sand") else "grass"
        else:
            colour = "grassLight" if u % 3 == 0 else "grass"
        pixels[u, v] = colour
    if depth >= 4:
        pixels[u, 2] = "grassLight"


def _rock(pixels, u, depth):
    # A broken dark foundation, then angular stones and loose scree.
    for v in range(min(depth, 4)):
        pixels[u, v] = "rockDark" if v == min(depth, 4) - 1 else "rock"
    if u in (2, 3, 6, 7, 11, 12):
        pixels[u, 1] = "rockLight"
    if u in (4, 9, 13):
        pixels[u, 4] = "rockLight" if u == 4 else "rock"
        pixels.pop((u, 3), None)


def _sand(pixels, u, depth):
    depth = min(4, depth)
    for v in range(depth):
        pixels[u, v] = "sandDark" if v == depth - 1 else "sand"
    if u in (3, 8, 12):
        pixels[u, 1] = "dirtLight"


def _water(pixels, u, phase):
    depth = 2 + int(u not in (0, 1, 14, 15) and
                    math.sin(2 * math.pi * u / 8 + phase) > -0.2)
    for v in range(depth):
        pixels[u, v] = "waterDark" if v == depth - 1 else "water"


def _fringe(tile, pixels, u, depth, phase):
    if tile.source == "foliage":
        _foliage(pixels, u, depth)
    elif tile.source == "ground":
        _ground(pixels, u, depth, tile.onto)
    elif tile.source == "rock":
        _rock(pixels, u, depth)
    elif tile.source == "sand":
        _sand(pixels, u, depth)
    elif tile.source == "water":
        _water(pixels, u, phase)


def _glints(tile, pixels):
    source = tile.source
    # Glints sit on the wet lip without making a second solid border.
    step = int(round(tile.t * 4))
    for start in (2, 9):
        u = start + step
        if source == "water":
            pixels[u, 1] = "waterLight"
            pixels[u + 1, 1] = "waterLight"
        else:
            depth = max(v for (x, v), _ in pixels.items() if x == u) + 1
            if depth < 5:
                pixels[u, depth] = "waterLight"
                if source == "sand":
                    pixels[u + 1, min(depth, 4)] = "sand"


def build(tile):
    pixels = {}
    wet = tile.source == "water" or tile.onto == "water"
    phase = 2 * math.pi * tile.t
    # Identical end profiles give adjacent copies an unbroken, thin root.
    profile = (2, 2, 3, 4, 3, 2, 3, 5, 4, 3, 2, 4, 3, 3, 2, 2)

    for u, depth in enumerate(profile):
        _fringe(tile, pixels, u, depth, phase)

    if wet:
        _glints(tile, pixels)

    _draw(tile.side, pixels)
