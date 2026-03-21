"""Pattern tile generation engine for textile-inspired cat sprite coloring.

Generates small repeating pattern tiles that replace the flat multiply color
in the experimental tint pipeline.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Literal, Optional, Tuple

import numpy as np

logger = logging.getLogger("renderer.patterns")

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
    # SVG emblem flags
    "flag_canada",
    "flag_switzerland",
    "flag_uk",
    "flag_turkey",
    "flag_israel",
    "flag_scotland",
    "flag_jamaica",
    "flag_china",
    "flag_australia",
    # Phase 1: World patterns
    "seigaiha",
    "asanoha",
    "shippo",
    "islamic_star",
    "fleur_de_lis",
    "paisley",
    "greek_key",
    "art_deco_fan",
    "uroko",
    "eight_point_star",
    # Phase 2: East Asian + African + Indian
    "kikko",
    "sayagata",
    "chinese_lattice",
    "chinese_coin",
    "ruyi_cloud",
    "dancheong",
    "batik_kawung",
    "batik_parang",
    "karakusa",
    "kolam",
    "kente",
    "mudcloth",
    "adinkra",
    "shweshwe",
    # Phase 2b: Missing Japanese + famous + medieval + continental
    "same_komon",
    "kanoko",
    "hishi",
    "tachiwaki",
    "bishamon_kikko",
    "quatrefoil",
    "herringbone",
    "trellis",
    "damask",
    "camouflage",
    "chainmail",
    "gothic_trefoil",
    "celtic_knot",
    "nordic_snowflake",
    "nordic_diamond",
    "native_step",
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

        if ptype in ("chevron", "diagonal") and tile_size != SPRITE_SIZE:
            logger.warning(
                "tileSize=%d ignored for '%s' pattern; use 'spacing' to control density",
                tile_size,
                ptype,
            )

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


def _svg_rgb(rgb: Tuple[int, int, int]) -> str:
    """Format an RGB tuple as an SVG color string."""
    return f"rgb({rgb[0]},{rgb[1]},{rgb[2]})"


def _svg_to_array(svg_str: str, width: int, height: int) -> np.ndarray:
    """Rasterize an SVG string to a float32 (H, W, 3) array in [0, 1]."""
    import io

    import cairosvg
    from PIL import Image

    try:
        png = cairosvg.svg2png(
            bytestring=svg_str.encode("utf-8"),
            output_width=width,
            output_height=height,
        )
    except Exception:
        logger.exception("cairosvg rasterisation failed; returning grey tile")
        return np.full((height, width, 3), 0.5, dtype=np.float32)
    img = Image.open(io.BytesIO(png)).convert("RGB")
    return np.asarray(img, dtype=np.float32) / 255.0


# ---------------------------------------------------------------------------
# Pattern generators — each returns (h, w, 3) float32 in [0, 1]
# Most use tile_size; chevron and diagonal use SPRITE_SIZE
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
    """Two-color blocks with dark intersection (more contrast than gingham)."""
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
    n_stripes = len(defn.stripes)
    y = 0
    for i, stripe in enumerate(defn.stripes):
        if i == n_stripes - 1:
            h = ts - y  # absorb rounding remainder into last stripe
        else:
            h = max(round(ts * stripe.width / total_weight), 1)
        end = min(y + h, ts)
        tile[y:end, :] = _c(stripe.color)
        y = end
        if y >= ts:
            break

    return tile


# ---------------------------------------------------------------------------
# SVG emblem flags — full flag rendered as SVG with emblem overlay
# ---------------------------------------------------------------------------


def _flag_svg(viewbox: str, *paths: str) -> str:
    """Build an SVG string with viewBox scaling (stretched to fill tile)."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}"'
        f' preserveAspectRatio="none">' + "".join(paths) + "</svg>"
    )


# SVG paths sourced from lipis/flag-icons (MIT license).
# Flag designs are public domain (national symbols).


def _generate_flag_canada(defn: PatternDefinition) -> np.ndarray:
    """Canadian flag — red/white/red with maple leaf."""
    svg = _flag_svg(
        "0 0 640 480",
        '<path fill="#fff" d="M150.1 0h339.7v480H150z"/>',
        '<path fill="#d52b1e" d="M-19.7 0h169.8v480H-19.7zm509.5 0h169.8'
        "v480H489.9zM201 232l-13.3 4.4 61.4 54c4.7 13.7-1.6 17.8-5.6 25l"
        "66.6-8.4-1.6 67 13.9-.3-3.1-66.6 66.7 8c-4.1-8.7-7.8-13.3-4-27.2l"
        "61.3-51-10.7-4c-8.8-6.8 3.8-32.6 5.6-48.9 0 0-35.7 12.3-38 5.8l"
        "-9.2-17.5-32.6 35.8c-3.5.9-5-.5-5.9-3.5l15-74.8-23.8 13.4q-3.2"
        " 1.3-5.2-2.2l-23-46-23.6 47.8q-2.8 2.5-5 .7L264 130.8l13.7 74.1"
        "c-1.1 3-3.7 3.8-6.7 2.2l-31.2-35.3c-4 6.5-6.8 17.1-12.2 19.5s"
        '-23.5-4.5-35.6-7c4.2 14.8 17 39.6 9 47.7"/>',
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_flag_switzerland(defn: PatternDefinition) -> np.ndarray:
    """Swiss flag — red with white cross."""
    svg = _flag_svg(
        "0 0 640 480",
        '<g fill-rule="evenodd" stroke-width="1pt">'
        '<path fill="red" d="M0 0h640v480H0z"/>'
        '<g fill="#fff">'
        '<path d="M170 195h300v90H170z"/>'
        '<path d="M275 90h90v300h-90z"/>'
        "</g></g>",
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_flag_uk(defn: PatternDefinition) -> np.ndarray:
    """United Kingdom — Union Jack."""
    svg = _flag_svg(
        "0 0 512 512",
        '<path fill="#012169" d="M0 0h512v512H0z"/>',
        '<path fill="#FFF" d="M512 0v64L322 256l190 187v69h-67L254 324'
        ' 68 512H0v-68l186-187L0 74V0h62l192 188L440 0z"/>',
        '<path fill="#C8102E" d="m184 324 11 34L42 512H0v-3zm124-12'
        " 54 8 150 147v45zM512 0 320 196l-4-44L466 0zM0 1l193"
        ' 189-59-8L0 49z"/>',
        '<path fill="#FFF" d="M176 0v512h160V0zM0 176v160h512V176z"/>',
        '<path fill="#C8102E" d="M0 208v96h512v-96zM208 0v512h96V0z"/>',
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_flag_turkey(defn: PatternDefinition) -> np.ndarray:
    """Turkish flag — red with white crescent and star."""
    svg = _flag_svg(
        "0 0 640 480",
        '<g fill-rule="evenodd">'
        '<path fill="#e30a17" d="M0 0h640v480H0z"/>'
        '<path fill="#fff" d="M407 247.5c0 66.2-54.6 119.9-122 119.9s-122'
        '-53.7-122-120 54.6-119.8 122-119.8 122 53.7 122 119.9"/>'
        '<path fill="#e30a17" d="M413 247.5c0 53-43.6 95.9-97.5 95.9s-97.6'
        '-43-97.6-96 43.7-95.8 97.6-95.8 97.6 42.9 97.6 95.9z"/>'
        '<path fill="#fff" d="m430.7 191.5-1 44.3-41.3 11.2 40.8 14.5-1'
        " 40.7 26.5-31.8 40.2 14-23.2-34.1 28.3-33.9-43.5 12"
        '-25.8-37z"/>'
        "</g>",
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_flag_israel(defn: PatternDefinition) -> np.ndarray:
    """Israeli flag — white with blue stripes and Star of David."""
    svg = _flag_svg(
        "0 0 640 480",
        "<defs>"
        '<clipPath id="il-a">'
        '<path fill-opacity=".7" d="M-87.6 0H595v512H-87.6z"/>'
        "</clipPath></defs>"
        '<g fill-rule="evenodd" clip-path="url(#il-a)"'
        ' transform="translate(82.1)scale(.94)">'
        '<path fill="#fff" d="M619.4 512H-112V0h731.4z"/>'
        '<path fill="#0038b8" d="M619.4 115.2H-112V48h731.4zm0 350.5H-112'
        "v-67.2h731.4zm-483-275 110.1 191.6L359 191.6z"
        '"/>'
        '<path fill="#fff" d="m225.8 317.8 20.9 35.5 21.4-35.3z"/>'
        '<path fill="#0038b8" d="M136 320.6 246.2 129l112.4 190.8z"/>'
        '<path fill="#fff" d="m225.8 191.6 20.9-35.5 21.4 35.4zM182 271.1l'
        "-21.7 36 41-.1-19.3-36zm-21.3-66.5 41.2.3-19.8 36.3zm151.2 67"
        " 20.9 35.5-41.7-.5zm20.5-67-41.2.3 19.8 36.3zm-114.3 0L189.7"
        ' 256l28.8 50.3 52.8 1.2 32-51.5-29.6-52z"/>'
        "</g>",
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_flag_scotland(defn: PatternDefinition) -> np.ndarray:
    """Scottish Saltire — white diagonal cross on blue."""
    svg = _flag_svg(
        "0 0 512 512",
        '<path fill="#0065bd" d="M0 0h512v512H0z"/>',
        '<path stroke="#fff" stroke-width=".6"'
        ' d="m0 0 5 3M0 3l5-3"'
        ' transform="scale(102.4 170.66667)"/>',
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_flag_jamaica(defn: PatternDefinition) -> np.ndarray:
    """Jamaican flag — diagonal gold cross on black and green."""
    svg = _flag_svg(
        "0 0 512 512",
        '<g fill-rule="evenodd">'
        '<path fill="#000001" d="m0 0 256 256L0 512zm512 0L256 256l256 256z"/>'
        '<path fill="#090" d="m0 0 256 256L512 0zm0 512 256-256 256 256z"/>'
        '<path fill="#fc0" d="M512 0h-47.7L0 464.3V512h47.7L512 47.7z"/>'
        '<path fill="#fc0" d="M0 0v47.7L464.3 512H512v-47.7L47.7 0z"/>'
        "</g>",
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_flag_china(defn: PatternDefinition) -> np.ndarray:
    """Chinese flag — five yellow stars on red."""
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg"'
        ' xmlns:xlink="http://www.w3.org/1999/xlink"'
        ' viewBox="0 0 512 512">'
        "<defs>"
        '<path id="s" fill="#ff0" d="M1-.3-.7.8 0-1 .6.8-1-.3z"/>'
        "</defs>"
        '<path fill="#ee1c25" d="M0 0h512v512H0z"/>'
        '<use xlink:href="#s" transform="translate(128 128)scale(76.8)"/>'
        '<use xlink:href="#s" transform="rotate(-121 142.6 -47)'
        'scale(25.5827)"/>'
        '<use xlink:href="#s" transform="rotate(-98.1 198 -82)'
        'scale(25.6)"/>'
        '<use xlink:href="#s" transform="rotate(-74 272.4 -114)'
        'scale(25.6137)"/>'
        '<use xlink:href="#s" transform="matrix(16 -19.968'
        ' 19.968 16 256 230.4)"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_flag_australia(defn: PatternDefinition) -> np.ndarray:
    """Australian flag — Union Jack canton + Southern Cross + Commonwealth Star."""
    svg = _flag_svg(
        "0 0 512 512",
        '<path fill="#00008B" d="M0 0h512v512H0z"/>',
        '<path fill="#fff" d="M256 0v32l-95 96 95 93.5V256h-33.5L127'
        " 162l-93 94H0v-34l93-93.5L0 37V0h31l96 94 93-94z"
        '"/>',
        '<path fill="red" d="m92 162 5.5 17L21 256H0v-1.5zm62-6 27 4'
        " 75 73.5V256zM256 0l-96 98-2-22 75-76zM0 .5 96.5 95 67 91 0"
        ' 24.5z"/>',
        '<path fill="#fff" d="M88 0v256h80V0zM0 88v80h256V88z"/>',
        '<path fill="red" d="M0 104v48h256v-48zM104 0v256h48V0z"/>',
        '<path fill="#fff" d="m202 402.8-45.8 5.4 4.6 45.9-32.8-32.4'
        "-33 32.2 4.9-45.9-45.8-5.8L93 377.4 69 338l43.6 15 15.8"
        "-43.4 15.5 43.5 43.7-14.7-24.3 39.2 38.8 25.1Zm222.7 8"
        "-20.5 2.6 2.2 20.5-14.8-14.4-14.7 14.5 2-20.5-20.5-2.4"
        " 17.3-11.2-10.9-17.5 19.6 6.5 6.9-19.5 7.1 19.4 19.5-6.7"
        "-10.7 17.6zM415 293.6l2.7-13-9.8-9 13.2-1.5 5.5-12.1 5.5"
        " 12.1 13.2 1.5-9.8 9 2.7 13-11.6-6.6zm-84.1-60-20.3 2.2"
        " 1.8 20.3-14.4-14.5-14.8 14.1 2.4-20.3-20.2-2.7 17.3-10.8"
        "-10.5-17.5 19.3 6.8 7.2-19.1 6.7 19.3 19.4-6.3-10.9 17.3z"
        "m175.8-32.8-20.9 2.7 2.3 20.9-15.1-14.7-15 14.8 2.1-21"
        "-20.9-2.4 17.7-11.5-11.1-17.9 20 6.7 7-19.8 7.2 19.8 19.9"
        "-6.9-11 18zm-82.1-83.5-20.7 2.3 1.9 20.8-14.7-14.8L376"
        " 140l2.4-20.7-20.7-2.8 17.7-11-10.7-17.9 19.7 6.9 7.3"
        '-19.5 6.8 19.7 19.8-6.5-11.1 17.6z"/>',
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


# ---------------------------------------------------------------------------
# Phase 1 — numpy geometric patterns
# ---------------------------------------------------------------------------


def _generate_uroko(defn: PatternDefinition) -> np.ndarray:
    """Alternating up/down triangles (Japanese fish-scale motif)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    half = max(ts // 2, 2)

    yy, xx = np.mgrid[:ts, :ts]
    cy = (yy % half).astype(np.float32) / half
    cx = (xx % half).astype(np.float32) / half

    # Triangle: y < 1 - |2x - 1|  (points upward)
    up_tri = cy < (1.0 - np.abs(2.0 * cx - 1.0))

    cell_row = yy // half
    cell_col = xx // half
    is_flipped = (cell_row + cell_col) % 2 == 1
    mask = np.where(is_flipped, ~up_tri, up_tri)

    return np.where(mask[..., None], c2, c1)


def _generate_eight_point_star(defn: PatternDefinition) -> np.ndarray:
    """Two overlapping rotated squares forming an 8-pointed star."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    center = ts / 2.0

    yy, xx = np.mgrid[:ts, :ts]
    dx = np.abs(xx + 0.5 - center)
    dy = np.abs(yy + 0.5 - center)

    # Smaller axis-aligned square so diamond points stick out visibly
    side = ts * 0.22
    square1 = (dx <= side) & (dy <= side)

    # Larger diamond for prominent star points
    diamond_r = ts * 0.4
    square2 = (dx + dy) <= diamond_r

    mask = square1 | square2
    return np.where(mask[..., None], c2, c1)


# ---------------------------------------------------------------------------
# Phase 2 — numpy geometric patterns
# ---------------------------------------------------------------------------


def _generate_kente(defn: PatternDefinition) -> np.ndarray:
    """Alternating horizontal/vertical colored stripe blocks (Ghanaian kente)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    blend = 0.5 * c1 + 0.5 * c2
    half = max(ts // 2, 2)

    yy, xx = np.mgrid[:ts, :ts]
    block = ((yy // half) + (xx // half)) % 2

    # Stripe width: 2-3 pixels per stripe for visibility
    sw = max(half // 3, 2)

    tile = np.empty((ts, ts, 3), dtype=np.float32)
    # Block 0: horizontal stripes (c1/c2 alternating)
    h_stripe = (yy % sw) < (sw // 2)
    # Block 1: vertical stripes (c1/c2 alternating)
    v_stripe = (xx % sw) < (sw // 2)

    is_b0 = block == 0
    is_b1 = block == 1
    tile[is_b0 & h_stripe] = c2
    tile[is_b0 & ~h_stripe] = blend
    tile[is_b1 & v_stripe] = c2
    tile[is_b1 & ~v_stripe] = blend
    return np.clip(tile, 0.0, 1.0)


def _generate_shweshwe(defn: PatternDefinition) -> np.ndarray:
    """Dense tiny geometric shapes on contrasting ground (South African shweshwe)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    yy, xx = np.mgrid[:ts, :ts]

    # Dense small diamond grid — two offset layers of tiny diamonds
    spacing = max(ts // 4, 3)
    half = spacing // 2

    # Diamond mask at regular grid points
    cy1 = yy % spacing
    cx1 = xx % spacing
    diamond1 = (np.abs(cy1 - half) + np.abs(cx1 - half)) <= half * 0.7

    # Offset second layer by half spacing
    cy2 = (yy + half) % spacing
    cx2 = (xx + half) % spacing
    diamond2 = (np.abs(cy2 - half) + np.abs(cx2 - half)) <= half * 0.5

    mask = diamond1 | diamond2
    return np.where(mask[..., None], c2, c1)


def _generate_chinese_coin(defn: PatternDefinition) -> np.ndarray:
    """Circles with square holes (Chinese coin / cash motif)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    center = ts / 2.0
    yy, xx = np.mgrid[:ts, :ts]
    dx = xx + 0.5 - center
    dy = yy + 0.5 - center

    # Outer circle with anti-aliased edge
    dist = np.sqrt(dx**2 + dy**2)
    radius = ts * 0.42
    circle = dist <= radius

    # Square hole in center
    hole_size = ts * 0.12
    square_hole = (np.abs(dx) <= hole_size) & (np.abs(dy) <= hole_size)

    mask = circle & ~square_hole
    return np.where(mask[..., None], c2, c1)


def _generate_dancheong(defn: PatternDefinition) -> np.ndarray:
    """Concentric rectangles with stepped corners (Korean dancheong)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)

    yy, xx = np.mgrid[:ts, :ts]
    # Chebyshev distance from center gives concentric squares
    center = ts / 2.0
    dist = np.maximum(np.abs(xx + 0.5 - center), np.abs(yy + 0.5 - center))

    # Alternating rings
    ring_w = max(ts / 6, 1.5)
    ring_idx = (dist / ring_w).astype(int)
    mask = ring_idx % 2 == 0

    return np.where(mask[..., None], c2, c1)


def _generate_mudcloth(defn: PatternDefinition) -> np.ndarray:
    """Bold geometric symbols on ground (Malian mudcloth / bogolanfini).

    Based on Hero Patterns 'x-equals' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
        f'<rect width="48" height="48" fill="{bg_s}"/>'
        f'<path fill-rule="evenodd" fill="{fg_s}" d="M5 3.59L1.46.05.05'
        " 1.46 3.59 5 .05 8.54l1.41 1.41L5 6.41l3.54 3.54 1.41-1.41"
        "L6.41 5l3.54-3.54L8.54.05 5 3.59zM17 2h24v2H17V2zm0 4h24v2H17"
        'V6zM2 17h2v24H2V17zm4 0h2v24H6V17z"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Phase 2b — numpy patterns (Japanese + famous + medieval + continental)
# ---------------------------------------------------------------------------


def _generate_same_komon(defn: PatternDefinition) -> np.ndarray:
    """Tiny offset semicircle dots (Japanese shark skin / same komon)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    yy, xx = np.mgrid[:ts, :ts]

    spacing = max(ts // 4, 2)
    half = spacing // 2

    # Row of tiny dots, offset every other row
    row = yy // spacing
    cy = (yy % spacing).astype(np.float32)
    cx = ((xx + (row % 2) * half) % spacing).astype(np.float32)

    # Small circle at center of each cell
    dist = np.sqrt((cx - half) ** 2 + (cy - half) ** 2)
    mask = dist < half * 0.6

    return np.where(mask[..., None], c2, c1)


def _generate_kanoko(defn: PatternDefinition) -> np.ndarray:
    """Fawn spot tie-dye dots (Japanese kanoko shibori)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    yy, xx = np.mgrid[:ts, :ts]

    # Staggered dot grid — offset every other row
    spacing = max(ts // 3, 2)
    half = spacing // 2
    row = yy // spacing

    cy = (yy % spacing).astype(np.float32) - half
    cx = ((xx + (row % 2) * half) % spacing).astype(np.float32) - half

    dist = np.sqrt(cx**2 + cy**2)
    # Ring shape (donut) — characteristic of shibori
    ring = (dist > half * 0.25) & (dist < half * 0.7)

    return np.where(ring[..., None], c2, c1)


def _generate_hishi(defn: PatternDefinition) -> np.ndarray:
    """Diamond / rhombus shapes (Japanese hishi)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    center = ts / 2.0
    yy, xx = np.mgrid[:ts, :ts]

    # Diamond outline — |x-cx|/a + |y-cy|/b == 1
    dx = np.abs(xx + 0.5 - center) / center
    dy = np.abs(yy + 0.5 - center) / center
    dist = dx + dy

    # Double diamond outline
    outline = (np.abs(dist - 0.6) < 0.08) | (np.abs(dist - 0.85) < 0.06)

    return np.where(outline[..., None], c2, c1)


def _generate_nordic_snowflake(defn: PatternDefinition) -> np.ndarray:
    """Pixel-art 8-point star (Scandinavian knit snowflake)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    center = ts / 2.0
    yy, xx = np.mgrid[:ts, :ts]

    dx = np.abs(xx + 0.5 - center)
    dy = np.abs(yy + 0.5 - center)

    # Cross arms
    arm_w = ts * 0.08
    cross = ((dx < arm_w) | (dy < arm_w)) & (dx + dy < center * 0.9)

    # Diagonal arms
    diag_w = ts * 0.06
    diag = (np.abs(dx - dy) < diag_w) & (dx + dy < center * 0.85)

    # Small dots at arm tips
    dots = (dx + dy > center * 0.6) & (dx + dy < center * 0.75) & (
        (dx < arm_w * 2) | (dy < arm_w * 2)
    )

    mask = cross | diag | dots
    return np.where(mask[..., None], c2, c1)


def _generate_nordic_diamond(defn: PatternDefinition) -> np.ndarray:
    """Rows of diamond lozenges (Scandinavian knit pattern)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    center = ts / 2.0
    yy, xx = np.mgrid[:ts, :ts]

    dx = np.abs(xx + 0.5 - center)
    dy = np.abs(yy + 0.5 - center)

    # Diamond outline
    dist = dx / center + dy / center
    outline = np.abs(dist - 0.7) < 0.1

    # Small cross at center
    arm = ts * 0.06
    cross = (dx < arm) & (dy < arm)

    mask = outline | cross
    return np.where(mask[..., None], c2, c1)


def _generate_native_step(defn: PatternDefinition) -> np.ndarray:
    """Staircase-edged diamonds (Southwest US / Native American step pattern)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    center = ts / 2.0
    step_size = max(ts // 6, 1)

    yy, xx = np.mgrid[:ts, :ts]
    dx = np.abs(xx + 0.5 - center)
    dy = np.abs(yy + 0.5 - center)

    # Stepped diamond: quantize the distance
    sdx = (dx // step_size) * step_size
    sdy = (dy // step_size) * step_size
    mask = (sdx + sdy) <= center * 0.7

    return np.where(mask[..., None], c2, c1)


def _generate_camouflage(defn: PatternDefinition) -> np.ndarray:
    """Organic blob pattern (military camouflage)."""
    ts = defn.tile_size
    c1, c2 = _c(defn.background), _fg(defn)
    # Use a deterministic pseudo-random pattern based on coordinates
    yy, xx = np.mgrid[:ts, :ts]

    # Layered sine waves creating organic blobs
    v1 = np.sin(xx * 0.8) + np.sin(yy * 0.6)
    v2 = np.sin((xx + yy) * 0.5) + np.cos((xx - yy) * 0.4)
    v3 = np.sin(xx * 1.2 + 1) + np.cos(yy * 0.9 + 2)

    combined = v1 + v2 * 0.7 + v3 * 0.5
    mask = combined > 0.5

    return np.where(mask[..., None], c2, c1)


# ---------------------------------------------------------------------------
# Phase 2b — SVG patterns (Japanese + famous + medieval)
# ---------------------------------------------------------------------------


def _generate_tachiwaki(defn: PatternDefinition) -> np.ndarray:
    """Rising steam / wavy vertical lines (Japanese tachiwaki)."""
    ts = defn.tile_size
    bg_s = _svg_rgb(defn.background)
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    sw = max(1, ts / 8)
    q = ts / 4

    # Two wavy vertical lines using cubic bezier
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{ts}" height="{ts}">'
        f'<rect width="{ts}" height="{ts}" fill="{bg_s}"/>'
        f'<path d="M {q},0 C {q + q * 0.6},{ts * 0.25} {q - q * 0.6},'
        f'{ts * 0.75} {q},{ts}" fill="none" stroke="{fg_s}"'
        f' stroke-width="{sw}"/>'
        f'<path d="M {3 * q},0 C {3 * q + q * 0.6},{ts * 0.25}'
        f' {3 * q - q * 0.6},{ts * 0.75} {3 * q},{ts}"'
        f' fill="none" stroke="{fg_s}" stroke-width="{sw}"/>'
        "</svg>"
    )
    return _svg_to_array(svg, ts, ts)


def _generate_bishamon_kikko(defn: PatternDefinition) -> np.ndarray:
    """Interlocking triple hexagons (Japanese bishamon kikko).

    Based on Hero Patterns 'happy-intersection' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88">'
        f'<rect width="88" height="88" fill="{bg_s}"/>'
        f'<path d="M29.42 29.41c.36-.36.58-.85.58-1.4V0h-4v26H0v4h28c.55'
        " 0 1.05-.22 1.41-.58h.01zm0 29.18c.36.36.58.86.58 1.4V88h-4V62"
        "H0v-4h28c.56 0 1.05.22 1.41.58zm29.16 0c-.36.36-.58.85-.58 1.4"
        "V88h4V62h26v-4H60c-.55 0-1.05.22-1.41.58zm0-29.18c-.36-.36-.58"
        "-.86-.58-1.4V0h4v26h26v4H60c-.56 0-1.05-.22-1.41-.58zM26 30H0"
        "v-2h26V2h2v28zm36 0h26v-2H62V2h-2v28zM26 58H0v2h26v26h2V58zm36"
        f' 0h26v2H62v26h-2V58z" fill="{fg_s}" fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_quatrefoil(defn: PatternDefinition) -> np.ndarray:
    """Four overlapping circles forming 4-lobed shape (Gothic quatrefoil).

    Based on Hero Patterns 'tic-tac-toe' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" fill="{bg_s}"/>'
        f'<path d="M8 16c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8'
        " 3.582 8 8 8zm0-2c3.314 0 6-2.686 6-6s-2.686-6-6-6-6 2.686-6"
        " 6 2.686 6 6 6zm33.414-6l5.95-5.95L45.95.636 40 6.586 34.05"
        ".636 32.636 2.05 38.586 8l-5.95 5.95 1.414 1.414L40 9.414l5.95"
        " 5.95 1.414-1.414L41.414 8zM40 48c4.418 0 8-3.582 8-8s-3.582"
        "-8-8-8-8 3.582-8 8 3.582 8 8 8zm0-2c3.314 0 6-2.686 6-6s"
        "-2.686-6-6-6-6 2.686-6 6 2.686 6 6 6zM9.414 40l5.95-5.95"
        "-1.414-1.414L8 38.586l-5.95-5.95L.636 34.05 6.586 40l-5.95"
        f' 5.95 1.414 1.414L8 41.414l5.95 5.95 1.414-1.414L9.414 40z"'
        f' fill="{fg_s}" fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_herringbone(defn: PatternDefinition) -> np.ndarray:
    """Angled rectangular bricks in zigzag rows (herringbone).

    Based on Hero Patterns 'charlie-brown' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 12">'
        f'<rect width="20" height="12" fill="{bg_s}"/>'
        f'<path d="M9.8 12L0 2.2V.8l10 10 10-10v1.4L10.2 12h-.4zm-4'
        " 0L0 6.2V4.8L7.2 12H5.8zm8.4 0L20 6.2V4.8L12.8 12h1.4zM9.8"
        f' 0l.2.2.2-.2h-.4zm-4 0L10 4.2 14.2 0h-1.4L10 2.8 7.2 0H5.8z"'
        f' fill="{fg_s}" fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_trellis(defn: PatternDefinition) -> np.ndarray:
    """Diamond lattice grid (trellis / garden lattice).

    Based on Hero Patterns 'diagonal-stripes' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'
        f'<rect width="40" height="40" fill="{bg_s}"/>'
        f'<path d="M0 40L40 0H20L0 20zM40 40V20L20 40z"'
        f' fill="{fg_s}" fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_damask(defn: PatternDefinition) -> np.ndarray:
    """Simplified floral diamond motif (Syrian damask).

    Based on Hero Patterns 'morphing-diamonds' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">'
        f'<rect width="60" height="60" fill="{bg_s}"/>'
        f'<path d="M54.627 0l.829.828-1.414 1.415L51.799 0h2.828zM5.373'
        " 0l-.829.828 1.414 1.415L8.201 0H5.373zM48.97 0l3.657 3.657"
        "-1.414 1.414L46.143 0h2.828zM11.03 0L7.373 3.657 8.787 5.07"
        " 13.857 0H11.03zm32.284 0L49.8 6.485 48.384 7.9 40.484 0h2.83"
        "zM16.686 0L10.2 6.485 11.616 7.9 19.516 0h-2.83zM22.344 0L13"
        " 9.314l1.414 1.414L22.344 2.8V0h2.828L28 2.828V0h4v2.828L34.828"
        " 0h2.83L30 7.657l-7.657-7.657L30 7.657 37.657 0H34.83L30"
        " 4.828V0h-4v4.828L22.344 0h-2.83L30 10.486l-7.657-7.657L30"
        f' 10.486z" fill="{fg_s}" fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_chainmail(defn: PatternDefinition) -> np.ndarray:
    """Interlocking rings (medieval chainmail).

    Based on Hero Patterns 'connections' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">'
        f'<rect width="36" height="36" fill="{bg_s}"/>'
        f'<path d="M36 0H0v36h36V0zM15.126 2H2v13.126c.367.094.714.24'
        " 1.032.428L15.554 3.032c-.188-.318-.334-.665-.428-1.032zM18"
        " 4.874V18H4.874c-.094-.367-.24-.714-.428-1.032L16.968 4.446c"
        ".318.188.665.334 1.032.428zM22.874 2c-.094.367-.24.714-.428"
        " 1.032l12.522 12.522c.188-.318.334-.665.428-1.032H22.874zM18"
        " 31.126V18h13.126c.094.367.24.714.428 1.032L19.032 31.554c"
        "-.318-.188-.665-.334-1.032-.428zM4.874 34H18V20.874c-.367-.094"
        "-.714-.24-1.032-.428L4.446 32.968c.188.318.334.665.428 1.032z"
        "M31.126 34H18V20.874c.367-.094.714-.24 1.032-.428l12.522"
        " 12.522c-.188.318-.334.665-.428 1.032zM34 15.126V2H20.874c"
        "-.094.367-.24.714-.428 1.032l12.522 12.522c.318-.188.665-.334"
        " 1.032-.428zM2 20.874V34h13.126c.094-.367.24-.714.428-1.032"
        "L3.032 20.446c-.318.188-.665.334-1.032.428z"
        f'" fill="{fg_s}" fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_gothic_trefoil(defn: PatternDefinition) -> np.ndarray:
    """Three-lobed trefoil motif (Gothic architecture).

    Based on Hero Patterns 'four-point-stars' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
        f'<rect width="24" height="24" fill="{bg_s}"/>'
        f'<path d="M8 4l4 2-4 2-2 4-2-4-4-2 4-2 2-4 2 4z"'
        f' fill="{fg_s}"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_celtic_knot(defn: PatternDefinition) -> np.ndarray:
    """Angular crossing bands with over-under weave (Irish celtic knot).

    Based on Hero Patterns 'curtain' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 12">'
        f'<rect width="44" height="12" fill="{bg_s}"/>'
        f'<path d="M20 12v-2L0 0v10l4 2h16zm18 0l4-2V0L22 10v2h16zM20'
        f' 0v8L4 0h16zm18 0L22 8V0h16z" fill="{fg_s}"'
        ' fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


# Phase 2 — SVG patterns (rendered via cairosvg)
# ---------------------------------------------------------------------------


def _generate_kikko(defn: PatternDefinition) -> np.ndarray:
    """Hexagonal tortoiseshell tessellation (Japanese kikko).

    Based on Hero Patterns 'hexagons' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 49">'
        f'<rect width="28" height="49" fill="{bg_s}"/>'
        f'<path d="M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5z'
        "M3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0"
        " 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v"
        "-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17"
        f' 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z"'
        f' fill="{fg_s}" fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_sayagata(defn: PatternDefinition) -> np.ndarray:
    """Interlocking right-angle maze meander (Japanese/Chinese sayagata).

    Based on Hero Patterns 'aztec' (MIT license) — angular stepped spiral.
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 64">'
        f'<rect width="32" height="64" fill="{bg_s}"/>'
        f'<path d="M0 28h20V16h-4v8H4V4h28v28h-4V8H8v12h4v-8h12v20H0v-4z'
        "m12 8h20v4H16v24H0v-4h12V36zm16 12h-4v12h8v4H20V44h12v12h-4v-8z"
        f'M0 36h8v20H0v-4h4V40H0v-4z" fill="{fg_s}"'
        ' fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_chinese_lattice(defn: PatternDefinition) -> np.ndarray:
    """Irregular polygonal cracked-ice lattice (Chinese window lattice)."""
    ts = defn.tile_size
    bg_s = _svg_rgb(defn.background)
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    sw = max(0.5, ts / 12)

    # Cracked-ice pattern: irregular polygonal cells
    u = ts / 5
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{ts}" height="{ts}">'
        f'<rect width="{ts}" height="{ts}" fill="{bg_s}"/>'
        f'<g fill="none" stroke="{fg_s}" stroke-width="{sw}">'
        f'<polygon points="{u},{0} {3 * u},{0} {2.5 * u},{2 * u}'
        f' {1.5 * u},{1.5 * u}"/>'
        f'<polygon points="{3 * u},{0} {ts},{0} {ts},{1.5 * u}'
        f' {3.5 * u},{2 * u}"/>'
        f'<polygon points="0,0 {u},0 {1.5 * u},{1.5 * u}'
        f' 0,{2 * u}"/>'
        f'<polygon points="0,{2 * u} {1.5 * u},{1.5 * u}'
        f' {2.5 * u},{2 * u} {2 * u},{3.5 * u} 0,{3 * u}"/>'
        f'<polygon points="{2.5 * u},{2 * u} {3.5 * u},{2 * u}'
        f' {ts},{1.5 * u} {ts},{3.5 * u} {3 * u},{3.5 * u}"/>'
        f'<polygon points="0,{3 * u} {2 * u},{3.5 * u}'
        f' {1.5 * u},{ts} 0,{ts}"/>'
        f'<polygon points="{2 * u},{3.5 * u} {3 * u},{3.5 * u}'
        f' {3.5 * u},{ts} {1.5 * u},{ts}"/>'
        f'<polygon points="{3 * u},{3.5 * u} {ts},{3.5 * u}'
        f' {ts},{ts} {3.5 * u},{ts}"/>'
        "</g></svg>"
    )
    return _svg_to_array(svg, ts, ts)


def _generate_ruyi_cloud(defn: PatternDefinition) -> np.ndarray:
    """Stylized 3-lobe cloud head (Chinese ruyi motif)."""
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    # Three-lobed cloud in a 50x50 viewBox
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">'
        f'<rect width="50" height="50" fill="{bg_s}"/>'
        f'<path d="M25 12 C20 12,16 16,16 20 C16 24,12 24,10 22'
        " C8 20,4 20,4 24 C4 28,8 32,12 32 L38 32"
        " C42 32,46 28,46 24 C46 20,42 20,40 22"
        " C38 24,34 24,34 20 C34 16,30 12,25 12Z"
        f'" fill="{fg_s}"/>'
        # Stem
        f'<rect x="23" y="32" width="4" height="12" fill="{fg_s}"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_batik_kawung(defn: PatternDefinition) -> np.ndarray:
    """Four overlapping circles forming flower (Indonesian batik kawung).

    Based on Hero Patterns 'cage' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 26">'
        f'<rect width="32" height="26" fill="{bg_s}"/>'
        f'<path d="M14 0v3.994C14 7.864 10.858 11 7 11c-3.866 0-7'
        "-3.138-7-7.006V0h2v4.005C2 6.764 4.239 9 7 9c2.756 0 5"
        "-2.236 5-4.995V0h2zm0 26v-5.994C14 16.138 10.866 13 7 13c"
        "-3.858 0-7 3.137-7 7.006V26h2v-6.005C2 17.236 4.244 15 7"
        " 15c2.761 0 5 2.236 5 4.995V26h2zm2-18.994C16 3.136 19.142"
        " 0 23 0c3.866 0 7 3.138 7 7.006v9.988C30 20.864 26.858 24"
        " 23 24c-3.866 0-7-3.138-7-7.006V7.006zm2-.01C18 4.235"
        " 20.244 2 23 2c2.761 0 5 2.236 5 4.995v10.01C28 19.764"
        f' 25.756 22 23 22c-2.761 0-5-2.236-5-4.995V6.995z"'
        f' fill="{fg_s}" fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_batik_parang(defn: PatternDefinition) -> np.ndarray:
    """Wavy-edged diagonal bands (Indonesian batik parang).

    Based on Hero Patterns 'groovy' (MIT license) — parallel S-curves.
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 40">'
        f'<rect width="24" height="40" fill="{bg_s}"/>'
        f'<path d="M0 40c5.523 0 10-4.477 10-10V0C4.477 0 0 4.477 0'
        " 10v30zm22 0c-5.523 0-10-4.477-10-10V0c5.523 0 10 4.477"
        f' 10 10v30z" fill="{fg_s}" fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_karakusa(defn: PatternDefinition) -> np.ndarray:
    """Flowing spiral vine scroll (Japanese karakusa).

    Based on Hero Patterns 'leaf' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40">'
        f'<rect width="80" height="40" fill="{bg_s}"/>'
        f'<path d="M2.011 39.976c.018-4.594 1.785-9.182 5.301-12.687'
        ".475-.474.97-.916 1.483-1.326v9.771L4.54 39.976H2.01zm5.373"
        " 0L23.842 23.57c.687 5.351-1.031 10.95-5.154 15.06-.483.483"
        "-.987.931-1.508 1.347H7.384zm-7.384 0c.018-5.107 1.982-10.208"
        " 5.89-14.104 5.263-5.247 12.718-6.978 19.428-5.192 1.783"
        " 6.658.07 14.053-5.137 19.296H.001zm10.806-15.41c3.537-2.116"
        " 7.644-2.921 11.614-2.415L10.806 33.73v-9.163zM65.25.75C58.578"
        "-1.032 51.164.694 45.93 5.929c-5.235 5.235-6.961 12.649-5.18"
        " 19.321 6.673 1.782 14.087.056 19.322-5.179 5.235-5.235 6.961"
        "-12.649 5.18-19.321zM43.632 23.783c5.338.683 10.925-1.026"
        " 15.025-5.126 4.1-4.1 5.809-9.687 5.126-15.025l-20.151"
        " 20.15zm7.186-19.156c3.518-2.112 7.602-2.915 11.55-2.41l"
        "-11.55 11.55v-9.14zm-3.475 2.716c-4.1 4.1-5.809 9.687-5.126"
        " 15.025l6.601-6.6V6.02c-.51.41-1.002.85-1.475 1.323zM.071"
        " 0C.065 1.766.291 3.533.75 5.25 7.422 7.032 14.836 5.306"
        " 20.07.071l.07-.071H.072zm17.086 0C13.25 3.125 8.345 4.386"
        " 3.632 3.783L7.414 0h9.743zM2.07 0c-.003.791.046 1.582.146"
        f' 2.368L4.586 0H2.07z" fill="{fg_s}" fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_kolam(defn: PatternDefinition) -> np.ndarray:
    """Lines weaving around dot grid (South Indian kolam).

    Based on Hero Patterns 'jupiter' (MIT license) — dots connected by arcs.
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">'
        f'<rect width="52" height="52" fill="{bg_s}"/>'
        f'<path d="M0 17.83V0h17.83a3 3 0 0 1-5.66 2H5.9A5 5 0 0 1'
        " 2 5.9v6.27a3 3 0 0 1-2 5.66zm0 18.34a3 3 0 0 1 2 5.66v6.27"
        "A5 5 0 0 1 5.9 52h6.27a3 3 0 0 1 5.66 0H0V36.17zM36.17 52a3"
        " 3 0 0 1 5.66 0h6.27a5 5 0 0 1 3.9-3.9v-6.27a3 3 0 0 1"
        " 0-5.66V52H36.17zM0 31.93v-9.78a5 5 0 0 1 3.8.72l4.43-4.43"
        "a3 3 0 1 1 1.42 1.41L5.2 24.28a5 5 0 0 1 0 5.52l4.44 4.43a3"
        " 3 0 1 1-1.42 1.42L3.8 31.2a5 5 0 0 1-3.8.72zm52-14.1a3 3"
        " 0 0 1 0-5.66V5.9A5 5 0 0 1 48.1 2h-6.27a3 3 0 0 1-5.66"
        "-2H52v17.83zm0 14.1a4.97 4.97 0 0 1-1.72-.72l-4.43 4.44a3"
        " 3 0 1 1-1.41-1.42l4.43-4.43a5 5 0 0 1 0-5.52l-4.43-4.43"
        "a3 3 0 1 1 1.41-1.41l4.43 4.43c.53-.35 1.12-.6 1.72-.72v9.78"
        "zM22.15 0h9.78a5 5 0 0 1-.72 3.8l4.44 4.43a3 3 0 1 1-1.42"
        " 1.42L29.8 5.2a5 5 0 0 1-5.52 0l-4.43 4.44a3 3 0 1 1-1.41"
        "-1.42l4.43-4.43a5 5 0 0 1-.72-3.8zm0 52c.13-.6.37-1.19.72"
        "-1.72l-4.43-4.43a3 3 0 1 1 1.41-1.41l4.43 4.43a5 5 0 0 1"
        " 5.52 0l4.43-4.43a3 3 0 1 1 1.42 1.41l-4.44 4.43c.36.53.6"
        " 1.12.72 1.72h-9.78zm9.75-24a5 5 0 0 1-3.9 3.9v6.27a3 3 0"
        " 1 1-2 0V31.9a5 5 0 0 1-3.9-3.9h-6.27a3 3 0 1 1 0-2h6.27"
        "a5 5 0 0 1 3.9-3.9v-6.27a3 3 0 1 1 2 0v6.27a5 5 0 0 1 3.9"
        f' 3.9h6.27a3 3 0 1 1 0 2H31.9z" fill="{fg_s}"'
        ' fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_adinkra(defn: PatternDefinition) -> np.ndarray:
    """Geometric stamp symbols in grid (Ghanaian adinkra).

    Based on Hero Patterns 'plus' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">'
        f'<rect width="60" height="60" fill="{bg_s}"/>'
        f'<path d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4'
        "h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6"
        f' 4V0H4v4H0v2h4v4h2V6h4V4H6z" fill="{fg_s}"'
        ' fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


# ---------------------------------------------------------------------------
# Phase 1 — SVG patterns (rendered via cairosvg)
# ---------------------------------------------------------------------------


def _generate_seigaiha(defn: PatternDefinition) -> np.ndarray:
    """Overlapping concentric half-circle waves (Japanese seigaiha).

    Based on Hero Patterns 'endless-clouds' (MIT license).
    """
    fg = defn.foreground or (255, 255, 255)
    fg_s = _svg_rgb(fg)
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 28">'
        f'<rect width="56" height="28" fill="{bg_s}"/>'
        f'<path d="M56 26c-2.813 0-5.456.726-7.752 2H56v-2zm-26 2h4.087'
        "C38.707 20.783 46.795 16 56 16v-2c-.672 0-1.339.024-1.999.07L54"
        " 14c0-1.105.895-2 2-2v-2c-2.075 0-3.78 1.58-3.98 3.602-.822"
        "-1.368-1.757-2.66-2.793-3.862C50.644 7.493 53.147 6 56 6V4c"
        "-3.375 0-6.359 1.672-8.17 4.232-.945-.948-1.957-1.828-3.03"
        "-2.634C47.355 2.198 51.42 0 56 0h-7.752c-1.998 1.108-3.733"
        " 2.632-5.09 4.454-1.126-.726-2.307-1.374-3.536-1.936.63-.896"
        " 1.33-1.738 2.095-2.518H39.03c-.46.557-.893 1.137-1.297 1.737"
        "-1.294-.48-2.633-.866-4.009-1.152.12-.196.24-.392.364-.585H30l"
        "-.001.07C29.339.024 28.672 0 28 0c-.672 0-1.339.024-1.999.07L26"
        " 0h-4.087c.124.193.245.389.364.585-1.376.286-2.715.673-4.009"
        " 1.152-.404-.6-.837-1.18-1.297-1.737h-2.688c.764.78 1.466"
        " 1.622 2.095 2.518-1.23.562-2.41 1.21-3.536 1.936C11.485"
        " 2.632 9.75 1.108 7.752 0H0c4.58 0 8.645 2.199 11.2 5.598"
        "-1.073.806-2.085 1.686-3.03 2.634C6.359 5.672 3.375 4 0 4v2c"
        "2.852 0 5.356 1.493 6.773 3.74-1.036 1.203-1.971 2.494-2.793"
        " 3.862C3.78 11.58 2.075 10 0 10v2c1.105 0 2 .895 2 2l-.001.07"
        "C1.339 14.024.672 14 0 14v2c9.205 0 17.292 4.783 21.913 12H26c0"
        "-1.105.895-2 2-2s2 .895 2 2zM7.752 28C5.456 26.726 2.812 26 0"
        " 26v2h7.752zM56 20c-6.832 0-12.936 3.114-16.971 8h2.688c3.63"
        "-3.703 8.688-6 14.283-6v-2zm-39.029 8C12.936 23.114 6.831 20 0"
        " 20v2c5.595 0 10.653 2.297 14.283 6h2.688zm15.01-.398c.821"
        "-1.368 1.756-2.66 2.792-3.862C33.356 21.493 30.853 20 28 20c"
        "-2.852 0-5.356 1.493-6.773 3.74 1.036 1.203 1.971 2.494 2.793"
        " 3.862C24.22 25.58 25.925 24 28 24s3.78 1.58 3.98 3.602zm14.287"
        "-11.865C42.318 9.864 35.61 6 28 6c-7.61 0-14.318 3.864-18.268"
        " 9.737-1.294-.48-2.633-.866-4.009-1.152C10.275 7.043 18.548 2"
        " 28 2c9.452 0 17.725 5.043 22.277 12.585-1.376.286-2.715.673"
        "-4.009 1.152zm-5.426 2.717c1.126-.726 2.307-1.374 3.536-1.936"
        "C40.76 11.367 34.773 8 28 8s-12.76 3.367-16.378 8.518c1.23.562"
        " 2.41 1.21 3.536 1.936C18.075 14.537 22.741 12 28 12s9.925"
        " 2.537 12.842 6.454zm-4.672 3.778c.945-.948 1.957-1.828 3.03"
        "-2.634C36.645 16.198 32.58 14 28 14c-4.58 0-8.645 2.199-11.2"
        " 5.598 1.073.806 2.085 1.686 3.03 2.634C21.641 19.672 24.625"
        f' 18 28 18s6.359 1.672 8.17 4.232z" fill="{fg_s}"'
        ' fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_asanoha(defn: PatternDefinition) -> np.ndarray:
    """Six-pointed star hemp-leaf tessellation (Japanese asanoha)."""
    ts = defn.tile_size
    bg_s = _svg_rgb(defn.background)
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    sw = max(0.5, ts / 12)
    h = ts / 2
    q = ts / 4

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{ts}" height="{ts}">'
        f'<rect width="{ts}" height="{ts}" fill="{bg_s}"/>'
        # Diamond outline
        f'<polygon points="{h},0 {ts},{h} {h},{ts} 0,{h}" '
        f'fill="none" stroke="{fg_s}" stroke-width="{sw}"/>'
        # Radial lines from center to diamond vertices
        f'<line x1="{h}" y1="{h}" x2="{h}" y2="0" '
        f'stroke="{fg_s}" stroke-width="{sw}"/>'
        f'<line x1="{h}" y1="{h}" x2="{ts}" y2="{h}" '
        f'stroke="{fg_s}" stroke-width="{sw}"/>'
        f'<line x1="{h}" y1="{h}" x2="{h}" y2="{ts}" '
        f'stroke="{fg_s}" stroke-width="{sw}"/>'
        f'<line x1="{h}" y1="{h}" x2="0" y2="{h}" '
        f'stroke="{fg_s}" stroke-width="{sw}"/>'
        # Diagonal lines from center to diamond edge midpoints
        f'<line x1="{h}" y1="{h}" x2="{q}" y2="{q}" '
        f'stroke="{fg_s}" stroke-width="{sw}"/>'
        f'<line x1="{h}" y1="{h}" x2="{h + q}" y2="{q}" '
        f'stroke="{fg_s}" stroke-width="{sw}"/>'
        f'<line x1="{h}" y1="{h}" x2="{q}" y2="{h + q}" '
        f'stroke="{fg_s}" stroke-width="{sw}"/>'
        f'<line x1="{h}" y1="{h}" x2="{h + q}" y2="{h + q}" '
        f'stroke="{fg_s}" stroke-width="{sw}"/>'
        "</svg>"
    )
    return _svg_to_array(svg, ts, ts)


def _generate_shippo(defn: PatternDefinition) -> np.ndarray:
    """Interlocking circles — seven treasures pattern (Japanese shippo).

    Based on Hero Patterns 'intersecting-circles' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30">'
        f'<rect width="30" height="30" fill="{bg_s}"/>'
        f'<path d="M15 0C6.716 0 0 6.716 0 15c8.284 0 15-6.716 15-15z'
        "M0 15c0 8.284 6.716 15 15 15 0-8.284-6.716-15-15-15zm30 0c0"
        "-8.284-6.716-15-15-15 0 8.284 6.716 15 15 15zm0 0c0 8.284"
        f'-6.716 15-15 15 0-8.284 6.716-15 15-15z" fill="{fg_s}"'
        ' fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_islamic_star(defn: PatternDefinition) -> np.ndarray:
    """Interlocking Moorish star lattice (Islamic geometric).

    Based on Hero Patterns 'moroccan' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 88">'
        f'<rect width="80" height="88" fill="{bg_s}"/>'
        f'<path d="M22 21.91V26h-2.001C10.06 26 2 34.059 2 44c0 9.943'
        " 8.058 18 17.999 18H22v4.09c8.012.722 14.785 5.738 18 12.73"
        " 3.212-6.991 9.983-12.008 18-12.73V62h2.001C69.94 62 78"
        " 53.941 78 44c0-9.943-8.058-18-17.999-18H58v-4.09c-8.012"
        "-.722-14.785-5.738-18-12.73-3.212 6.991-9.983 12.008-18"
        " 12.73zM54 58v4.696c-5.574 1.316-10.455 4.428-14 8.69-3.545"
        "-4.262-8.426-7.374-14-8.69V58h-5.993C12.271 58 6 51.734 6"
        " 44c0-7.732 6.275-14 14.007-14H26v-4.696c5.574-1.316 10.455"
        "-4.428 14-8.69 3.545 4.262 8.426 7.374 14 8.69V30h5.993C67.729"
        " 30 74 36.266 74 44c0 7.732-6.275 14-14.007 14H54zM42 88c0"
        "-9.941 8.061-18 17.999-18H62v-4.09c8.016-.722 14.787-5.738"
        " 18-12.73v7.434c-3.545 4.262-8.426 7.374-14 8.69V74h-5.993"
        "C52.275 74 46 80.268 46 88h-4zm-4 0c0-9.943-8.058-18-17.999"
        "-18H18v-4.09c-8.012-.722-14.785-5.738-18-12.73v7.434c3.545"
        " 4.262 8.426 7.374 14 8.69V74h5.993C27.729 74 34 80.266 34"
        " 88h4zm4-88c0 9.943 8.058 18 17.999 18H62v4.09c8.012.722"
        " 14.785 5.738 18 12.73v-7.434c-3.545-4.262-8.426-7.374-14"
        "-8.69V14h-5.993C52.271 14 46 7.734 46 0h-4zM0 34.82c3.213"
        "-6.992 9.984-12.008 18-12.73V18h2.001C29.94 18 38 9.941 38"
        f" 0h-4c0 7.732-6.275 14-14.007 14H14v4.696c-5.574 1.316-10.455"
        f' 4.428-14 8.69v7.433z" fill="{fg_s}" fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_greek_key(defn: PatternDefinition) -> np.ndarray:
    """Angular spiral meander border (Greek key / meander).

    Based on Hero Patterns 'temple' (MIT license).
    """
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 152 152">'
        f'<rect width="152" height="152" fill="{bg_s}"/>'
        f'<path d="M152 150v2H0v-2h28v-8H8v-20H0v-2h8V80h42v20h20v42H30v8'
        "h90v-8H80v-42h20V80h42v40h8V30h-8v40h-42V50H80V8h40V0h2v8h20v20h8"
        "V0h2v150zm-2 0v-28h-8v20h-20v8h28zM82 30v18h18V30H82zm20 18h20v20"
        "h18V30h-20V10H82v18h20v20zm0 2v18h18V50h-18zm20-22h18V10h-18v18zm"
        "-54 92v-18H50v18h18zm-20-18H28V82H10v38h20v20h38v-18H48v-20zm0-2"
        "V82H30v18h18zm-20 22H10v18h18v-18zm54 0v18h38v-20h20V82h-18v20h-20"
        "v20H82zm18-20H82v18h18v-18zm2-2h18V82h-18v18zm20 40v-18h18v18h-18z"
        f"M30 0h-2v8H8v20H0v2h8v40h42V50h20V8H30V0zm20 48h18V30H50v18zm18"
        "-20H48v20H28v20H10V30h20V10h38v18zM30 50h18v18H30V50zm-2-40H10v18"
        f'h18V10z" fill="{fg_s}" fill-rule="evenodd"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


def _generate_art_deco_fan(defn: PatternDefinition) -> np.ndarray:
    """Offset semicircles with radiating lines (Art Deco fan / scallop)."""
    ts = defn.tile_size
    bg_s = _svg_rgb(defn.background)
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    sw = max(0.5, ts / 12)
    r = ts * 0.45

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{ts}" height="{ts}">'
        f'<defs><clipPath id="c"><rect width="{ts}" height="{ts}"/>'
        f"</clipPath></defs>"
        f'<g clip-path="url(#c)">'
        f'<rect width="{ts}" height="{ts}" fill="{bg_s}"/>'
    )

    # Fans from bottom-center and offset positions
    fan_positions = [
        (ts / 2, ts),
        (0, ts / 2),
        (ts, ts / 2),
    ]

    for fx, fy in fan_positions:
        # Concentric arcs
        for i in range(3, 0, -1):
            ri = r * i / 3
            svg += (
                f'<circle cx="{fx}" cy="{fy}" r="{ri}" '
                f'fill="none" stroke="{fg_s}" stroke-width="{sw}"/>'
            )
        # Radiating lines (5 lines spread over 180 degrees)
        for j in range(5):
            angle = math.pi * j / 4
            x2 = fx + r * math.cos(angle)
            y2 = fy - r * math.sin(angle)
            svg += (
                f'<line x1="{fx}" y1="{fy}" x2="{x2}" y2="{y2}" '
                f'stroke="{fg_s}" stroke-width="{sw}"/>'
            )

    svg += "</g></svg>"
    return _svg_to_array(svg, ts, ts)


def _generate_fleur_de_lis(defn: PatternDefinition) -> np.ndarray:
    """Stylized 3-pronged lily (French fleur-de-lis).

    Path from Material Design Icons (Pictogrammers Free License).
    """
    ts = defn.tile_size
    bg_s = _svg_rgb(defn.background)
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))

    # MDI fleur-de-lis icon, viewBox 0 0 24 24
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
        f'<rect width="24" height="24" fill="{bg_s}"/>'
        f'<path fill="{fg_s}" d="M12 2S9 4 9 7 11 12 11 16H10S10 14 9 12'
        "C7 8 3 10 3 13S5 16 5 16C5 13 8.5 13 8.5 16H7V18H10.5L9 20S10 21"
        " 11 20L12 22L13 20C14 21 15 20 15 20L13.5 18H17V16H15.5C15.5 13"
        " 19 13 19 16C19 16 21 16 21 13S17 8 15 12C14 14 14 16 14 16H13"
        'C13 12 15 10 15 7S12 2 12 2Z"/>'
        "</svg>"
    )
    return _svg_to_array(svg, ts, ts)


def _generate_paisley(defn: PatternDefinition) -> np.ndarray:
    """Filled teardrop boteh/paisley motif (Indian/Persian)."""
    fg_s = _svg_rgb(defn.foreground or (255, 255, 255))
    bg_s = _svg_rgb(defn.background)

    # Filled teardrop shape with curled tip and inner cutout
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 56">'
        f'<rect width="50" height="56" fill="{bg_s}"/>'
        # Filled teardrop body
        f'<path d="M25 4 C16 4,8 14,8 27 C8 40,16 50,25 50'
        f' C34 50,42 40,42 27 C42 14,34 4,25 4Z" fill="{fg_s}"/>'
        # Inner cutout (same shape smaller) to make it outlined/hollow
        f'<path d="M25 10 C19 10,14 18,14 27 C14 36,19 44,25 44'
        f' C31 44,36 36,36 27 C36 18,31 10,25 10Z" fill="{bg_s}"/>'
        # Curled tip at top
        f'<path d="M25 4 C28 4,32 7,32 11 C32 15,28 15,25 13"'
        f' fill="{fg_s}"/>'
        # Inner dot
        f'<circle cx="25" cy="30" r="4" fill="{fg_s}"/>'
        "</svg>"
    )
    return _svg_to_array(svg, defn.tile_size, defn.tile_size)


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
    "flag_canada": _generate_flag_canada,
    "flag_switzerland": _generate_flag_switzerland,
    "flag_uk": _generate_flag_uk,
    "flag_turkey": _generate_flag_turkey,
    "flag_israel": _generate_flag_israel,
    "flag_scotland": _generate_flag_scotland,
    "flag_jamaica": _generate_flag_jamaica,
    "flag_china": _generate_flag_china,
    "flag_australia": _generate_flag_australia,
    # Phase 1: World patterns
    "seigaiha": _generate_seigaiha,
    "asanoha": _generate_asanoha,
    "shippo": _generate_shippo,
    "islamic_star": _generate_islamic_star,
    "fleur_de_lis": _generate_fleur_de_lis,
    "paisley": _generate_paisley,
    "greek_key": _generate_greek_key,
    "art_deco_fan": _generate_art_deco_fan,
    "uroko": _generate_uroko,
    "eight_point_star": _generate_eight_point_star,
    # Phase 2: East Asian + African + Indian
    "kikko": _generate_kikko,
    "sayagata": _generate_sayagata,
    "chinese_lattice": _generate_chinese_lattice,
    "chinese_coin": _generate_chinese_coin,
    "ruyi_cloud": _generate_ruyi_cloud,
    "dancheong": _generate_dancheong,
    "batik_kawung": _generate_batik_kawung,
    "batik_parang": _generate_batik_parang,
    "karakusa": _generate_karakusa,
    "kolam": _generate_kolam,
    "kente": _generate_kente,
    "mudcloth": _generate_mudcloth,
    "adinkra": _generate_adinkra,
    "shweshwe": _generate_shweshwe,
    # Phase 2b: Japanese + famous + medieval + continental
    "same_komon": _generate_same_komon,
    "kanoko": _generate_kanoko,
    "hishi": _generate_hishi,
    "tachiwaki": _generate_tachiwaki,
    "bishamon_kikko": _generate_bishamon_kikko,
    "quatrefoil": _generate_quatrefoil,
    "herringbone": _generate_herringbone,
    "trellis": _generate_trellis,
    "damask": _generate_damask,
    "camouflage": _generate_camouflage,
    "chainmail": _generate_chainmail,
    "gothic_trefoil": _generate_gothic_trefoil,
    "celtic_knot": _generate_celtic_knot,
    "nordic_snowflake": _generate_nordic_snowflake,
    "nordic_diamond": _generate_nordic_diamond,
    "native_step": _generate_native_step,
}


@lru_cache(maxsize=256)
def generate_pattern_tile(
    defn: PatternDefinition,
    target_w: int = SPRITE_SIZE,
    target_h: int = SPRITE_SIZE,
) -> np.ndarray:
    """Generate a pattern tile and repeat it to fill the target size.

    Returns a float32 RGB array shape (target_h, target_w, 3) in range [0, 1].
    The result is cached — callers must not mutate the returned array.
    """
    generator = _GENERATORS.get(defn.type)
    if generator is None:
        raise ValueError(f"Unknown pattern type: {defn.type}")

    tile = generator(defn)
    ts_h, ts_w = tile.shape[:2]

    reps_y = (target_h + ts_h - 1) // ts_h
    reps_x = (target_w + ts_w - 1) // ts_w
    tiled = np.tile(tile, (reps_y, reps_x, 1))

    result = tiled[:target_h, :target_w, :]
    result.flags.writeable = False
    return result
