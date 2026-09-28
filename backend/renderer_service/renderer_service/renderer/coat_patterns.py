"""Pose-aware coat markings derived from the original 50 px pelt sprites.

Each experimental pattern borrows placement from one or more existing pelt
frames for the requested pose. The recipes only select or combine whole
source pixels. They never stamp a repeating texture across the cat.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence

import numpy as np
from PIL import Image

COAT_PATTERN_NAMES = (
    "bengal-rosettes",
    "clouded-leopard",
    "ocelot-chains",
    "serval-spots",
    "snow-leopard",
    "tiger-stripes",
    "king-cheetah",
    "lynx-fleck",
    "marble-swirl",
    "brindle",
    "jaguar-mosaic",
    "cheetah-dots",
    "fishing-cat",
    "toyger-braids",
    "sandcat-bars",
    "classic-bullseye",
    "ridgeback",
    "masked-mantle",
    "ghost-stripes",
    "split-marble",
)

_PATTERN_SOURCES: dict[str, tuple[str, ...]] = {
    "bengal-rosettes": ("Rosette", "Speckled"),
    "clouded-leopard": ("Classic", "Sokoke"),
    "ocelot-chains": ("Rosette", "Bengal"),
    "serval-spots": ("Speckled", "Ticked"),
    "snow-leopard": ("Rosette", "Ticked"),
    "tiger-stripes": ("Mackerel", "Tabby"),
    "king-cheetah": ("Speckled", "Bengal", "Mackerel"),
    "lynx-fleck": ("Ticked", "Speckled"),
    "marble-swirl": ("Marbled", "Sokoke"),
    "brindle": ("Mackerel", "Tabby"),
    "jaguar-mosaic": ("Bengal", "Rosette"),
    "cheetah-dots": ("Speckled", "Rosette", "Bengal"),
    "fishing-cat": ("Mackerel", "Speckled", "Bengal"),
    "toyger-braids": ("Bengal", "Mackerel", "Masked"),
    "sandcat-bars": ("Mackerel", "Ticked", "Agouti"),
    "classic-bullseye": ("Classic", "Marbled"),
    "ridgeback": ("Singlestripe", "Ticked"),
    "masked-mantle": ("Masked", "Ticked", "Smoke", "Agouti"),
    "ghost-stripes": ("Mackerel", "Tabby", "Smoke"),
    "split-marble": ("Classic", "Sokoke", "Marbled"),
}

_LUMA_WEIGHTS = np.array([0.299, 0.587, 0.114], dtype=np.float32)
_MARKING_THRESHOLD = 18.0
_DARKEST_SOURCE = "__darkest_source__"


def normalize_coat_pattern_name(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = "-".join(value.strip().lower().replace("_", " ").split())
    return normalized if normalized in _PATTERN_SOURCES else None


def required_source_pelts(pattern_name: str) -> tuple[str, ...]:
    """Return the existing pelt families used to place a new pattern."""

    normalized = normalize_coat_pattern_name(pattern_name)
    if normalized is None:
        return ()
    return _PATTERN_SOURCES[normalized]


def _neighbour_count(mask: np.ndarray) -> np.ndarray:
    padded = np.pad(mask.astype(np.uint8), 1)
    height, width = mask.shape
    result = np.zeros((height, width), dtype=np.uint8)
    for y_offset in range(3):
        for x_offset in range(3):
            if (x_offset, y_offset) == (1, 1):
                continue
            result += padded[
                y_offset : y_offset + height,
                x_offset : x_offset + width,
            ]
    return result


def _dilate(mask: np.ndarray) -> np.ndarray:
    return mask | (_neighbour_count(mask) > 0)


def _erode(mask: np.ndarray) -> np.ndarray:
    return mask & (_neighbour_count(mask) == 8)


def _outline(mask: np.ndarray) -> np.ndarray:
    """Keep a one-pixel rim without adding pixels outside the source mark."""

    return mask & ~_erode(mask)


def _components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    """Find four-connected source marks in stable top-to-bottom order."""

    height, width = mask.shape
    seen = np.zeros((height, width), dtype=bool)
    found: list[list[tuple[int, int]]] = []

    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue

        found.append(_component_from_seed(mask, seen, int(y), int(x)))

    return found


def _component_from_seed(
    mask: np.ndarray, seen: np.ndarray, start_y: int, start_x: int
) -> list[tuple[int, int]]:
    height, width = mask.shape
    component: list[tuple[int, int]] = []
    pending = [(start_y, start_x)]
    seen[start_y, start_x] = True
    while pending:
        current_y, current_x = pending.pop()
        component.append((current_y, current_x))
        for y_offset, x_offset in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            next_y = current_y + y_offset
            next_x = current_x + x_offset
            if (
                0 <= next_y < height
                and 0 <= next_x < width
                and mask[next_y, next_x]
                and not seen[next_y, next_x]
            ):
                seen[next_y, next_x] = True
                pending.append((next_y, next_x))
    return component


def _select_components(
    mask: np.ndarray,
    *,
    minimum_size: int = 1,
    maximum_size: int = 2_500,
    step: int = 1,
    phase: int = 0,
) -> np.ndarray:
    """Keep whole source marks by size, optionally taking every nth mark."""

    selected = np.zeros_like(mask, dtype=bool)
    eligible = [
        component
        for component in _components(mask)
        if minimum_size <= len(component) <= maximum_size
    ]
    for component in eligible[phase::step]:
        for y, x in component:
            selected[y, x] = True
    return selected


def _marking_mask(flat: np.ndarray, source: np.ndarray) -> np.ndarray:
    """Find pattern pixels relative to the matching flat pelt frame."""

    flat_luma = flat[..., :3].astype(np.float32) @ _LUMA_WEIGHTS
    source_luma = source[..., :3].astype(np.float32) @ _LUMA_WEIGHTS
    shared_shape = (flat[..., 3] > 0) & (source[..., 3] > 0)
    luma_delta = flat_luma - source_luma
    darker = shared_shape & (luma_delta > _MARKING_THRESHOLD)
    if darker.any():
        return darker

    # Some palettes, notably GHOST, draw their markings lighter than the flat
    # pelt. Use that contrast when the source frame contains no dark marks.
    return shared_shape & (luma_delta < -_MARKING_THRESHOLD)


def _recipe_bengal_rosettes(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    rosettes = masks["Rosette"]
    small_accents = _select_components(
        masks["Speckled"] & ~_dilate(rosettes),
        maximum_size=3,
        step=2,
    )
    return (("Rosette", rosettes), ("Speckled", small_accents))


def _recipe_clouded_leopard(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    cloud_rims = _outline(masks["Classic"])
    lower_echo = _outline(masks["Sokoke"]) & ~_dilate(cloud_rims)
    return (("Classic", cloud_rims), ("Sokoke", lower_echo))


def _recipe_ocelot_chains(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    chain_rims = _outline(
        _select_components(
            masks["Rosette"],
            minimum_size=4,
            step=2,
        )
    )
    chain_links = _select_components(
        masks["Bengal"] & ~_dilate(chain_rims),
        maximum_size=5,
    )
    return (("Rosette", chain_rims), ("Bengal", chain_links))


def _recipe_serval_spots(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    spots = _select_components(masks["Speckled"], maximum_size=6)
    face_and_leg_marks = _select_components(
        masks["Ticked"] & ~_dilate(spots),
        maximum_size=3,
        step=2,
    )
    return (("Speckled", spots), ("Ticked", face_and_leg_marks))


def _recipe_snow_leopard(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    sparse_rosettes = _select_components(
        masks["Rosette"],
        maximum_size=12,
        step=2,
    )
    dust = _select_components(
        masks["Ticked"] & ~_dilate(sparse_rosettes),
        maximum_size=3,
        step=3,
    )
    return (("Rosette", sparse_rosettes), ("Ticked", dust))


def _recipe_tiger_stripes(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    stripe_cores = masks["Mackerel"] & _dilate(masks["Tabby"])
    short_tips = _select_components(
        masks["Mackerel"] & ~_dilate(stripe_cores),
        maximum_size=4,
        step=2,
    )
    return (("Mackerel", stripe_cores), ("Mackerel", short_tips))


def _recipe_king_cheetah(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    spots = _select_components(
        masks["Speckled"],
        maximum_size=6,
        step=2,
    )
    dorsal_blots = masks["Bengal"] & _dilate(masks["Mackerel"]) & ~_dilate(spots)
    return (("Speckled", spots), ("Bengal", dorsal_blots))


def _recipe_lynx_fleck(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    ticks = masks["Ticked"]
    flecks = _select_components(
        masks["Speckled"] & ~_dilate(ticks),
        maximum_size=2,
        step=2,
    )
    return (("Ticked", ticks), ("Speckled", flecks))


def _recipe_marble_swirl(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    lace = _outline(masks["Marbled"])
    knots = masks["Sokoke"] & masks["Marbled"] & ~lace
    return (("Marbled", lace), ("Sokoke", knots))


def _recipe_brindle(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    mackerel_only = masks["Mackerel"] & ~masks["Tabby"]
    tabby_only = masks["Tabby"] & ~masks["Mackerel"]
    crossed_marks = _outline(masks["Mackerel"] & masks["Tabby"])
    return (
        ("Tabby", tabby_only),
        ("Mackerel", mackerel_only),
        ("Mackerel", crossed_marks),
    )


def _recipe_jaguar_mosaic(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    broken_rims = _outline(masks["Bengal"])
    centres = masks["Rosette"] & _dilate(masks["Bengal"]) & ~broken_rims
    return ((_DARKEST_SOURCE, broken_rims), ("Rosette", centres))


def _recipe_cheetah_dots(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    dot_cores = _erode(masks["Speckled"])
    loose_dots = _select_components(
        masks["Rosette"] & ~_dilate(dot_cores),
        maximum_size=3,
        step=2,
    )
    return (
        (_DARKEST_SOURCE, dot_cores),
        (_DARKEST_SOURCE, loose_dots),
    )


def _recipe_fishing_cat(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    short_bars = masks["Mackerel"] & masks["Speckled"]
    spots = _select_components(
        masks["Speckled"] & ~_dilate(short_bars),
        maximum_size=5,
        step=2,
    )
    return (
        (_DARKEST_SOURCE, short_bars),
        (_DARKEST_SOURCE, spots),
    )


def _recipe_toyger_braids(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    curved_bars = masks["Bengal"] & _dilate(masks["Mackerel"])
    bridges = masks["Masked"] & masks["Mackerel"] & ~_dilate(curved_bars)
    return (
        (_DARKEST_SOURCE, curved_bars),
        (_DARKEST_SOURCE, bridges),
    )


def _recipe_sandcat_bars(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    quiet_bars = masks["Mackerel"] & masks["Ticked"]
    small_points = masks["Agouti"] & ~_dilate(quiet_bars)
    return (("Mackerel", quiet_bars), ("Agouti", small_points))


def _recipe_classic_bullseye(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    outer_rings = _outline(masks["Classic"])
    dark_centres = _erode(masks["Marbled"]) & masks["Classic"]
    return (
        (_DARKEST_SOURCE, outer_rings),
        (_DARKEST_SOURCE, dark_centres),
    )


def _recipe_ridgeback(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    ridge = masks["Singlestripe"]
    edge_ticks = masks["Ticked"] & ~_dilate(ridge)
    return (("Singlestripe", ridge), ("Ticked", edge_ticks))


def _recipe_masked_mantle(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    mantle = masks["Masked"] & ~_dilate(masks["Ticked"])
    smoke_points = masks["Smoke"] & masks["Agouti"]
    return (("Masked", mantle), ("Smoke", smoke_points))


def _recipe_ghost_stripes(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    stripe_shape = masks["Mackerel"] & masks["Tabby"]
    return (("Smoke", stripe_shape),)


def _recipe_split_marble(
    masks: Mapping[str, np.ndarray],
) -> Sequence[tuple[str, np.ndarray]]:
    classic_half = masks["Classic"] & ~masks["Sokoke"]
    sokoke_half = masks["Sokoke"] & ~masks["Classic"]
    shared_knots = _erode(masks["Marbled"]) & masks["Classic"]
    return (
        (_DARKEST_SOURCE, classic_half),
        (_DARKEST_SOURCE, sokoke_half),
        (_DARKEST_SOURCE, shared_knots),
    )


_RECIPES: dict[
    str, Callable[[Mapping[str, np.ndarray]], Sequence[tuple[str, np.ndarray]]]
] = {
    "bengal-rosettes": _recipe_bengal_rosettes,
    "clouded-leopard": _recipe_clouded_leopard,
    "ocelot-chains": _recipe_ocelot_chains,
    "serval-spots": _recipe_serval_spots,
    "snow-leopard": _recipe_snow_leopard,
    "tiger-stripes": _recipe_tiger_stripes,
    "king-cheetah": _recipe_king_cheetah,
    "lynx-fleck": _recipe_lynx_fleck,
    "marble-swirl": _recipe_marble_swirl,
    "brindle": _recipe_brindle,
    "jaguar-mosaic": _recipe_jaguar_mosaic,
    "cheetah-dots": _recipe_cheetah_dots,
    "fishing-cat": _recipe_fishing_cat,
    "toyger-braids": _recipe_toyger_braids,
    "sandcat-bars": _recipe_sandcat_bars,
    "classic-bullseye": _recipe_classic_bullseye,
    "ridgeback": _recipe_ridgeback,
    "masked-mantle": _recipe_masked_mantle,
    "ghost-stripes": _recipe_ghost_stripes,
    "split-marble": _recipe_split_marble,
}


def _recipe(
    pattern_name: str, masks: Mapping[str, np.ndarray]
) -> Sequence[tuple[str, np.ndarray]]:
    recipe = _RECIPES.get(pattern_name)
    if recipe is None:
        return ()
    return recipe(masks)


def apply_coat_pattern(
    base: Image.Image,
    pattern_name: str,
    flat_reference: Image.Image,
    source_pelts: Mapping[str, Image.Image],
) -> Image.Image:
    """Apply a pose-specific pixel recipe while preserving the base alpha."""

    normalized = normalize_coat_pattern_name(pattern_name)
    if normalized is None:
        return base.copy()

    required_sources = required_source_pelts(normalized)
    if any(source_name not in source_pelts for source_name in required_sources):
        return base.copy()

    output = np.asarray(base.convert("RGBA"), dtype=np.uint8).copy()
    flat = np.asarray(flat_reference.convert("RGBA"), dtype=np.uint8)
    if flat.shape != output.shape:
        return base.copy()

    source_arrays: dict[str, np.ndarray] = {}
    masks: dict[str, np.ndarray] = {}
    for source_name in required_sources:
        source = np.asarray(source_pelts[source_name].convert("RGBA"), dtype=np.uint8)
        if source.shape != output.shape:
            return base.copy()
        source_arrays[source_name] = source
        masks[source_name] = _marking_mask(flat, source)

    darkest_source = next(iter(source_arrays.values())).copy()
    darkest_luma = darkest_source[..., :3].astype(np.float32) @ _LUMA_WEIGHTS
    for source in source_arrays.values():
        source_luma = source[..., :3].astype(np.float32) @ _LUMA_WEIGHTS
        source_visible = source[..., 3] > 0
        darkest_visible = darkest_source[..., 3] > 0
        darker = source_visible & (~darkest_visible | (source_luma < darkest_luma))
        darkest_source[darker] = source[darker]
        darkest_luma[darker] = source_luma[darker]
    source_arrays[_DARKEST_SOURCE] = darkest_source

    visible = output[..., 3] > 0
    for source_name, marking_mask in _recipe(normalized, masks):
        selected = marking_mask & visible
        output[selected, :3] = source_arrays[source_name][selected, :3]

    # A valid recipe can collapse to an empty intersection for a particular
    # pose and palette. Keep it visible by falling back to the first source's
    # own marking pixels, still reusing only pixels from that exact frame.
    base_pixels = np.asarray(base.convert("RGBA"), dtype=np.uint8)
    if np.array_equal(output, base_pixels):
        for source_name in required_sources:
            source = source_arrays[source_name]
            selected = (
                masks[source_name]
                & visible
                & np.any(source[..., :3] != base_pixels[..., :3], axis=-1)
            )
            if selected.any():
                output[selected, :3] = source[selected, :3]
                break

    return Image.fromarray(output, mode="RGBA")
