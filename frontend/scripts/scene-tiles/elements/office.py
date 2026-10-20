"""Mirrored office glass with diagonal sky bands and varied inset panes."""

import tilekit as kit

SKY = "#70a6bc"
SKY_LIGHT = "#91bac9"
CLOUD = "#b4d5df"
GLASS = "#476b86"
PALETTE = kit.ramp("builtDark", "water", "glow") + [
    SKY, SKY_LIGHT, CLOUD, GLASS, kit.BASE["builtLight"], kit.BASE["waterLight"],
]
P = 1 / 16
_RIMS = {}


def _rim(color):
    """Flat, non-glow paint keeps a reusable border independent of glass."""
    if color not in _RIMS:
        material = kit.mat(color).copy()
        material.node_tree.nodes.clear()
        paint = material.node_tree.nodes.new("ShaderNodeEmission")
        paint.inputs["Color"].default_value = kit.linear(kit.BASE.get(color, color))
        paint.inputs["Strength"].default_value = 1
        output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
        material.node_tree.links.new(paint.outputs[0], output.inputs["Surface"])
        material.cycles.emission_sampling = "NONE"
        _RIMS[color] = material
    return _RIMS[color]


def _box(a, b, c, d, color, y=-.3):
    material = _rim(color) if isinstance(color, str) else color
    if "glow" in material:
        material.cycles.emission_sampling = "NONE"
    obj = kit.box(a * P, b * P, c * P, d * P, material, y, y + .01)
    obj.visible_shadow = obj.visible_diffuse = obj.visible_glossy = False


def _reflection(points, left, low, right, high, color, y):
    # Clip diagonal bands to the facade, including its finished outer edges.
    for axis, bound, sign in ((0, left, 1), (0, right, -1),
                              (1, low, 1), (1, high, -1)):
        clipped = []
        for a, b in zip(points, points[1:] + points[:1]):
            inside_a = (a[axis] - bound) * sign >= 0
            inside_b = (b[axis] - bound) * sign >= 0
            if inside_a:
                clipped.append(a)
            if inside_a != inside_b:
                t = (bound - a[axis]) / (b[axis] - a[axis])
                clipped.append(tuple(a[i] + t * (b[i] - a[i]) for i in (0, 1)))
        points = clipped
        if not points:
            return
    obj = kit.prism([(x * P, z * P) for x, z in points], _rim(color), y, y + .01)
    obj.visible_shadow = obj.visible_diffuse = obj.visible_glossy = False


def build(tile):
    left, right = (-16 if tile.w else 1), (32 if tile.e else 15)
    low, high = (-16 if tile.s else 1), (32 if tile.n else 12)
    _box(left, low, right, high, "builtDark")
    _box(left, low, right, high, GLASS, -.305)
    # x + z repeats every sixteen pixels, so both open axes share the same sky.
    # Broad soft-edged cloud streaks are beneath the uninterrupted mullion grid.
    for band in range(-3, 5):
        for offset, width, color, y in ((0, 9, SKY, -.309),
                                         (2, 6, SKY_LIGHT, -.312),
                                         (3, 3, CLOUD, -.315)):
            z = band * 16 + offset
            _reflection([(-16, z + 16), (32, z - 32),
                         (32, z + width - 32), (-16, z + width + 16)],
                        left, low, right, high, color, y)
    # Continuous mullions use the same pitch and colours on all open borders.
    for x in range(-16, 33, 4):
        if left <= x and x + 1 <= right:
            _box(x, low, x + 1, high, "builtLight", -.32)
    for z in range(-16, 33, 4):
        if low <= z and z + 1 <= high:
            _box(left, z, right, z + 1, "builtLight", -.33)
    for row, z in enumerate((1, 5, 9, 13)):
        if z + 2 > high:
            continue
        for col, x in enumerate((2, 6, 10)):
            pane = (row * 7 + col * 3 + tile.alt * 5) % 11
            color = GLASS if pane < 3 else CLOUD if pane == 4 else SKY
            lit = pane % 3 != 0
            if row == 1 and col == 1:
                lit = tile.frame != 2
            if tile.variant == "night" and lit:
                _box(x, z, x + 2, z + 2, kit.glow("glow", 1.3), -.36)
            elif pane < 3 or pane == 4:
                # Leave most panes clear so the diagonal reflection stays broad.
                _box(x, z, x + 2, z + 2, color, -.36)
    if tile.shape == "mass":
        # Recessed broad wings share the grid but have a deeper central pier.
        _box(7, low, 8, high, "builtDark", -.38)
    if not tile.w:
        _box(1, low, 2, high, "builtLight", -.40)
    if not tile.e:
        _box(14, low, 15, high, "builtDark", -.40)
    if not tile.n:
        _box(left, 12, right, 13, "builtLight", -.42)
        _box(left, 13, right, 14, "builtDark", -.41)
        _box(5, 14, 11, 16, "builtDark", -.34)
        _box(5, 15, 10, 16, "builtLight", -.36)
        _box(6, 14, 7, 15, "water", -.38)
        _box(8, 14, 9, 15, "water", -.38)
    if not tile.s:
        _box(left, 1, right, 2, "builtDark", -.43)
        _box(6, 1, 11, 5, "builtDark", -.44)
        lobby = kit.glow("glow", 1.2) if tile.variant == "night" else _rim(CLOUD)
        _box(7, 2, 10, 5, lobby, -.46)
        _box(8, 2, 9, 5, "builtDark", -.48)
        _box(5, 5, 12, 6, "builtLight", -.50)
    if tile.n:
        # A projecting spandrel shields the seam from nearby glass reflections.
        _box(left, 14, right, 18, _rim("builtDark"), -.60)
        for x in range(-16, 33, 4):
            if left <= x and x + 1 <= right:
                _box(x, 14, x + 1, 18, _rim("builtLight"), -.62)
