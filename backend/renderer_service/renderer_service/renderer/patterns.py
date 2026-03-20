"""Pattern tile generation engine for textile-inspired cat sprite coloring.

Generates small repeating pattern tiles that replace the flat multiply color
in the experimental tint pipeline.
"""

from __future__ import annotations

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
        if "type" not in d:
            raise ValueError(f"Pattern definition missing 'type': {d!r}")

        ptype = d["type"]
        if ptype not in _GENERATORS:
            raise ValueError(
                f"Unknown pattern type '{ptype}'. "
                f"Valid: {', '.join(sorted(_GENERATORS))}"
            )

        tile_size = d.get("tileSize", 8)
        if not isinstance(tile_size, int) or tile_size < 1:
            raise ValueError(f"tileSize must be a positive int, got: {tile_size!r}")
        if tile_size > 256:
            raise ValueError(f"tileSize {tile_size} exceeds maximum of 256")

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
            type=ptype,
            tile_size=tile_size,
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
    step = max(half // 4, 1)

    yy, xx = np.mgrid[:ts, :ts]

    # Position within each half-cell
    cy = yy % half
    cx = xx % half

    # Quadrant index: 0=TL, 1=TR, 2=BL, 3=BR
    quadrant = (yy // half % 2) * 2 + (xx // half % 2)

    # Staircase: pixel is "dark" when its stepped column <= its row
    is_dark = (cx // step) * step <= cy

    # TL (0) and BR (3) use the staircase directly; TR (1) and BL (2) invert it
    is_inverted = (quadrant == 1) | (quadrant == 2)
    mask = np.where(is_inverted, ~is_dark, is_dark)

    return np.where(mask[..., None], c2, c1)


def _generate_pinstripe(defn: PatternDefinition) -> np.ndarray:
    """Thin vertical lines on solid background."""
    ts = defn.tile_size
    tile = np.full((ts, ts, 3), _c(defn.background), dtype=np.float32)
    spacing = max(defn.spacing, 2)
    tile[:, ::spacing] = _fg(defn)
    return tile


def _generate_chevron(defn: PatternDefinition) -> np.ndarray:
    """V-shaped zigzag rows (herringbone).

    Always generates at SPRITE_SIZE so chevrons run continuously
    without tiling seams. The spacing parameter controls zigzag width.
    """
    size = SPRITE_SIZE
    bg, fg = _c(defn.background), _fg(defn)
    stripe_w = max(defn.spacing, 2)
    half = size // 2

    yy, xx = np.mgrid[:size, :size]
    # Mirror x around center to form V-shape
    mirrored_x = np.where(xx < half, xx, size - 1 - xx)
    mask = (yy + mirrored_x) % stripe_w < stripe_w // 2

    tile = np.full((size, size, 3), bg, dtype=np.float32)
    tile[mask] = fg
    return tile


def _generate_polkadot(defn: PatternDefinition) -> np.ndarray:
    """Circles on solid background with anti-aliased edges."""
    ts = defn.tile_size
    bg, fg = _c(defn.background), _fg(defn)
    radius = ts / 3.0

    yy, xx = np.mgrid[:ts, :ts]
    dist = np.sqrt((xx + 0.5 - ts / 2.0) ** 2 + (yy + 0.5 - ts / 2.0) ** 2)

    # Anti-alias blend factor: 1.0 inside, smooth falloff in the last 0.8px
    t = np.clip((radius - dist) / 0.8, 0.0, 1.0)

    tile = (1 - t)[..., None] * bg + t[..., None] * fg
    return tile.astype(np.float32)


def _generate_argyle(defn: PatternDefinition) -> np.ndarray:
    """Diamond lattice with thin diagonal lines."""
    ts = defn.tile_size
    bg, fg = _c(defn.background), _fg(defn)
    cx, cy = ts / 2.0, ts / 2.0

    yy, xx = np.mgrid[:ts, :ts]
    # Diamond mask: |x - cx| / cx + |y - cy| / cy <= 1
    diamond = (np.abs(xx + 0.5 - cx) / cx + np.abs(yy + 0.5 - cy) / cy) <= 1.0
    tile = np.where(diamond[..., None], fg, bg)

    # Thin diagonal lines blended at 50%
    line_mask = ((xx + yy) % ts == 0) | ((xx - yy) % ts == 0)
    if defn.stripes:
        for stripe in defn.stripes:
            sc = _c(stripe.color)
            tile[line_mask] = 0.5 * tile[line_mask] + 0.5 * sc
    else:
        line_color = 0.5 * bg + 0.5 * fg
        tile[line_mask] = line_color

    return np.clip(tile, 0.0, 1.0).astype(np.float32)


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

    yy, xx = np.mgrid[:ts, :ts]
    mask = ((yy // half) + (xx // half)) % 2 == 0
    return np.where(mask[..., None], c1, c2).astype(np.float32)


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
    stripe_w = max(defn.spacing, 2)

    yy, xx = np.mgrid[:size, :size]
    mask = (xx + yy) % (stripe_w * 2) < stripe_w

    tile = np.full((size, size, 3), bg, dtype=np.float32)
    tile[mask] = fg
    return tile


def _generate_basketweave(defn: PatternDefinition) -> np.ndarray:
    """Alternating horizontal/vertical rectangular blocks."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    half = max(ts // 2, 1)

    yy, xx = np.mgrid[:ts, :ts]
    is_horiz = ((yy // half) + (xx // half)) % 2 == 0

    # Gradient factor: 0..0.15 across each half-cell
    t_horiz = ((xx % half) / max(half - 1, 1) * 0.15)[..., None]
    t_vert = ((yy % half) / max(half - 1, 1) * 0.15)[..., None]

    horiz_block = (1 - t_horiz) * c1 + t_horiz * c2
    vert_block = (1 - t_vert) * c2 + t_vert * c1

    tile = np.where(is_horiz[..., None], horiz_block, vert_block)
    return np.clip(tile, 0.0, 1.0).astype(np.float32)


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
