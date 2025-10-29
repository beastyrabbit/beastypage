from __future__ import annotations

from typing import Tuple

Colour = Tuple[int, int, int, int]

# Approximate RGBA mappings for the most common Lifegen colour names.
COLOUR_TABLE: dict[str, Colour] = {
    "BLACK": (18, 18, 18, 255),
    "WHITE": (240, 240, 240, 255),
    "GREY": (130, 134, 139, 255),
    "BLUE": (78, 120, 188, 255),
    "DARKBROWN": (66, 40, 26, 255),
    "BROWN": (88, 54, 30, 255),
    "LIGHTBROWN": (132, 92, 58, 255),
    "RED": (158, 62, 48, 255),
    "GINGER": (196, 106, 42, 255),
    "CREAM": (228, 206, 174, 255),
    "TAN": (200, 170, 124, 255),
    "WHITEPATCH": (238, 232, 220, 255),
    "SUNLITICE": (132, 178, 224, 255),
    "GREEN": (102, 170, 84, 255),
    "GOLD": (232, 182, 72, 255),
    "HAZEL": (188, 140, 78, 255),
    "AMBER": (216, 158, 68, 255),
    "SILVER": (206, 214, 228, 255),
    "CYAN": (110, 204, 214, 255),
    "PURPLE": (148, 100, 186, 255),
    "PINK": (220, 124, 162, 255),
}


def resolve_colour(name: str | None, default: Colour = (180, 180, 180, 255)) -> Colour:
    if not name:
        return default
    upper = name.strip().upper()
    if upper in COLOUR_TABLE:
        return COLOUR_TABLE[upper]
    # Fallback: derive RGB by hashing the name so successive calls are stable.
    seed = abs(hash(upper))
    r = 80 + (seed & 0x7F)
    g = 80 + ((seed >> 7) & 0x7F)
    b = 80 + ((seed >> 14) & 0x7F)
    return (r, g, b, 255)
