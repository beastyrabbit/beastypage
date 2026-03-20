"""Pattern tile generation engine for textile-inspired cat sprite coloring.

Generates small repeating pattern tiles that replace the flat multiply color
in the experimental tint pipeline.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Literal, Optional, Tuple

import numpy as np

PatternType = Literal[
    "tartan",
    "gingham",
    "houndstooth",
    "pinstripe",
    "chevron",
    "polkadot",
    "argyle",
    "buffalo",
    "checkerboard",
    "windowpane",
    "diagonal",
    "basketweave",
    "flag",
]

SPRITE_SIZE = 50


@dataclass(frozen=True)
class PatternStripe:
    color: Tuple[int, int, int]
    width: int
    offset: int


@dataclass(frozen=True)
class PatternDefinition:
    type: PatternType
    tile_size: int
    background: Tuple[int, int, int]
    foreground: Optional[Tuple[int, int, int]] = None
    stripes: Tuple[PatternStripe, ...] = field(default_factory=tuple)
    spacing: int = 6

    @staticmethod
    def from_dict(d: dict) -> PatternDefinition:
        stripes = tuple(
            PatternStripe(
                color=tuple(s["color"]),  # type: ignore[arg-type]
                width=s.get("width", 1),
                offset=s.get("offset", 0),
            )
            for s in d.get("stripes", [])
        )
        bg = tuple(d.get("background", [128, 128, 128]))  # type: ignore[arg-type]
        fg_raw = d.get("foreground")
        fg = tuple(fg_raw) if fg_raw else None  # type: ignore[arg-type]
        return PatternDefinition(
            type=d["type"],
            tile_size=d.get("tileSize", 8),
            background=bg,
            foreground=fg,
            stripes=stripes,
            spacing=d.get("spacing", 6),
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _c(rgb: Tuple[int, int, int]) -> np.ndarray:
    """Convert 0-255 int tuple to 0-1 float32 array."""
    return np.array(rgb, dtype=np.float32) / 255.0


def _fg(defn: PatternDefinition) -> np.ndarray:
    return _c(defn.foreground or (255, 255, 255))


# ---------------------------------------------------------------------------
# Pattern generators — each returns (ts, ts, 3) float32 in [0, 1]
# ---------------------------------------------------------------------------


def _generate_tartan(defn: PatternDefinition) -> np.ndarray:
    """Intersecting H+V colored stripes on a background."""
    ts = defn.tile_size
    tile = np.full((ts, ts, 3), _c(defn.background), dtype=np.float32)

    for stripe in defn.stripes:
        sc = _c(stripe.color)
        for i in range(stripe.width):
            idx = (stripe.offset + i) % ts
            tile[idx, :] = 0.5 * tile[idx, :] + 0.5 * sc
            tile[:, idx] = 0.5 * tile[:, idx] + 0.5 * sc

    return np.clip(tile, 0.0, 1.0)


def _generate_gingham(defn: PatternDefinition) -> np.ndarray:
    """2-color check with blended intersections."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    blend = 0.5 * c1 + 0.5 * c2
    half = ts // 2

    tile = np.empty((ts, ts, 3), dtype=np.float32)
    tile[:half, :half] = c1
    tile[:half, half:] = blend
    tile[half:, :half] = blend
    tile[half:, half:] = c2
    return tile


def _generate_houndstooth(defn: PatternDefinition) -> np.ndarray:
    """Classic houndstooth / dogtooth check.

    Uses a staircase mask: within each half-cell the foreground forms a
    stepped diagonal that creates the signature jagged-tooth edge when tiled.
    """
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    half = max(ts // 2, 2)
    mask = np.zeros((ts, ts), dtype=bool)

    for y in range(ts):
        for x in range(ts):
            # Map to position within the 2x2 super-cell
            cy, cx = y % half, x % half
            qy, qx = y // half, x // half
            quadrant = (qy % 2) * 2 + (qx % 2)  # 0=TL, 1=TR, 2=BL, 3=BR

            # Staircase: pixel is "dark" if its column (stepped) <= its row
            # Using integer division to create the stair steps
            step = max(half // 4, 1)
            stair_x = (cx // step) * step
            is_dark = stair_x <= cy

            if quadrant == 0:
                # Top-left: dark staircase
                mask[y, x] = is_dark
            elif quadrant == 3:
                # Bottom-right: dark staircase (same)
                mask[y, x] = is_dark
            elif quadrant == 1:
                # Top-right: inverted (light staircase = dark background)
                mask[y, x] = not is_dark
            else:
                # Bottom-left: inverted
                mask[y, x] = not is_dark

    return np.where(mask[..., None], c2, c1)


def _generate_pinstripe(defn: PatternDefinition) -> np.ndarray:
    """Thin vertical lines on solid background."""
    ts = defn.tile_size
    tile = np.full((ts, ts, 3), _c(defn.background), dtype=np.float32)
    fg = _fg(defn)
    spacing = max(defn.spacing, 2)

    col = 0
    while col < ts:
        tile[:, col] = fg
        col += spacing
    return tile


def _generate_chevron(defn: PatternDefinition) -> np.ndarray:
    """V-shaped zigzag rows (herringbone).

    Always generates at SPRITE_SIZE so chevrons run continuously
    without tiling seams. The spacing parameter controls zigzag width.
    """
    size = SPRITE_SIZE
    bg, fg = _c(defn.background), _fg(defn)
    tile = np.full((size, size, 3), bg, dtype=np.float32)
    stripe_w = max(defn.spacing, 2)

    for y in range(size):
        for x in range(size):
            half = size // 2
            if x < half:
                diag = (y + x) % stripe_w
            else:
                diag = (y + (size - 1 - x)) % stripe_w
            if diag < stripe_w // 2:
                tile[y, x] = fg
    return tile


def _generate_polkadot(defn: PatternDefinition) -> np.ndarray:
    """Circles on solid background."""
    ts = defn.tile_size
    bg, fg = _c(defn.background), _fg(defn)
    tile = np.full((ts, ts, 3), bg, dtype=np.float32)

    # Dot centered in tile, radius ~ 1/3 of tile size
    cx, cy = ts / 2.0, ts / 2.0
    radius = ts / 3.0

    for y in range(ts):
        for x in range(ts):
            dist = math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2)
            if dist <= radius:
                # Slight anti-alias at edge
                if dist > radius - 0.8:
                    t = (radius - dist) / 0.8
                    tile[y, x] = (1 - t) * bg + t * fg
                else:
                    tile[y, x] = fg
    return tile


def _generate_argyle(defn: PatternDefinition) -> np.ndarray:
    """Diamond lattice with thin diagonal lines."""
    ts = defn.tile_size
    bg, fg = _c(defn.background), _fg(defn)
    tile = np.full((ts, ts, 3), bg, dtype=np.float32)

    cx, cy = ts / 2.0, ts / 2.0
    for y in range(ts):
        for x in range(ts):
            # Diamond: |x - cx| / cx + |y - cy| / cy <= 1
            dx = abs(x + 0.5 - cx) / cx
            dy = abs(y + 0.5 - cy) / cy
            if dx + dy <= 1.0:
                tile[y, x] = fg

    # Thin diagonal lines (from stripes if provided, else subtle)
    if defn.stripes:
        for stripe in defn.stripes:
            sc = _c(stripe.color)
            for y in range(ts):
                for x in range(ts):
                    if (x + y) % ts == 0 or (x - y) % ts == 0:
                        tile[y, x] = 0.5 * tile[y, x] + 0.5 * sc
    else:
        line_color = 0.5 * bg + 0.5 * fg
        for y in range(ts):
            for x in range(ts):
                if (x + y) % ts == 0 or (x - y) % ts == 0:
                    tile[y, x] = line_color

    return np.clip(tile, 0.0, 1.0)


def _generate_buffalo(defn: PatternDefinition) -> np.ndarray:
    """Big bold two-color blocks (larger/chunkier than gingham)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    # Darker blend for intersections
    dark = 0.3 * c1 + 0.15 * c2
    half = ts // 2

    tile = np.empty((ts, ts, 3), dtype=np.float32)
    tile[:half, :half] = c1
    tile[:half, half:] = c2
    tile[half:, :half] = c2
    tile[half:, half:] = dark
    return np.clip(tile, 0.0, 1.0)


def _generate_checkerboard(defn: PatternDefinition) -> np.ndarray:
    """Alternating squares."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    half = max(ts // 2, 1)

    tile = np.empty((ts, ts, 3), dtype=np.float32)
    for y in range(ts):
        for x in range(ts):
            if ((y // half) + (x // half)) % 2 == 0:
                tile[y, x] = c1
            else:
                tile[y, x] = c2
    return tile


def _generate_windowpane(defn: PatternDefinition) -> np.ndarray:
    """Thin grid lines on solid background."""
    ts = defn.tile_size
    bg, fg = _c(defn.background), _fg(defn)
    tile = np.full((ts, ts, 3), bg, dtype=np.float32)

    # Draw grid lines at edges of tile (so they form a continuous grid when tiled)
    tile[0, :] = fg
    tile[:, 0] = fg
    return tile


def _generate_diagonal(defn: PatternDefinition) -> np.ndarray:
    """Angled stripes (regimental tie / barbershop).

    Always generates at SPRITE_SIZE so diagonal lines run continuously
    across the full sprite without tiling seams. The spacing parameter
    controls stripe width/density.
    """
    size = SPRITE_SIZE
    bg, fg = _c(defn.background), _fg(defn)
    tile = np.full((size, size, 3), bg, dtype=np.float32)
    stripe_w = max(defn.spacing, 2)

    for y in range(size):
        for x in range(size):
            if (x + y) % (stripe_w * 2) < stripe_w:
                tile[y, x] = fg
    return tile


def _generate_basketweave(defn: PatternDefinition) -> np.ndarray:
    """Alternating horizontal/vertical rectangular blocks."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    half = max(ts // 2, 1)

    tile = np.empty((ts, ts, 3), dtype=np.float32)
    for y in range(ts):
        for x in range(ts):
            by, bx = y // half, x // half
            if (by + bx) % 2 == 0:
                # Horizontal block — slight gradient left-to-right
                t = (x % half) / max(half - 1, 1) * 0.15
                tile[y, x] = (1 - t) * c1 + t * c2
            else:
                # Vertical block — slight gradient top-to-bottom
                t = (y % half) / max(half - 1, 1) * 0.15
                tile[y, x] = (1 - t) * c2 + t * c1
    return np.clip(tile, 0.0, 1.0)


def _generate_flag(defn: PatternDefinition) -> np.ndarray:
    """Horizontal stripes from the stripes list (for flag patterns).

    Each stripe uses its `width` as a relative proportion of the tile height.
    If no stripes provided, falls back to background/foreground halves.
    """
    ts = defn.tile_size
    tile = np.full((ts, ts, 3), _c(defn.background), dtype=np.float32)

    if not defn.stripes:
        fg = _fg(defn)
        half = ts // 2
        tile[:half] = _c(defn.background)
        tile[half:] = fg
        return tile

    # Distribute stripe heights proportionally
    total_weight = sum(s.width for s in defn.stripes)
    y = 0
    for stripe in defn.stripes:
        h = max(round(ts * stripe.width / total_weight), 1)
        end = min(y + h, ts)
        tile[y:end, :] = _c(stripe.color)
        y = end
        if y >= ts:
            break

    return tile


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_GENERATORS = {
    "tartan": _generate_tartan,
    "gingham": _generate_gingham,
    "houndstooth": _generate_houndstooth,
    "pinstripe": _generate_pinstripe,
    "chevron": _generate_chevron,
    "polkadot": _generate_polkadot,
    "argyle": _generate_argyle,
    "buffalo": _generate_buffalo,
    "checkerboard": _generate_checkerboard,
    "windowpane": _generate_windowpane,
    "diagonal": _generate_diagonal,
    "basketweave": _generate_basketweave,
    "flag": _generate_flag,
}


@lru_cache(maxsize=256)
def generate_pattern_tile(
    defn: PatternDefinition,
    target_w: int = SPRITE_SIZE,
    target_h: int = SPRITE_SIZE,
) -> np.ndarray:
    """Generate a pattern tile and repeat it to fill the target size.

    Returns a float32 RGB array shape (target_h, target_w, 3) in range [0, 1].
    """
    generator = _GENERATORS.get(defn.type)
    if generator is None:
        raise ValueError(f"Unknown pattern type: {defn.type}")

    tile = generator(defn)
    ts_h, ts_w = tile.shape[:2]

    reps_y = (target_h + ts_h - 1) // ts_h
    reps_x = (target_w + ts_w - 1) // ts_w
    tiled = np.tile(tile, (reps_y, reps_x, 1))

    return tiled[:target_h, :target_w, :]
