"""Two front-facing green frogs on notched lily pads, blinking and croaking."""

import tilekit as kit

PALETTE = kit.ramp("#61b84f", "#31734a", "#d5d98b", "waterLight") + ["#234634"]
COLORS = {"D": "#234634", "G": "#61b84f", "g": "#31734a",
          "Y": "#d5d98b", "r": "waterLight"}


def _stamp(rows, x, z, y=0):
    for symbol in set("".join(rows)) - {"."}:
        verts, faces = [], []
        for row, line in enumerate(rows):
            for col, value in enumerate(line):
                if value != symbol:
                    continue
                a, b = (x + col) / 16, (z + len(rows) - row - 1) / 16
                n = len(verts)
                verts.extend([(a, y, b), (a + 1 / 16, y, b),
                              (a + 1 / 16, y, b + 1 / 16), (a, y, b + 1 / 16)])
                faces.append((n, n + 1, n + 2, n + 3))
        kit.mesh(verts, faces, kit.mat(COLORS[symbol]), name="frog-pixels")


def build(tile):
    frame = int(tile.t * 4) % 4
    bob = 1 if frame == 1 else 0
    _stamp(["...rrrrrrrr...", "rr..........rr", "...rrrrrrrr..."], 1, 1, 0.25)
    # The transparent wedge at right is the lily pad's notch, not blue paint.
    pad = ["...DDDDDDD...", ".DDGGGGGGGDD.", "DGGGGGGGGD...",
           "DggGGGGGGGGD.", ".DDggggggDD..", "...DDDDDD...."]
    _stamp([row[::-1] for row in pad] if tile.alt else pad, 1, 2 + bob, 0.1)
    face = [
        "..DDD.DDD..",
        ".DGYDDYGD..",
        ".DGDGGDGD..",
        ".DGGGGGGGD.",
        "..DDDDDDD..",
        ".DgGYYYgGD.",
        "DggGYYYgggD",
        "DGDggggDGGD",
        ".DDDDDDDDD.",
    ]
    if tile.alt:
        # A three-quarter pose: head to the right, a broad folded leg at left.
        face = [
            ".....DDD.DDD.",
            "....DGYDDYGD.",
            "....DGDGGDGD.",
            "...DGGGGGGGDD",
            "..DgGGDDDDD..",
            ".DggGYYYYGD..",
            "DgggGYYYYgD..",
            "DGGDggggDGGD.",
            ".DDD...DDDD..",
        ]
        if frame == 2:
            face[1] = "....DGGDDGGD."
            face[2] = "....DDDGGDDD."
        if frame == 0:
            face[5] = ".DggYYYYYYD.."
            face[6] = "DgggYYYYYYD.."
        _stamp(face, 1, 4 + bob, -0.06)
        return
    if frame == 3:
        face[1] = ".DGGDDGGD.."
        face[2] = ".DDDGGDDD.."
    if frame == 1:
        face[5] = ".DgYYYYYGD."
        face[6] = "DggYYYYYggD"
        face[7] = "DGDgYYYDGGD"
    _stamp(face, 2, 4 + bob, -0.06)
