"""Material fringes on the receiving cell, with water glints on a four-frame loop."""

import math

import tilekit as kit

PALETTE = kit.ramp(
    "grass", "grassLight", "foliageDark", "foliage", "foliageLight",
    "dirt", "dirtLight", "rockDark", "rock", "rockLight", "sand",
    "sandDark", "waterDark", "water", "waterLight", "built", "builtLight",
) + [kit.BASE["foam"]]


def _point(side, u, v):
    """u runs along the source edge; v runs into the receiving cell, in pixels."""
    return {
        "N": (u / 16, 1 - v / 16),
        "E": (1 - v / 16, 1 - u / 16),
        "S": (1 - u / 16, v / 16),
        "W": (v / 16, u / 16),
    }[side]


def _draw(side, pixels):
    # Batch coplanar pixel faces by colour. Empty pixels remain transparent.
    groups = {}
    for (u, v), colour in pixels.items():
        verts, faces = groups.setdefault(colour, ([], []))
        offset = len(verts)
        for a, b in ((u, v), (u + 1, v), (u + 1, v + 1), (u, v + 1)):
            x, z = _point(side, a, b)
            verts.append((x, -0.1, z))
        # _point preserves winding between sides. Reverse to face the camera.
        faces.append(tuple(offset + i for i in (3, 2, 1, 0)))
    for colour, (verts, faces) in groups.items():
        kit.mesh(verts, faces, kit.mat(colour), name="fringe-" + colour)


def build(tile):
    pixels = {}
    source, onto = tile.source, tile.onto
    wet = source == "water" or onto == "water"
    phase = 2 * math.pi * tile.t
    # Identical end profiles give adjacent copies an unbroken, thin root.
    profile = (2, 2, 3, 4, 3, 2, 3, 5, 4, 3, 2, 4, 3, 3, 2, 2)

    for u, depth in enumerate(profile):
        if source == "foliage":
            for v in range(depth):
                colour = "foliageDark" if v == depth - 1 else "foliage"
                if (u + 2 * v) % 5 == 1 and v < depth - 1:
                    colour = "foliageLight"
                pixels[u, v] = colour
            # Chipped leaf tips, with occasional gaps behind the low shrubs.
            if u in (3, 7, 11):
                pixels[u + 1, depth - 2] = "foliageLight"
                pixels.pop((u, depth - 2), None)
        elif source == "ground":
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
        elif source == "rock":
            # A broken dark foundation, then angular stones and loose scree.
            for v in range(min(depth, 4)):
                pixels[u, v] = "rockDark" if v == min(depth, 4) - 1 else "rock"
            if u in (2, 3, 6, 7, 11, 12):
                pixels[u, 1] = "rockLight"
            if u in (4, 9, 13):
                pixels[u, 4] = "rockLight" if u == 4 else "rock"
                pixels.pop((u, 3), None)
        elif source == "sand":
            depth = min(4, depth)
            for v in range(depth):
                pixels[u, v] = "sandDark" if v == depth - 1 else "sand"
            if u in (3, 8, 12):
                pixels[u, 1] = "dirtLight"
        elif source == "water":
            depth = 2 + int(u not in (0, 1, 14, 15) and
                            math.sin(2 * math.pi * u / 8 + phase) > -0.2)
            for v in range(depth):
                pixels[u, v] = "waterDark" if v == depth - 1 else "water"
        elif source == "built":
            for v in range(min(depth, 3)):
                pixels[u, v] = "builtLight" if v == 0 else "built"

    if wet:
        # Glints sit on the wet lip without making a second solid border.
        step = int(round(tile.t * 4))
        for start in (2, 9):
            u = start + step
            if source == "water":
                pixels[u, 1] = "waterLight"
                pixels[u + 1, 1] = "waterLight"
            else:
                depth = max(v for x, v in pixels if x == u) + 1
                if depth < 5:
                    pixels[u, depth] = "waterLight"
                    if source == "sand":
                        pixels[u + 1, min(depth, 4)] = "sand"

    _draw(tile.side, pixels)
