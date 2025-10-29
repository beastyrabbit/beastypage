from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageOps

from .image_ops import add, fill_with_colour, multiply, overlay, screen, apply_mask, apply_missing_scar, tint_image, sanitize_transparency, alpha_over
from .repository import SpriteRepository
from .sprite_mapper import SpriteMapper
from ..models import LayerIdentifier

SCARS_PRIMARY = {
    "ONE", "TWO", "THREE", "TAILSCAR", "SNOUT", "CHEEK", "SIDE", "THROAT", "TAILBASE",
    "BELLY", "LEGBITE", "NECKBITE", "FACE", "MANLEG", "BRIGHTHEART", "MANTAIL", "BRIDGE",
    "RIGHTBLIND", "LEFTBLIND", "BOTHBLIND", "BEAKCHEEK", "BEAKLOWER", "CATBITE", "RATBITE",
    "QUILLCHUNK", "QUILLSCRATCH", "HINDLEG", "BACK", "QUILLSIDE", "SCRATCHSIDE", "BEAKSIDE",
    "CATBITETWO", "FOUR", "BURNPAWS", "BURNTAIL", "BURNBELLY", "BURNRUMP", "FROSTFACE",
    "SNAKE", "SNAKETWO", "TOETRAP", "TOE", "FROSTTAIL", "FROSTSOCK", "FROSTMITT",
}

SCARS_SECONDARY = {
    "LEFTEAR", "RIGHTEAR", "NOTAIL", "HALFTAIL", "NOPAW", "NOLEFTEAR", "NORIGHTEAR", "NOEAR"
}


def _normalize_scar(name: str) -> str:
    return name.strip().replace(" ", "").replace("-", "").upper()


@dataclass
class StageInfo:
    identifier: LayerIdentifier
    diagnostics: List[str]
    image: Optional[Image.Image]
    blend_mode: str


def _deduplicate(items: List[str]) -> List[str]:
    seen = set()
    result: List[str] = []
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

    # ------------------------------------------------------------------
    def render(self, params: Dict) -> tuple[Image.Image, List[StageInfo]]:
        canvas = self.repo.blank_canvas()
        stages: List[StageInfo] = []
        reverse = self._truthy(params.get("reverse"))

        stage_sequence = [
            self._stage_base,
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
    def _stage_base(self, params: Dict, canvas: Image.Image):
        sprite_number = int(params.get("spriteNumber", 0))
        pelt_name = params.get("peltName")
        colour = params.get("colour") or "WHITE"

        layers: List[Tuple[Image.Image, Optional[Image.Image]]] = []

        def draw(pattern, colour, mask=None):
            base = self._build_pelt_layer(pattern, colour, sprite_number)
            if base is None:
                return
            mask_sprite = None
            if mask:
                mask_sprite = self._load_tortie_mask(mask, sprite_number)
                if mask_sprite:
                    base = apply_mask(base, mask_sprite)
            layers.append((base, mask_sprite))

        if params.get("isTortie"):
            if isinstance(params.get("tortie"), list) and params["tortie"]:
                draw(pelt_name, colour)
                for layer in params["tortie"]:
                    if not layer:
                        continue
                    draw(layer.get("pattern"), layer.get("colour") or "GINGER", layer.get("mask"))
            elif params.get("tortiePattern") and params.get("tortiePattern") != "none":
                draw(pelt_name, colour)
                draw(params.get("tortiePattern"), params.get("tortieColour") or "GINGER", params.get("tortieMask"))
            else:
                draw(pelt_name, colour)
        else:
            draw(pelt_name, colour)

        if not layers:
            return None, ["base:missing"], "alpha", LayerIdentifier.base

        overlay = self.repo.blank_canvas()
        for layer, _mask in layers:
            overlay = alpha_over(overlay, layer)
        return overlay, ["base"] * len(layers), "alpha", LayerIdentifier.base

    # ------------------------------------------------------------------
    def _build_pelt_layer(self, pattern, colour, sprite_number):
        if not pattern:
            return None
        raw_colour = (colour or "WHITE")
        definition = self.mapper.get_experimental_definition(raw_colour)
        base_colour = definition.base_colour if definition else raw_colour

        sprite_name = self.mapper.build_sprite_name("pelt", pattern, base_colour)
        if (not sprite_name or not self.repo.has_sprite(sprite_name)) and base_colour.upper() != "WHITE":
            sprite_name = self.mapper.build_sprite_name("pelt", pattern, "WHITE")

        if not sprite_name or not self.repo.has_sprite(sprite_name):
            return None

        sprite = self.repo.get_sprite(sprite_name, sprite_number).copy()
        if definition:
            sprite = self._apply_experimental_tint(sprite, definition)
        return sprite

    def _load_tortie_mask(self, mask, sprite_number):
        if isinstance(mask, Image.Image):
            return mask
        if isinstance(mask, str) and mask.lower() != "none":
            mask_name = f"tortiemask{mask}"
            if self.repo.has_sprite(mask_name):
                return self.repo.get_sprite(mask_name, sprite_number)
        return None

    def _apply_experimental_tint(self, sprite: Image.Image, definition):
        sprite = sprite.copy()
        arr = np.asarray(sprite, dtype=np.float32) / 255.0
        rgb = arr[..., :3]
        alpha = arr[..., 3:4]

        def parse(values):
            colour = np.array([values[0], values[1], values[2]], dtype=np.float32) / 255.0
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

        if definition.multiply:
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
    def _stage_tint(self, params: Dict, canvas: Image.Image):
        tint = self.mapper.get_tint_colour(params.get("tint"))
        dilute = self.mapper.get_dilute_tint_colour(params.get("tint"))
        overlays = []
        diagnostics = []
        if tint:
            overlay = fill_with_colour(canvas.size, tuple(int(c) for c in tint[:3]) + (255,), canvas)
            overlays.append((overlay, "multiply"))
            diagnostics.append("tint-multiply")
        if dilute:
            overlay = fill_with_colour(canvas.size, tuple(int(c) for c in dilute[:3]) + (255,), canvas)
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

    def _stage_white_patches(self, params: Dict, canvas: Image.Image):
        pattern = params.get("whitePatches")
        if not pattern or pattern == "none":
            return None, [], "alpha", LayerIdentifier.white_patches
        sprite_number = int(params.get("spriteNumber", 0))
        sprite_name = self.mapper.build_sprite_name("white", pattern, None)
        if not sprite_name or not self.repo.has_sprite(sprite_name):
            return None, [f"missing:{pattern}"], "alpha", LayerIdentifier.white_patches
        overlay = self.repo.get_sprite(sprite_name, sprite_number)
        tint = self.mapper.get_white_patch_tint(params.get("whitePatchesTint"))
        if tint:
            overlay = tint_image(overlay, [int(c) for c in tint[:3]], mode="multiply")
        return overlay, [f"white:{pattern}"], "alpha", LayerIdentifier.white_patches

    def _stage_points(self, params: Dict, canvas: Image.Image):
        pattern = params.get("points")
        if not pattern or pattern == "none":
            return None, [], "alpha", LayerIdentifier.points
        sprite_number = int(params.get("spriteNumber", 0))
        sprite_name = self.mapper.build_sprite_name("white", pattern, None)
        if not sprite_name or not self.repo.has_sprite(sprite_name):
            return None, [f"missing:{pattern}"], "alpha", LayerIdentifier.points
        overlay = self.repo.get_sprite(sprite_name, sprite_number)
        return overlay, [f"points:{pattern}"], "alpha", LayerIdentifier.points

    def _stage_vitiligo(self, params: Dict, canvas: Image.Image):
        pattern = params.get("vitiligo")
        if not pattern or pattern == "none":
            return None, [], "alpha", LayerIdentifier.vitiligo
        sprite_number = int(params.get("spriteNumber", 0))
        sprite_name = self.mapper.build_sprite_name("white", pattern, None)
        if not sprite_name or not self.repo.has_sprite(sprite_name):
            return None, [f"missing:{pattern}"], "alpha", LayerIdentifier.vitiligo
        overlay = self.repo.get_sprite(sprite_name, sprite_number)
        return overlay, [f"vitiligo:{pattern}"], "alpha", LayerIdentifier.vitiligo

    def _stage_eyes(self, params: Dict, canvas: Image.Image):
        sprite_number = int(params.get("spriteNumber", 0))
        primary = params.get("eyeColour") or params.get("eyeColor")
        secondary = params.get("eyeColour2") or params.get("eyeColor2")

        overlay = self.repo.blank_canvas()
        diagnostics = []

        if primary:
            name = self.mapper.build_sprite_name("eyes", None, primary)
            if name and self.repo.has_sprite(name):
                eye_sprite = self.repo.get_sprite(name, sprite_number)
                overlay = alpha_over(overlay, eye_sprite)
                diagnostics.append(f"eye:{primary}")

        if secondary and secondary != "none":
            name = f"eyes2{str(secondary).upper()}"
            if self.repo.has_sprite(name):
                eye_sprite = self.repo.get_sprite(name, sprite_number)
                overlay = alpha_over(overlay, eye_sprite)
                diagnostics.append(f"eye2:{secondary}")

        if not diagnostics:
            return None, [], "alpha", LayerIdentifier.eyes

        return overlay, diagnostics, "alpha", LayerIdentifier.eyes

    def _stage_shading(self, params: Dict, canvas: Image.Image):
        if not self._truthy(params.get("shading")):
            return None, [], "alpha", LayerIdentifier.tint
        sprite_number = int(params.get("spriteNumber", 0))
        sprite_key = "shaders"
        if not self.repo.has_sprite(sprite_key, sprite_number):
            # fallback to legacy names present in some mod packs
            for fallback in ("shadersnewwhite", "lightingnewwhite"):
                if self.repo.has_sprite(fallback, sprite_number):
                    sprite_key = fallback
                    break
            else:
                return None, ["missing:shaders"], "alpha", LayerIdentifier.tint

        overlay = self.repo.get_sprite(sprite_key, sprite_number)
        return overlay, ["shading"], "multiply", LayerIdentifier.tint

    def _stage_lighting(self, params: Dict, canvas: Image.Image):
        lighting_param = params.get("lighting")
        if lighting_param is None or not self._truthy(lighting_param):
            return None, [], "alpha", LayerIdentifier.lighting
        sprite_number = int(params.get("spriteNumber", 0))
        sprite_key = "lighting"
        if not self.repo.has_sprite(sprite_key, sprite_number):
            return None, ["missing:lighting"], "alpha", LayerIdentifier.lighting
        overlay = self.repo.get_sprite(sprite_key, sprite_number)
        return overlay, ["lighting"], "alpha", LayerIdentifier.lighting

    def _stage_dark_forest(self, params: Dict, canvas: Image.Image):
        if not (params.get("darkForest") or params.get("darkMode")):
            return None, [], "alpha", LayerIdentifier.tint
        overlay = fill_with_colour(canvas.size, (120, 30, 30, 200), canvas)
        return overlay, ["darkForest"], "multiply", LayerIdentifier.tint

    def _stage_lineart(self, params: Dict, canvas: Image.Image):
        sprite_number = int(params.get("spriteNumber", 0))
        if params.get("dead"):
            sprite_name = "lineartdead"
        elif params.get("darkForest") or params.get("darkMode"):
            sprite_name = "lineartdf"
        else:
            sprite_name = "lines"
        if not self.repo.has_sprite(sprite_name, sprite_number):
            return None, [f"missing:{sprite_name}"], "alpha", LayerIdentifier.lineart
        overlay = self.repo.get_sprite(sprite_name, sprite_number)
        return overlay, [sprite_name.lower()], "alpha", LayerIdentifier.lineart

    def _stage_skin(self, params: Dict, canvas: Image.Image):
        skin = params.get("skinColour") or params.get("skinColor")
        if not skin or skin == "none":
            return None, [], "alpha", LayerIdentifier.skin
        sprite_number = int(params.get("spriteNumber", 0))
        sprite_name = self.mapper.build_sprite_name("skin", None, skin)
        if not sprite_name or not self.repo.has_sprite(sprite_name):
            return None, [f"missing:{skin}"], "alpha", LayerIdentifier.skin
        overlay = self.repo.get_sprite(sprite_name, sprite_number)
        return overlay, [f"skin:{skin}"], "alpha", LayerIdentifier.skin

    def _stage_scar_primary(self, params: Dict, canvas: Image.Image):
        scars_raw: List[str] = []
        if isinstance(params.get("scars"), list):
            scars_raw.extend(str(s) for s in params["scars"] if s and s != "none")
        if isinstance(params.get("scarSlots"), list):
            scars_raw.extend(str(s) for s in params["scarSlots"] if s and s != "none")
        if params.get("scar") and params.get("scar") != "none":
            scars_raw.append(str(params.get("scar")))
        scars = _deduplicate(scars_raw)
        if not scars:
            return None, [], "alpha", LayerIdentifier.scars_primary
        sprite_number = int(params.get("spriteNumber", 0))
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
                    sprite = self.repo.get_sprite(candidate, sprite_number)
                    diagnostics.append(candidate)
                    break
            if sprite is None:
                diagnostics.append(f"missing:{scar}")
                continue
            overlay = alpha_over(overlay, sprite)
        if not diagnostics:
            return None, [], "alpha", LayerIdentifier.scars_primary
        return overlay, diagnostics, "alpha", LayerIdentifier.scars_primary

    def _stage_scar_secondary(self, params: Dict, canvas: Image.Image):
        scars_raw: List[str] = []
        if isinstance(params.get("scars"), list):
            scars_raw.extend(str(s) for s in params["scars"] if s and s != "none")
        if isinstance(params.get("scarSlots"), list):
            scars_raw.extend(str(s) for s in params["scarSlots"] if s and s != "none")
        if params.get("scar") and params.get("scar") != "none":
            scars_raw.append(str(params.get("scar")))
        scars = _deduplicate(scars_raw)
        if not scars:
            return None, [], "alpha", LayerIdentifier.scars_secondary

        sprite_number = int(params.get("spriteNumber", 0))
        diagnostics: List[str] = []
        current = canvas.copy()

        for scar in scars:
            normalized = _normalize_scar(scar)
            if normalized not in SCARS_SECONDARY:
                continue
            mask = self.repo.get_missing_scar_mask(normalized, sprite_number)
            mask_alpha = np.array(mask.split()[3], dtype=np.uint16)
            if mask_alpha.max() == 0:
                continue
            diagnostics.append(f"missingscars{normalized}")
            current = apply_missing_scar(current, mask)

        if not diagnostics:
            return None, [], "alpha", LayerIdentifier.scars_secondary

        return current, diagnostics, "replace", LayerIdentifier.scars_secondary

    def _stage_accessories(self, params: Dict, canvas: Image.Image):
        accessories_raw: List[str] = []
        if isinstance(params.get("accessories"), list):
            accessories_raw.extend(str(a) for a in params["accessories"] if a and a != "none")
        if params.get("accessory") and params.get("accessory") != "none":
            accessories_raw.append(str(params.get("accessory")))
        valid_accessories = [acc for acc in accessories_raw if acc]
        if not valid_accessories:
            return None, [], "alpha", LayerIdentifier.accessories
        sprite_number = int(params.get("spriteNumber", 0))
        overlay = self.repo.blank_canvas()
        diagnostics = []
        for accessory in valid_accessories:
            sprite_name = self._resolve_accessory(str(accessory))
            if not sprite_name or not self.repo.has_sprite(sprite_name):
                continue
            overlay = alpha_over(overlay, self.repo.get_sprite(sprite_name, sprite_number))
            diagnostics.append(sprite_name)
        if not diagnostics:
            return None, [], "alpha", LayerIdentifier.accessories
        return overlay, diagnostics, "alpha", LayerIdentifier.accessories

    def _resolve_accessory(self, name: str) -> Optional[str]:
        sprite_name = self.mapper.accessory_sprite_name(name)
        if sprite_name and self.repo.has_sprite(sprite_name):
            return sprite_name

        raw = name.strip()
        upper = raw.upper()
        lower = raw.lower()
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
