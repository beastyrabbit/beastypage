"""Animated water interactions and self-lit pools and beams, on transparent cells."""

import math

import tilekit as kit

PALETTE = kit.ramp(
    "water", "waterDark", "waterLight", "foam", "cloudShade", "wood",
    "woodLight", "trunk", "glow", "sand", "sandDark",
)


def _point(side, u, v):
    return {
        "N": (u / 16, 1 - v / 16),
        "E": (1 - v / 16, 1 - u / 16),
        "S": (1 - u / 16, v / 16),
        "W": (v / 16, u / 16),
    }[side]


class _Canvas:
    """A small picture-plane mesh, with source-relative pixel coordinates."""

    def __init__(self):
        self.pixels = {}

    def dot(self, u, v, colour):
        u, v = int(u), int(v)
        if 0 <= u < 16 and 0 <= v < 16:
            self.pixels[u, v] = colour

    def rect(self, u, v, w, h, colour):
        for x in range(int(u), int(u + w)):
            for y in range(int(v), int(v + h)):
                self.dot(x, y, colour)

    def ellipse(self, u, v, rx, ry, colour, ring=False):
        for x in range(16):
            for y in range(16):
                d = ((x + 0.5 - u) / rx) ** 2 + ((y + 0.5 - v) / ry) ** 2
                inner = ((x + 0.5 - u) / max(0.5, rx - 1)) ** 2 + (
                    (y + 0.5 - v) / max(0.5, ry - 1)) ** 2
                if d <= 1 and (not ring or inner >= 1):
                    self.dot(x, y, colour)

    def line(self, u0, v0, u1, v1, colour):
        steps = max(1, int(max(abs(u1 - u0), abs(v1 - v0)) * 2))
        for i in range(steps + 1):
            t = i / steps
            self.dot(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, colour)

    def draw(self, side):
        groups = {}
        for (u, v), colour in self.pixels.items():
            verts, faces = groups.setdefault(colour, ([], []))
            offset = len(verts)
            for a, b in ((u, v), (u + 1, v), (u + 1, v + 1), (u, v + 1)):
                x, z = _point(side, a, b)
                verts.append((x, -0.1, z))
            faces.append(tuple(offset + i for i in (3, 2, 1, 0)))
        for colour, (verts, faces) in groups.items():
            if colour.startswith("lit-"):
                material = kit.glow({
                    "lit-core": "#ffd27a", "lit-mid": "#e3c58c",
                    "lit-edge": "#c9a66b",
                }[colour], strength=0.65)
                # Alpha still cuts to binary in tilekit; sparse outer pixels
                # preserve the scenery underneath the illuminated footprint.
                if colour == "lit-edge":
                    material.node_tree.nodes.get("Principled BSDF").inputs["Alpha"].default_value = 0.7
            elif colour == "mist":
                material = kit.transparent("foam", 0.72)
            else:
                material = kit.mat(colour)
            kit.mesh(verts, faces, material, name="combo-" + colour)


def _splash(c, frame, spray=False):
    # Elliptical impact ring grows and contracts under the falling column.
    swell = (0, 1, 2, 1)[frame]
    c.ellipse(8, 5, 4.5 + swell / 2, 1.8 + swell / 3, "waterLight", ring=True)
    c.ellipse(8, 4, 3, 1.4, "foam", ring=True)
    c.rect(6, 0, 4, 2, "waterLight" if not spray else "mist")
    c.line(5, 3, 3 - frame % 2, 1, "foam")
    c.line(10, 3, 12 + frame % 2, 1, "foam")
    for i in range(5):
        phase = (frame + i) % 4
        u = (2, 5, 8, 11, 14)[i]
        v = (1, 3, 2, 5)[phase] + (i % 2)
        c.dot(u, v, "foam")
    if spray:
        # Separate rising puffs, with checker gaps so this reads as mist.
        for i in range(4):
            x = 3 + i * 3 + (frame + i) % 2
            y = 5 + (frame + 2 * i) % 4
            c.ellipse(x, y, 1.8, 1.4, "mist")
        c.rect(6 + frame % 2, 10, 3, 1, "mist")
    else:
        c.ellipse(8, 7 + frame % 2, 6 + swell / 3, 2.1, "waterLight", ring=True)
        c.rect(5 + frame % 2, 8 + frame % 2, 3, 1, "foam")


def _surf(c, tile, cliff=False):
    shift = (0, 1, 2, 1)[tile.frame % 4]
    for u in range(16):
        # One-unit periodic wave train; both ends stay at a shallow depth.
        taper = math.sin(math.pi * (u + 0.5) / 16)
        wave = math.sin(2 * math.pi * (u / 8 + tile.t))
        front = 2 + int(taper * (2 + shift) + 0.7 * wave)
        for v in range(front):
            c.dot(u, v, "waterLight" if v == front - 1 else "water")
        c.dot(u, front, "foam")
        if (u + tile.frame) % 4 != 0:
            c.dot(u, front + 3, "waterLight")
    if cliff:
        for i in range(6):
            u = 1 + i * 2
            v = 5 + (i + tile.frame) % 4
            c.dot(u, v, "foam")
            if i % 2:
                c.dot(u + 1, v - 1, "mist")


def _current(c, tile, confluence=False):
    # A narrow incoming throat opens into a curling, broken current plume.
    for v in range(12):
        bend = math.sin(v / 5 + 2 * math.pi * tile.t)
        centre = 8 + (v / 4 if confluence else bend)
        width = 1.5 + v * (0.14 if confluence else 0.28)
        for u in range(16):
            distance = abs(u + 0.5 - centre)
            if distance < width and (v < 4 or (u + v) % 4 != 0):
                c.dot(u, v, "waterLight" if distance > width - 1 else "water")
    for i in range(3):
        v = (i * 4 + tile.frame) % 11
        x = 7 + (v // 4 if confluence else (i % 2) * 2)
        c.line(x, v, x + 1, v + 2, "foam" if i == 0 else "waterLight")
    if confluence:
        c.line(12, 7 + tile.frame % 2, 10, 12, "waterLight")


def _posts(c, frame):
    for u, length in ((3, 7), (11, 9)):
        radius = (2.5, 3.2, 4.0, 3.6)[frame]
        c.ellipse(u + 1, length + 1, radius, 1.5 + frame / 6, "waterLight", ring=True)
        c.rect(u, 0, 2, length, "trunk")
        c.rect(u, 0, 1, length - 1, "woodLight")
        c.rect(u, length - 2, 2, 2, "wood")
        c.dot(u + (frame % 2), length, "foam")


def _wake(c, frame):
    # The apex touches the boat; the two arms widen into the receiving cell.
    c.rect(7, 0, 2, 2, "foam")
    for v in range(2, 14):
        spread = v * 0.43
        colour = "foam" if (v + frame) % 5 < 2 else "waterLight"
        c.dot(7.5 - spread, v, colour)
        c.dot(8 + spread, v, colour)
        if v > 5 and (v + frame) % 4 == 0:
            c.dot(8 - spread + 2, v, "waterLight")
            c.dot(7 + spread - 2, v, "waterLight")
    c.rect(7, 3 + frame, 2, 1, "waterLight")


def _light(c, tile, beam=False):
    pulse = (0, 0.7, 0.35, -0.5)[tile.frame % 4]
    for u in range(16):
        for v in range(16):
            if beam:
                sweep = math.sin(2 * math.pi * (tile.t + 1 / 16))
                centre = 7.5 + sweep * (0.5 + v * 0.32)
                width = 0.9 + v * 0.27
                distance = abs(u + 0.5 - centre) / width
                if distance > 1 or v == 15:
                    continue
                # The warm narrow core is luminous; the fan thins into air.
                if distance < 0.3 and v < 7:
                    colour = "lit-core"
                elif distance < 0.65 and (u + v) % 3 != 0:
                    colour = "lit-mid"
                elif (u + v) % 2 == 0:
                    colour = "lit-edge"
                else:
                    continue
            else:
                d = ((u + 0.5 - 8) / (6.5 + pulse)) ** 2 + ((v + 0.5 - 5) / 4) ** 2
                if d > 1:
                    continue
                if d < 0.18:
                    colour = "lit-core"
                elif d < 0.58 and (u + v) % 4 != 0:
                    colour = "lit-mid"
                elif (u + v) % 2 == 0:
                    colour = "lit-edge"
                else:
                    continue
            c.dot(u, v, colour)


def build(tile):
    c = _Canvas()
    frame = tile.frame % 4
    combo = tile.combo
    if combo in ("fall-splash", "fall-spray"):
        _splash(c, frame, spray=combo == "fall-spray")
    elif combo in ("surf", "cliff-surf"):
        _surf(c, tile, cliff=combo == "cliff-surf")
    elif combo in ("mouth", "confluence"):
        _current(c, tile, confluence=combo == "confluence")
    elif combo == "pier-posts":
        _posts(c, frame)
    elif combo == "wake":
        _wake(c, frame)
    elif combo in ("lamp-pool", "lighthouse-beam"):
        _light(c, tile, beam=combo == "lighthouse-beam")
    else:
        raise ValueError("Unknown combo: " + combo)
    c.draw(tile.side)
