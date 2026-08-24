from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageOps

from ..models import LayerIdentifier
from .coat_patterns import (
    apply_coat_pattern,
    normalize_coat_pattern_name,
    required_source_pelts,
)
from .image_ops import (
    add,
    alpha_over,
    apply_mask,
    apply_missing_scar,
    fill_with_colour,
    multiply,
    sanitize_transparency,
    screen,
    tint_image,
)
from .patterns import PatternDefinition, generate_pattern_tile
from .repository import SpriteRepository
from .sprite_mapper import SpriteMapper

logger = logging.getLogger("renderer.v3")

SCARS_PRIMARY = {
    "ONE",
    "TWO",
    "THREE",
    "TAILSCAR",
    "SNOUT",
    "CHEEK",
    "SIDE",
    "THROAT",
    "TAILBASE",
    "BELLY",
    "LEGBITE",
    "NECKBITE",
    "FACE",
    "MANLEG",
    "BRIGHTHEART",
    "MANTAIL",
    "BRIDGE",
    "RIGHTBLIND",
    "LEFTBLIND",
    "BOTHBLIND",
    "BEAKCHEEK",
    "BEAKLOWER",
    "CATBITE",
    "RATBITE",
    "QUILLCHUNK",
    "QUILLSCRATCH",
    "HINDLEG",
    "BACK",
    "QUILLSIDE",
    "SCRATCHSIDE",
    "BEAKSIDE",
    "CATBITETWO",
    "FOUR",
    "BURNPAWS",
    "BURNTAIL",
    "BURNBELLY",
    "BURNRUMP",
    "FROSTFACE",
    "SNAKE",
    "SNAKETWO",
    "TOETRAP",
    "TOE",
    "FROSTTAIL",
    "FROSTSOCK",
    "FROSTMITT",
}

SCARS_SECONDARY = {
    "LEFTEAR",
    "RIGHTEAR",
    "NOTAIL",
    "HALFTAIL",
    "NOPAW",
    "NOLEFTEAR",
    "NORIGHTEAR",
    "NOEAR",
}


def _normalize_scar(name: str) -> str:
    return name.strip().replace(" ", "").replace("-", "").upper()


def _is_empty_value(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip().lower() in {"", "none", "null"}
    return False


@dataclass
class StageInfo:
    identifier: LayerIdentifier
    diagnostics: list[str]
    image: Image.Image | None
    blend_mode: str


def _deduplicate(items: list[str]) -> list[str]:
    seen = set()
    result: list[str] = []
    for item in items:
        normalized = item.upper()
        if normalized in seen:
            continue
        seen.add(normalized)
        result.append(item)
    return result


class CatRendererV3:
    def __init__(self, repository: SpriteRepository, mapper: SpriteMapper) -> None:
        self.repo = repository
        self.mapper = mapper

    # ------------------------------------------------------------------
    @staticmethod
    def _truthy(value) -> bool:
        if isinstance(value, str):
            return value.strip().lower() in {"true", "1", "yes", "on"}
        return bool(value)

    @staticmethod
    def _sprite_number(params: dict) -> int:
        try:
            return int(params.get("spriteNumber", 0))
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _pose_name(params: dict) -> str | None:
        pose_name = params.get("poseName") or params.get("pose_name")
        if _is_empty_value(pose_name):
            return None
        return str(pose_name)

    def _get_sprite(self, sprite_name: str, params: dict) -> Image.Image:
        return self.repo.get_sprite(
            sprite_name,
            self._sprite_number(params),
            self._pose_name(params),
        )

    def _get_missing_scar_mask(self, scar_name: str, params: dict) -> Image.Image:
        return self.repo.get_missing_scar_mask(
            scar_name,
            self._sprite_number(params),
            self._pose_name(params),
        )

    # ------------------------------------------------------------------
    def render(self, params: dict) -> tuple[Image.Image, list[StageInfo]]:
        canvas = self.repo.blank_canvas()
        stages: list[StageInfo] = []
        reverse = self._truthy(params.get("reverse"))

        stage_sequence = [
            self._stage_base,
            self._stage_coat_pattern,
            self._stage_tint,
            self._stage_white_patches,
            self._stage_points,
            self._stage_vitiligo,
            self._stage_eyes,
            self._stage_scar_primary,
            self._stage_shading,
            self._stage_lighting,
            self._stage_dark_forest,
            self._stage_lineart,
            self._stage_skin,
            self._stage_scar_secondary,
            self._stage_accessories,
        ]

        for stage_fn in stage_sequence:
            overlay, diagnostics, blend, identifier = stage_fn(params, canvas)
            if overlay is None:
                continue

            if blend == "alpha":
                canvas = alpha_over(canvas, overlay)
            elif blend == "multiply":
                canvas = multiply(canvas, overlay)
            elif blend == "screen":
                canvas = screen(canvas, overlay)
            elif blend == "add":
                canvas = add(canvas, overlay)
            elif blend == "replace":
                canvas = overlay
            else:
                canvas = alpha_over(canvas, overlay)

            stages.append(StageInfo(identifier, diagnostics, overlay, blend))

        if reverse:
            canvas = ImageOps.mirror(canvas)
            for info in stages:
                if info.image is not None:
                    info.image = ImageOps.mirror(info.image)

        canvas = sanitize_transparency(canvas)
        return canvas, stages

    # ------------------------------------------------------------------
    def _base_pelt_specs(self, params: dict) -> list[tuple[object, object, object]]:
        pelt_name = params.get("peltName")
        colour = params.get("colour") or "WHITE"
        specs: list[tuple[object, object, object]] = [(pelt_name, colour, None)]

        if not params.get("isTortie"):
            return specs
        if isinstance(params.get("tortie"), list) and params["tortie"]:
            specs.extend(
                (
                    layer.get("pattern"),
                    layer.get("colour") or "GINGER",
                    layer.get("mask"),
                )
                for layer in params["tortie"]
                if layer
            )
        elif params.get("tortiePattern") and params.get("tortiePattern") != "none":
            specs.append(
                (
                    params.get("tortiePattern"),
                    params.get("tortieColour") or "GINGER",
                    params.get("tortieMask"),
                )
            )
        return specs

    def _build_pelt_layers(
        self, params: dict, specs: list[tuple[object, object, object]]
    ) -> list[Image.Image]:
        layers: list[Image.Image] = []
        for pattern, colour, mask in specs:
            layer = self._build_pelt_layer(pattern, colour, params)
            if layer is None:
                continue
            if mask:
                mask_sprite = self._load_tortie_mask(mask, params)
                if mask_sprite:
                    layer = apply_mask(layer, mask_sprite)
            layers.append(layer)
        return layers

    def _stage_base(self, params: dict, canvas: Image.Image):
        layers = self._build_pelt_layers(params, self._base_pelt_specs(params))

        if not layers:
            return None, ["base:missing"], "alpha", LayerIdentifier.base

        overlay = self.repo.blank_canvas()
        for layer in layers:
            overlay = alpha_over(overlay, layer)
        return overlay, ["base"] * len(layers), "alpha", LayerIdentifier.base

    def _stage_coat_pattern(self, params: dict, canvas: Image.Image):
        pattern_name = normalize_coat_pattern_name(params.get("coatPattern"))
        if pattern_name is None or canvas.getbbox() is None:
            return None, [], "replace", LayerIdentifier.coat_pattern

        colour = params.get("colour") or "WHITE"
        flat_reference = self._build_pelt_layer("SingleColour", colour, params)
        if flat_reference is None:
            logger.warning(
                "Coat pattern %s is missing the SingleColour reference",
                pattern_name,
            )
            return (
                canvas.copy(),
                [f"coat-pattern:{pattern_name}:missing:SingleColour"],
                "replace",
                LayerIdentifier.coat_pattern,
            )

        source_pelts = {}
        required_pelts = required_source_pelts(pattern_name)
        for pelt_name in required_pelts:
            source = self._build_pelt_layer(pelt_name, colour, params)
            if source is not None:
                source_pelts[pelt_name] = source
        missing_pelts = [
            pelt_name for pelt_name in required_pelts if pelt_name not in source_pelts
        ]
        if missing_pelts:
            missing_label = ",".join(missing_pelts)
            logger.warning(
                "Coat pattern %s is missing source pelts: %s",
                pattern_name,
                missing_label,
            )
            return (
                canvas.copy(),
                [f"coat-pattern:{pattern_name}:missing:{missing_label}"],
                "replace",
                LayerIdentifier.coat_pattern,
            )
        base_layer = self._build_pelt_layer(
            params.get("peltName"),
            colour,
            params,
        )
        if base_layer is None:
            return None, [], "replace", LayerIdentifier.coat_pattern

        patterned_base = apply_coat_pattern(
            base_layer,
            pattern_name,
            flat_reference,
            source_pelts,
        )
        tortie_layers = self._build_pelt_layers(
            params,
            self._base_pelt_specs(params)[1:],
        )
        overlay = patterned_base
        for layer in tortie_layers:
            overlay = alpha_over(overlay, layer)
        return (
            overlay,
            [f"coat-pattern:{pattern_name}"],
            "replace",
            LayerIdentifier.coat_pattern,
        )

    # ------------------------------------------------------------------
    def _build_pelt_layer(self, pattern, colour, params):
        if not pattern:
            return None
        raw_colour = colour or "WHITE"
        definition = self.mapper.get_experimental_definition(raw_colour)
        base_colour = definition.base_colour if definition else raw_colour

        sprite_name = self.mapper.build_sprite_name("pelt", pattern, base_colour)
        if (
            not sprite_name or not self.repo.has_sprite(sprite_name)
        ) and base_colour.upper() != "WHITE":
            sprite_name = self.mapper.build_sprite_name("pelt", pattern, "WHITE")

        if not sprite_name or not self.repo.has_sprite(sprite_name):
            return None

        sprite = self._get_sprite(sprite_name, params).copy()
        if definition:
            sprite = self._apply_experimental_tint(sprite, definition)
        return sprite

    def _load_tortie_mask(self, mask, params):
        if isinstance(mask, Image.Image):
            return mask
        if isinstance(mask, str) and not _is_empty_value(mask):
            mask_name = f"tortiemask{mask}"
            if self.repo.has_sprite(mask_name):
                return self._get_sprite(mask_name, params)
        return None

    def _apply_experimental_tint(self, sprite: Image.Image, definition):
        sprite = sprite.copy()
        arr = np.asarray(sprite, dtype=np.float32) / 255.0
        rgb = arr[..., :3]
        alpha = arr[..., 3:4]

        def parse(values):
            colour = (
                np.array([values[0], values[1], values[2]], dtype=np.float32) / 255.0
            )
            if len(values) >= 4:
                raw_alpha = values[3]
                blend_alpha = raw_alpha / 255.0 if raw_alpha > 1 else raw_alpha
            else:
                blend_alpha = 1.0
            blend_alpha = np.clip(blend_alpha, 0.0, 1.0)
            return colour, blend_alpha

        def blend(rgb, colour, blend_alpha, mode):
            if mode == "multiply":
                blend_rgb = rgb * colour
            elif mode == "screen":
                blend_rgb = 1.0 - (1.0 - rgb) * (1.0 - colour)
            elif mode == "overlay":
                blend_rgb = np.where(
                    rgb <= 0.5,
                    2.0 * rgb * colour,
                    1.0 - 2.0 * (1.0 - rgb) * (1.0 - colour),
                )
            else:
                blend_rgb = rgb
            return (1.0 - blend_alpha) * rgb + blend_alpha * blend_rgb

        if definition.pattern:
            try:
                h, w = rgb.shape[:2]
                pat_def = PatternDefinition.from_dict(definition.pattern)
                pattern_rgb = generate_pattern_tile(pat_def, w, h)
                rgb = rgb * pattern_rgb
            except Exception:
                logger.exception(
                    "Pattern generation failed, skipping multiply. pattern=%r",
                    definition.pattern,
                )
        elif definition.multiply:
            colour, blend_alpha = parse(definition.multiply)
            rgb = blend(rgb, colour, blend_alpha, "multiply")

        if definition.screen:
            colour, blend_alpha = parse(definition.screen)
            rgb = blend(rgb, colour, blend_alpha, "screen")
        if definition.overlay:
            colour, blend_alpha = parse(definition.overlay)
            rgb = blend(rgb, colour, blend_alpha, "overlay")

        rgb = np.clip(rgb, 0.0, 1.0)
        arr[..., :3] = rgb
        arr[..., 3:4] = alpha
        arr = np.clip(np.rint(arr * 255.0), 0, 255).astype(np.uint8)
        return Image.fromarray(arr, mode="RGBA")

    # ------------------------------------------------------------------
    def _stage_tint(self, params: dict, canvas: Image.Image):
        tint = self.mapper.get_tint_colour(params.get("tint"))
        dilute = self.mapper.get_dilute_tint_colour(params.get("tint"))
        overlays = []
        diagnostics = []
        if tint:
            overlay = fill_with_colour(
                canvas.size, tuple(int(c) for c in tint[:3]) + (255,), canvas
            )
            overlays.append((overlay, "multiply"))
            diagnostics.append("tint-multiply")
        if dilute:
            overlay = fill_with_colour(
                canvas.size, tuple(int(c) for c in dilute[:3]) + (255,), canvas
            )
            overlays.append((overlay, "add"))
            diagnostics.append("tint-dilute")

        if not overlays:
            return None, [], "alpha", LayerIdentifier.tint

        # Combine overlays sequentially
        result = canvas
        for overlay, mode in overlays:
            if mode == "multiply":
                result = multiply(result, overlay)
            elif mode == "add":
                result = add(result, overlay)
            elif mode == "screen":
                result = screen(result, overlay)
            else:
                result = alpha_over(result, overlay)
        return result, diagnostics, "replace", LayerIdentifier.tint

    def _stage_white_patches(self, params: dict, canvas: Image.Image):
        pattern = params.get("whitePatches")
        if _is_empty_value(pattern):
            return None, [], "alpha", LayerIdentifier.white_patches
        sprite_name = self.mapper.build_sprite_name("white", pattern, None)
        if not sprite_name or not self.repo.has_sprite(sprite_name):
            return None, [f"missing:{pattern}"], "alpha", LayerIdentifier.white_patches
        overlay = self._get_sprite(sprite_name, params)
        tint = self.mapper.get_white_patch_tint(params.get("whitePatchesTint"))
        if tint:
            overlay = tint_image(overlay, [int(c) for c in tint[:3]], mode="multiply")
        return overlay, [f"white:{pattern}"], "alpha", LayerIdentifier.white_patches

    def _stage_points(self, params: dict, canvas: Image.Image):
        pattern = params.get("points")
        if _is_empty_value(pattern):
            return None, [], "alpha", LayerIdentifier.points
        sprite_name = self.mapper.build_sprite_name("white", pattern, None)
        if not sprite_name or not self.repo.has_sprite(sprite_name):
            return None, [f"missing:{pattern}"], "alpha", LayerIdentifier.points
        overlay = self._get_sprite(sprite_name, params)
        return overlay, [f"points:{pattern}"], "alpha", LayerIdentifier.points

    def _stage_vitiligo(self, params: dict, canvas: Image.Image):
        pattern = params.get("vitiligo")
        if _is_empty_value(pattern):
            return None, [], "alpha", LayerIdentifier.vitiligo
        sprite_name = self.mapper.build_sprite_name("white", pattern, None)
        if not sprite_name or not self.repo.has_sprite(sprite_name):
            return None, [f"missing:{pattern}"], "alpha", LayerIdentifier.vitiligo
        overlay = self._get_sprite(sprite_name, params)
        return overlay, [f"vitiligo:{pattern}"], "alpha", LayerIdentifier.vitiligo

    def _stage_eyes(self, params: dict, canvas: Image.Image):
        primary = params.get("eyeColour") or params.get("eyeColor")
        secondary = params.get("eyeColour2") or params.get("eyeColor2")

        overlay = self.repo.blank_canvas()
        diagnostics = []

        if primary:
            name = self.mapper.build_sprite_name("eyes", None, primary)
            if name and self.repo.has_sprite(name):
                eye_sprite = self._get_sprite(name, params)
                overlay = alpha_over(overlay, eye_sprite)
                diagnostics.append(f"eye:{primary}")

        if not _is_empty_value(secondary):
            name = self.mapper.build_sprite_name("eyes", None, str(secondary).upper())
            if self.repo.has_sprite(name):
                eye_sprite = self._get_sprite(name, params)
                mask = self._get_sprite("heterochromiamask", params)
                if mask.getbbox() is not None:
                    eye_sprite = apply_mask(eye_sprite, mask)
                overlay = alpha_over(overlay, eye_sprite)
                diagnostics.append(f"eye2:{secondary}")

        if not diagnostics:
            return None, [], "alpha", LayerIdentifier.eyes

        return overlay, diagnostics, "alpha", LayerIdentifier.eyes

    def _stage_shading(self, params: dict, canvas: Image.Image):
        if not self._truthy(params.get("shading")):
            return None, [], "alpha", LayerIdentifier.tint
        sprite_key = "shaders"
        if not self.repo.has_sprite(sprite_key, self._sprite_number(params)):
            # fallback to legacy names present in some mod packs
            for fallback in ("shadersnewwhite", "lightingnewwhite"):
                if self.repo.has_sprite(fallback, self._sprite_number(params)):
                    sprite_key = fallback
                    break
            else:
                return None, ["missing:shaders"], "alpha", LayerIdentifier.tint

        overlay = self._get_sprite(sprite_key, params)
        return overlay, ["shading"], "multiply", LayerIdentifier.tint

    def _stage_lighting(self, params: dict, canvas: Image.Image):
        lighting_param = params.get("lighting")
        if lighting_param is None or not self._truthy(lighting_param):
            return None, [], "alpha", LayerIdentifier.lighting
        sprite_key = "lighting"
        if not self.repo.has_sprite(sprite_key, self._sprite_number(params)):
            return None, ["missing:lighting"], "alpha", LayerIdentifier.lighting
        overlay = self._get_sprite(sprite_key, params)
        return overlay, ["lighting"], "alpha", LayerIdentifier.lighting

    def _stage_dark_forest(self, params: dict, canvas: Image.Image):
        if not (params.get("darkForest") or params.get("darkMode")):
            return None, [], "alpha", LayerIdentifier.tint
        overlay = fill_with_colour(canvas.size, (120, 30, 30, 200), canvas)
        return overlay, ["darkForest"], "multiply", LayerIdentifier.tint

    def _stage_lineart(self, params: dict, canvas: Image.Image):
        if params.get("dead"):
            sprite_name = "lineartdead"
        elif params.get("darkForest") or params.get("darkMode"):
            sprite_name = "lineartdf"
        else:
            sprite_name = "lines"
        if not self.repo.has_sprite(sprite_name, self._sprite_number(params)):
            return None, [f"missing:{sprite_name}"], "alpha", LayerIdentifier.lineart
        overlay = self._get_sprite(sprite_name, params)
        return overlay, [sprite_name.lower()], "alpha", LayerIdentifier.lineart

    def _stage_skin(self, params: dict, canvas: Image.Image):
        skin = params.get("skinColour") or params.get("skinColor")
        if _is_empty_value(skin):
            return None, [], "alpha", LayerIdentifier.skin
        sprite_name = self.mapper.build_sprite_name("skin", None, skin)
        if not sprite_name or not self.repo.has_sprite(sprite_name):
            return None, [f"missing:{skin}"], "alpha", LayerIdentifier.skin
        overlay = self._get_sprite(sprite_name, params)
        return overlay, [f"skin:{skin}"], "alpha", LayerIdentifier.skin

    def _stage_scar_primary(self, params: dict, canvas: Image.Image):
        scars_raw: list[str] = []
        if isinstance(params.get("scars"), list):
            scars_raw.extend(str(s) for s in params["scars"] if not _is_empty_value(s))
        if isinstance(params.get("scarSlots"), list):
            scars_raw.extend(
                str(s) for s in params["scarSlots"] if not _is_empty_value(s)
            )
        if not _is_empty_value(params.get("scar")):
            scars_raw.append(str(params.get("scar")))
        scars = _deduplicate(scars_raw)
        if not scars:
            return None, [], "alpha", LayerIdentifier.scars_primary
        overlay = self.repo.blank_canvas()
        diagnostics = []
        for scar in scars:
            normalized = _normalize_scar(scar)
            if normalized not in SCARS_PRIMARY:
                continue
            candidates = [
                self.mapper.build_sprite_name("scars", normalized, None),
                self.mapper.build_sprite_name("scar", normalized, None),
                f"scars{normalized}",
                f"scar{normalized}",
            ]
            sprite = None
            for candidate in candidates:
                if candidate and self.repo.has_sprite(candidate):
                    sprite = self._get_sprite(candidate, params)
                    diagnostics.append(candidate)
                    break
            if sprite is None:
                diagnostics.append(f"missing:{scar}")
                continue
            overlay = alpha_over(overlay, sprite)
        if not diagnostics:
            return None, [], "alpha", LayerIdentifier.scars_primary
        return overlay, diagnostics, "alpha", LayerIdentifier.scars_primary

    def _stage_scar_secondary(self, params: dict, canvas: Image.Image):
        scars_raw: list[str] = []
        if isinstance(params.get("scars"), list):
            scars_raw.extend(str(s) for s in params["scars"] if not _is_empty_value(s))
        if isinstance(params.get("scarSlots"), list):
            scars_raw.extend(
                str(s) for s in params["scarSlots"] if not _is_empty_value(s)
            )
        if not _is_empty_value(params.get("scar")):
            scars_raw.append(str(params.get("scar")))
        scars = _deduplicate(scars_raw)
        if not scars:
            return None, [], "alpha", LayerIdentifier.scars_secondary

        diagnostics: list[str] = []
        current = canvas.copy()

        for scar in scars:
            normalized = _normalize_scar(scar)
            if normalized not in SCARS_SECONDARY:
                continue
            mask = self._get_missing_scar_mask(normalized, params)
            mask_alpha = np.array(mask.split()[3], dtype=np.uint16)
            if mask_alpha.max() == 0:
                continue
            diagnostics.append(f"missingscars{normalized}")
            current = apply_missing_scar(current, mask)

        if not diagnostics:
            return None, [], "alpha", LayerIdentifier.scars_secondary

        return current, diagnostics, "replace", LayerIdentifier.scars_secondary

    def _stage_accessories(self, params: dict, canvas: Image.Image):
        accessories_raw: list[str] = []
        if isinstance(params.get("accessories"), list):
            accessories_raw.extend(
                str(a) for a in params["accessories"] if not _is_empty_value(a)
            )
        if not _is_empty_value(params.get("accessory")):
            accessories_raw.append(str(params.get("accessory")))
        valid_accessories = [acc for acc in accessories_raw if acc]
        if not valid_accessories:
            return None, [], "alpha", LayerIdentifier.accessories
        overlay = self.repo.blank_canvas()
        diagnostics = []
        for accessory in valid_accessories:
            sprite_name = self._resolve_accessory(str(accessory))
            if not sprite_name or not self.repo.has_sprite(sprite_name):
                continue
            overlay = alpha_over(overlay, self._get_sprite(sprite_name, params))
            diagnostics.append(sprite_name)
        if not diagnostics:
            return None, [], "alpha", LayerIdentifier.accessories
        return overlay, diagnostics, "alpha", LayerIdentifier.accessories

    def _resolve_accessory(self, name: str) -> str | None:
        sprite_name = self.mapper.accessory_sprite_name(name)
        if sprite_name and self.repo.has_sprite(sprite_name):
            return sprite_name

        raw = name.strip()
        upper = raw.upper()
        options = [
            raw,
            upper,
            raw.replace(" ", ""),
            upper.replace(" ", ""),
            f"collars{upper}",
            f"collars{raw}",
            f"acc_herbs{raw}",
            f"acc_herbs{upper}",
            f"acc_wild{raw}",
            f"acc_wild{upper}",
        ]
        for option in options:
            if self.repo.has_sprite(option):
                return option
        return None
