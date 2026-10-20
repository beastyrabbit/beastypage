"""Front-facing cottages with deep tiled roofs and warm plaster walls."""

import tilekit as kit

PALETTE = kit.ramp(
    "woodLight", "wood", "trunk", "roof", "red", "sand", "sandDark",
    "waterLight", "rock", "rockLight", "builtDark", "glow",
)
P = 1 / 16


def _box(x0, z0, x1, z1, color, front=-0.28):
    material = kit.mat(color) if isinstance(color, str) else color
    obj = kit.box(x0 * P, z0 * P, x1 * P, z1 * P,
                  material, front, front + 0.01)
    # Explicit pixel shadows keep alternative details off open tile borders.
    obj.visible_shadow = False
    obj.visible_diffuse = False
    obj.visible_glossy = False
    return obj


def _prism(points, color, front=-0.38):
    obj = kit.prism([(x * P, z * P) for x, z in points],
                    kit.mat(color), front, front + 0.02)
    obj.visible_shadow = False
    obj.visible_diffuse = False
    obj.visible_glossy = False
    return obj


def _pane(x0, z0, x1, z1, material, front=-0.34):
    # Keep emission in the glow overlay rather than lighting nearby plaster.
    if "glow" in material:
        material.cycles.emission_sampling = "NONE"
    obj = _box(x0, z0, x1, z1, material, front)
    obj.visible_diffuse = False
    obj.visible_glossy = False


def _roof(tile, compact, glass):
    low, ridge = (8, 15) if compact else (1, 15)
    left, right = (-16 if tile.w else 1), (32 if tile.e else 15)
    # Closed ends rise at about 45 degrees. A narrow isolated gable uses
    # its full height even when there is no horizontal neighbour.
    slope = min(ridge - low, 7 if not tile.w and not tile.e else 13)

    def bounds(z):
        inset = slope * (z - low) / (ridge - low)
        return (left if tile.w else left + inset,
                right if tile.e else right - inset)

    def band(z0, z1, color, front):
        l0, r0 = bounds(z0)
        l1, r1 = bounds(z1)
        _prism([(l0, z0), (r0, z0), (r1, z1), (l1, z1)], color, front)

    _chimney(tile, low)
    _shingles(low, ridge, bounds, band)
    _box(left, low - 1, right, low, "trunk", -0.44)
    l, r = bounds(ridge - 1)
    _box(l, ridge - 1, r, ridge, "red", -0.43)

    _dormer(tile, compact, glass)


def _window(glass):
    # One large framed window per wall cell, with shutters and a broad sill.
    _box(4, 5, 11, 12, "trunk", -0.30)
    _pane(5, 6, 10, 11, glass)
    _box(7, 6, 8, 11, "woodLight", -0.36)
    _box(5, 8, 10, 9, "woodLight", -0.36)
    _box(2, 6, 4, 11, "wood", -0.32)
    _box(11, 6, 13, 11, "wood", -0.32)
    _box(3, 4, 12, 5, "woodLight", -0.38)


def _door():
    _box(5, 2, 12, 12, "trunk", -0.31)
    _box(6, 2, 11, 11, "wood", -0.33)
    _box(7, 3, 8, 10, "woodLight", -0.34)
    _box(10, 6, 11, 7, "sand", -0.35)
    _box(4, 1, 13, 2, "rockLight", -0.38)


def build(tile):
    glass = kit.glow("glow", 1.5) if tile.variant == "night" else kit.mat("waterLight")
    compact = not tile.n and not tile.s
    left, right = (-16 if tile.w else 1), (32 if tile.e else 15)

    # A closed north edge is a whole roof cell, not another windowed storey.
    if not tile.n and not compact:
        _roof(tile, False, glass)
        return

    bottom = -16 if tile.s else 1
    top = 8 if compact else 32
    _walls(tile, compact, left, right, bottom, top)
    if compact:
        # The little cottage fills fourteen pixels across and high.
        _box(3, 3, 8, 7, "trunk", -0.30)
        _pane(4, 4, 7, 6, glass)
        _box(2, 2, 9, 3, "woodLight", -0.36)
        _box(10, 2, 14, 8, "trunk", -0.30)
        _box(11, 2, 13, 7, "wood", -0.32)
        _box(12, 4, 13, 5, "sand", -0.34)
        _roof(tile, True, glass)
    elif not tile.s and tile.alt == 0:
        _door()
    else:
        _window(glass)


def _dormer(tile, compact, glass):
    if tile.alt == 1:
        if not tile.w and tile.e:
            centre = 10
        elif tile.w and not tile.e:
            centre = 6
        else:
            centre = 8
        bottom, width = (10, 2) if compact else (4, 3)
        top = bottom + (2 if compact else 5)
        _box(centre - width, bottom, centre + width, top, "wood", -0.46)
        _pane(centre - width + 1, bottom + 1, centre + width - 1,
              top, glass, -0.48)
        if not compact:
            _box(centre, bottom + 1, centre + 1, top, "trunk", -0.49)
        _prism([(centre - width - 1, top), (centre + width + 1, top),
                (centre, top + 3)], "trunk", -0.50)
        _prism([(centre - width, top + 1), (centre + width, top + 1),
                (centre, top + 3)], "roof", -0.51)
        _box(centre - width - 1, bottom - 1, centre + width + 1,
             bottom, "woodLight", -0.50)


def _shingles(low, ridge, bounds, band):
    band(low, ridge, "trunk", -0.38)
    for z in range(low + 1, ridge, 3):
        top = min(z + 2, ridge)
        band(z, top, "roof", -0.40)
        # Staggered shingle joints repeat independently of the alternative.
        l, r = bounds(top)
        for x in range(-16 + (2 if (z - low) % 2 else 0), 33, 4):
            if l + 1 <= x and x + 1 <= r - 1:
                _box(x, z, x + 1, top, "trunk", -0.41)
        band(top - 1, top, "red", -0.42)


def _walls(tile, compact, left, right, bottom, top):
    _box(left, bottom, right, top, "sand", -0.25)
    if not tile.w:
        _box(left, bottom, left + 1, top, "wood", -0.28)
    if not tile.e:
        _box(right - 1, bottom, right, top, "trunk", -0.28)
    if tile.shape == "mass":
        # Timber framing distinguishes a rambling cottage from a plaster one.
        _box(left, 7 if compact else 14, right, 8 if compact else 16,
             "wood", -0.28)
        _box(2, bottom, 3, top, "wood", -0.28)
        _box(13, bottom, 14, top, "wood", -0.28)

    if not tile.s:
        _foundation(left, right, compact)


def _foundation(left, right, compact):
    _box(left, 1, right, 3 if not compact else 2, "rock", -0.29)
    for x in range(-16, 33, 4):
        if left <= x < right:
            _box(x, 1, min(x + 3, right), 2, "rockLight", -0.30)


def _chimney(tile, low):
    # The roof hides the lower chimney bricks as its outline rises.
    if tile.alt == 0:
        chimney = 4 if not tile.e and tile.w else 10
        _box(chimney, low + 1, chimney + 2, 15, "builtDark", -0.20)
        _box(chimney - 1, 15, chimney + 3, 16, "trunk", -0.22)
        _box(chimney, 13, chimney + 1, 15, "rockLight", -0.23)
