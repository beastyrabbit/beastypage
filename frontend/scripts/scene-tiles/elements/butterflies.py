"""Two jewel-coloured butterflies flutter above a few low wildflowers."""

import tilekit as kit

PALETTE = kit.ramp("#e9983f", "#49bdeb", "petal1", "grass") + ["#2c3042", "#fff0ae"]
COLOURS = {"K": "#2c3042", "O": PALETTE[1], "o": PALETTE[0],
           "B": PALETTE[4], "b": PALETTE[3], "P": PALETTE[7],
           "p": PALETTE[6], "G": PALETTE[10], "g": PALETTE[9],
           "Y": "#fff0ae"}


def _stamp(pixels, rows, x, y, translation=None):
    for dy, row in enumerate(rows):
        for dx, colour in enumerate(row):
            if colour != ".":
                pixels[x + dx, y + dy] = translation.get(colour, colour) if translation else colour


def _draw(pixels):
    for key, colour in COLOURS.items():
        verts, faces = [], []
        for (x, y), value in pixels.items():
            if value != key:
                continue
            i = len(verts)
            verts.extend([(x / 16, 0, (15 - y) / 16),
                          ((x + 1) / 16, 0, (15 - y) / 16),
                          ((x + 1) / 16, 0, (16 - y) / 16),
                          (x / 16, 0, (16 - y) / 16)])
            faces.append((i, i + 1, i + 2, i + 3))
        if faces:
            kit.mesh(verts, faces, kit.mat(colour), name="butterfly-" + key)


def _butterfly(pixels, x, y, phase, blue=False):
    wings = [
        [".K...K.", "KOK.KOK", "KOoKoOK", ".oKKKo.", ".KoKoK.", "..K.K.."],
        ["..K.K..", ".KOKOK.", ".KoKoK.", "..KKK..", "..oKo..", "..K.K.."],
        ["..K.K..", "..OKK..", "..oKK..", "...KK..", "..oKK..", "...K..."],
        ["..K.K..", ".KOKOK.", ".KoKoK.", "..KKK..", "..oKo..", "..K.K.."],
    ]
    translation = {"O": "B", "o": "b"} if blue else None
    _stamp(pixels, wings[phase], x, y, translation)


def build(tile):
    frame = int(tile.t * 4) % 4
    pixels = {}
    _stamp(pixels, ["..P.......P..", ".PYP..P..PYP.", "..G..PYP..G..",
                    ".gGg..G..gGg."], 1, 11)
    drift = (0, -1, 0, 1)[frame]
    _butterfly(pixels, 1, 2 + drift, frame, bool(tile.alt))
    _butterfly(pixels, 8, 4 - drift, (frame + 2) % 4, not bool(tile.alt))
    _draw(pixels)
