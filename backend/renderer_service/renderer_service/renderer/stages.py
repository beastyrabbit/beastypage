from __future__ import annotations

import time
from dataclasses import dataclass
from typing import List

from PIL import Image, ImageOps

from ..models import LayerIdentifier
from .colors import resolve_colour
from .repository import SpriteRepository
from .image_ops import alpha_over


@dataclass
class StageResult:
    image: Image.Image
    diagnostics: List[str]
    blend_mode: str = "alpha"


class Stage:
    id: LayerIdentifier
    label: str

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:  # pragma: no cover - interface
        raise NotImplementedError


class BaseCoatStage(Stage):
    id = LayerIdentifier.base
    label = "Base Coat"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        sprite_number = int(params.get("spriteNumber", 0))
        pelt = str(params.get("peltName") or params.get("pattern") or "SingleColour")
        colour = str(params.get("colour") or "WHITE").upper()
        tint = params.get("tint")

        sprite_key = self._resolve_pelt_sprite(pelt, colour)
        diagnostics: List[str] = [f"pelt={pelt}", f"colour={colour}"]

        if sprite_key and repo.has_sprite(sprite_key):
            base = repo.get_sprite(sprite_key, sprite_number)
            diagnostics.append(f"sprite={sprite_key}")
        else:
            base = repo.base_fill(colour, None)
            diagnostics.append("sprite=fallback")

        if tint and str(tint).lower() not in {"none", "false", "0"}:
            tint_colour = resolve_colour(str(tint))
            tint_overlay = repo.blank_canvas((*tint_colour[:3], 96))
            base = alpha_over(base, tint_overlay)
            diagnostics.append(f"tint={tint}")
        else:
            diagnostics.append("tint=none")

        if params.get("reverse") is True:
            base = ImageOps.mirror(base)
            diagnostics.append("reverse=true")

        return StageResult(base, diagnostics=diagnostics)

    @staticmethod
    def _resolve_pelt_sprite(pelt: str, colour: str) -> str | None:
        normalized = pelt.strip()
        key_map = {
            "SINGLECOLOUR": "single",
            "TWOCOLOR": "single",
            "TW0COLOUR": "single",
            "TWOCOLOUR": "single",
            "TABBY": "tabby",
            "MARBLED": "marbled",
            "ROSETTE": "rosette",
            "SMOKE": "smoke",
            "TICKED": "ticked",
            "SPECKLED": "speckled",
            "BENGAL": "bengal",
            "MACKEREL": "mackerel",
            "CLASSIC": "classic",
            "SOKOKE": "sokoke",
            "AGOUTI": "agouti",
            "SINGLESTRIPE": "singlestripe",
            "MASKED": "masked",
        }

        prefix = key_map.get(normalized.upper())
        if not prefix:
            prefix = normalized.lower()
        return f"{prefix}{colour.upper()}"


class WhitePatchStage(Stage):
    id = LayerIdentifier.white_patches
    label = "White Patches"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        patches = params.get("whitePatches") or params.get("white_patches")
        if not patches or str(patches).lower() in {"none", "null", "false"}:
            return StageResult(repo.blank_canvas(), diagnostics=["none"])

        sprite_number = int(params.get("spriteNumber", 0))
        accumulator = repo.blank_canvas()
        diagnostics: List[str] = []

        if isinstance(patches, str):
            patch_list = [patches]
        elif isinstance(patches, (list, tuple, set)):
            patch_list = list(patches)
        else:
            patch_list = [str(patches)]

        for patch in patch_list:
            if not patch:
                continue
            sprite_name = self._resolve_sprite_name(str(patch), repo)
            if sprite_name:
                overlay = repo.get_sprite(sprite_name, sprite_number)
                accumulator = alpha_over(accumulator, overlay)
                diagnostics.append(sprite_name)
            else:
                diagnostics.append(f"missing:{patch}")

        if params.get("reverse") is True:
            accumulator = ImageOps.mirror(accumulator)
            diagnostics.append("reverse=true")

        return StageResult(accumulator, diagnostics = diagnostics or ["none"])

    @staticmethod
    def _resolve_sprite_name(patch: str, repo: SpriteRepository) -> str | None:
        normalized = patch.strip()
        if not normalized:
            return None
        candidates = [
            f"white{normalized}",
            f"white{normalized.upper()}",
            f"white{normalized.replace(' ', '').upper()}",
            f"white{normalized.replace('-', '').upper()}",
        ]
        for candidate in candidates:
            if candidate and repo.has_sprite(candidate):
                return candidate
        return None


class PointsStage(Stage):
    id = LayerIdentifier.points
    label = "Points"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        points = params.get("points") or params.get("pointPattern")
        if not points or str(points).lower() in {"none", "null", "false"}:
            return StageResult(repo.blank_canvas(), diagnostics=["none"])

        sprite_name = WhitePatchStage._resolve_sprite_name(str(points), repo)
        if not sprite_name:
            return StageResult(repo.blank_canvas(), diagnostics=[f"missing:{points}"])

        sprite_number = int(params.get("spriteNumber", 0))
        layer = repo.get_sprite(sprite_name, sprite_number)
        if params.get("reverse") is True:
            layer = ImageOps.mirror(layer)
        return StageResult(layer, diagnostics=[sprite_name])


class VitiligoStage(Stage):
    id = LayerIdentifier.vitiligo
    label = "Vitiligo"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        pattern = params.get("vitiligo")
        if not pattern or str(pattern).lower() in {"none", "null", "false"}:
            return StageResult(repo.blank_canvas(), diagnostics=["none"])

        sprite_name = WhitePatchStage._resolve_sprite_name(str(pattern), repo)
        if not sprite_name:
            return StageResult(repo.blank_canvas(), diagnostics=[f"missing:{pattern}"])

        sprite_number = int(params.get("spriteNumber", 0))
        layer = repo.get_sprite(sprite_name, sprite_number)
        if params.get("reverse") is True:
            layer = ImageOps.mirror(layer)
        return StageResult(layer, diagnostics=[sprite_name])


class EyesStage(Stage):
    id = LayerIdentifier.eyes
    label = "Eyes"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        sprite_number = int(params.get("spriteNumber", 0))
        primary = params.get("eyeColour") or params.get("eye_color")
        secondary = params.get("eyeColour2") or params.get("eye_color2")

        composed = repo.blank_canvas()
        diagnostics: List[str] = []

        if primary:
            sprite_name = f"eyes{str(primary).upper()}"
            if repo.has_sprite(sprite_name):
                composed = alpha_over(composed, repo.get_sprite(sprite_name, sprite_number))
                diagnostics.append(sprite_name)
            else:
                layer = repo.eyes(sprite_number, primary, None)
                composed = alpha_over(composed, layer)
                diagnostics.append(f"tinted:{primary}")

        if secondary and str(secondary).lower() not in {"none", "null"}:
            sprite_name = f"eyes2{str(secondary).upper()}"
            if repo.has_sprite(sprite_name):
                composed = alpha_over(composed, repo.get_sprite(sprite_name, sprite_number))
                diagnostics.append(sprite_name)
            else:
                diagnostics.append(f"missing-eyes2:{secondary}")

        if params.get("reverse") is True:
            composed = ImageOps.mirror(composed)

        return StageResult(composed, diagnostics=diagnostics or ["none"])


class ShadingStage(Stage):
    id = LayerIdentifier.tint
    label = "Shading"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        if not params.get("shading"):
            return StageResult(repo.blank_canvas(), diagnostics=["disabled"])

        sprite_number = int(params.get("spriteNumber", 0))
        shading = repo.get_sprite("shaders", sprite_number)
        diagnostics = ["shaders"] if repo.has_sprite("shaders") else ["shaders:fallback"]

        if params.get("reverse") is True:
            shading = ImageOps.mirror(shading)

        return StageResult(shading, diagnostics=diagnostics, blend_mode="multiply")


class LightingStage(Stage):
    id = LayerIdentifier.lighting
    label = "Lighting"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        sprite_number = int(params.get("spriteNumber", 0))
        sprite_name = "lighting"
        if not repo.has_sprite(sprite_name):
            return StageResult(repo.blank_canvas(), diagnostics=["missing"], blend_mode="alpha")

        layer = repo.get_sprite(sprite_name, sprite_number)
        if params.get("reverse") is True:
            layer = ImageOps.mirror(layer)
        return StageResult(layer, diagnostics=[sprite_name])


class DarkForestStage(Stage):
    id = LayerIdentifier.tint
    label = "Dark Forest"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        if not (params.get("darkForest") or params.get("darkMode")):
            return StageResult(repo.blank_canvas(), diagnostics=["disabled"], blend_mode="alpha")

        tint_layer = repo.blank_canvas((120, 30, 30, 128))
        if params.get("reverse") is True:
            tint_layer = ImageOps.mirror(tint_layer)
        return StageResult(tint_layer, diagnostics=["dark-forest"], blend_mode="multiply")


class LineartStage(Stage):
    id = LayerIdentifier.lineart
    label = "Lineart"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        sprite_number = int(params.get("spriteNumber", 0))
        layer = repo.lineart(sprite_number)
        if params.get("reverse") is True:
            layer = ImageOps.mirror(layer)
        return StageResult(layer, diagnostics=[f"sprite={sprite_number}"])


class SkinStage(Stage):
    id = LayerIdentifier.skin
    label = "Skin"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        skin = params.get("skinColour") or params.get("skinColor")
        if not skin or str(skin).lower() in {"none", "null", "false"}:
            return StageResult(repo.blank_canvas(), diagnostics=["none"])

        sprite_number = int(params.get("spriteNumber", 0))
        candidates = [
            f"skin{str(skin).upper()}",
            f"skin{skin}",
            f"skins{str(skin).upper()}",
        ]

        for candidate in candidates:
            if repo.has_sprite(candidate):
                layer = repo.get_sprite(candidate, sprite_number)
                if params.get("reverse") is True:
                    layer = ImageOps.mirror(layer)
                return StageResult(layer, diagnostics=[candidate])

        return StageResult(repo.blank_canvas(), diagnostics=[f"missing:{skin}"])


SCARS_PRIMARY = {
    "ONE", "TWO", "THREE", "TAILSCAR", "SNOUT", "CHEEK", "SIDE", "THROAT", "TAILBASE",
    "BELLY", "LEGBITE", "NECKBITE", "FACE", "MANLEG", "BRIGHTHEART", "MANTAIL", "BRIDGE",
    "RIGHTBLIND", "LEFTBLIND", "BOTHBLIND", "BEAKCHEEK", "BEAKLOWER", "CATBITE", "RATBITE",
    "QUILLCHUNK", "QUILLSCRATCH", "HINDLEG", "BACK", "QUILLSIDE", "SCRATCHSIDE", "BEAKSIDE",
    "CATBITETWO", "FOUR", "BURNPAWS", "BURNTAIL", "BURNBELLY", "BURNRUMP", "FROSTFACE",
    "SNAKE", "SNAKETWO", "TOETRAP", "TOE", "FROSTTAIL", "FROSTSOCK", "FROSTMITT"
}

SCARS_SECONDARY = {
    "LEFTEAR", "RIGHTEAR", "NOTAIL", "HALFTAIL", "NOPAW", "NOLEFTEAR", "NORIGHTEAR", "NOEAR"
}


def _collect_scars(params: dict) -> List[str]:
    scars: List[str] = []
    if isinstance(params.get("scars"), (list, tuple)):
        scars.extend([str(s) for s in params.get("scars") if s and s != "none"])
    scar = params.get("scar")
    if scar and scar != "none":
        scars.append(str(scar))
    return scars


def _normalize_scar(name: str) -> str:
    return name.strip().replace(" ", "").replace("-", "").upper()


class ScarPrimaryStage(Stage):
    id = LayerIdentifier.scars_primary
    label = "Scars (Additive)"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        scars = _collect_scars(params)
        if not scars:
            return StageResult(repo.blank_canvas(), diagnostics=["none"])

        sprite_number = int(params.get("spriteNumber", 0))
        accumulator = repo.blank_canvas()
        diagnostics: List[str] = []

        for scar in scars:
            normalized = _normalize_scar(scar)
            if normalized not in SCARS_PRIMARY:
                continue

            for candidate in (
                f"scars{normalized}",
                f"scars{scar}",
                f"scar{normalized}",
            ):
                if repo.has_sprite(candidate):
                    layer = repo.get_sprite(candidate, sprite_number)
                    accumulator = alpha_over(accumulator, layer)
                    diagnostics.append(candidate)
                    break
            else:
                diagnostics.append(f"missing:{scar}")

        if params.get("reverse") is True:
            accumulator = ImageOps.mirror(accumulator)

        return StageResult(accumulator, diagnostics=diagnostics or ["none"])


class ScarSecondaryStage(Stage):
    id = LayerIdentifier.scars_secondary
    label = "Scars (Missing)"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        scars = _collect_scars(params)
        if not scars:
            return StageResult(repo.blank_canvas(), diagnostics=["none"])

        sprite_number = int(params.get("spriteNumber", 0))
        accumulator = repo.blank_canvas()
        diagnostics: List[str] = []

        for scar in scars:
            normalized = _normalize_scar(scar)
            if normalized not in SCARS_SECONDARY:
                continue

            for candidate in (
                f"missingscars{normalized}",
                f"missingscars{scar}",
                f"scars{normalized}",
            ):
                if repo.has_sprite(candidate):
                    layer = repo.get_sprite(candidate, sprite_number)
                    accumulator = alpha_over(accumulator, layer)
                    diagnostics.append(candidate)
                    break
            else:
                diagnostics.append(f"missing:{scar}")

        if params.get("reverse") is True:
            accumulator = ImageOps.mirror(accumulator)

        return StageResult(accumulator, diagnostics=diagnostics or ["none"])


class AccessoryStage(Stage):
    id = LayerIdentifier.accessories
    label = "Accessories"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        accessories = self._collect_accessories(params)
        if not accessories:
            return StageResult(repo.blank_canvas(), diagnostics=["none"])

        sprite_number = int(params.get("spriteNumber", 0))
        accumulator = repo.blank_canvas()
        diagnostics: List[str] = []

        for accessory in accessories:
            sprite_name = self._resolve_accessory(accessory, repo)
            if sprite_name:
                layer = repo.get_sprite(sprite_name, sprite_number)
                if params.get("reverse") is True:
                    layer = ImageOps.mirror(layer)
                accumulator = alpha_over(accumulator, layer)
                diagnostics.append(sprite_name)
            else:
                diagnostics.append(f"missing:{accessory}")

        return StageResult(accumulator, diagnostics=diagnostics or ["none"])

    @staticmethod
    def _collect_accessories(params: dict) -> List[str]:
        accessories: List[str] = []
        if isinstance(params.get("accessories"), (list, tuple)):
            accessories.extend([str(a) for a in params.get("accessories") if a and a != "none"])
        accessory = params.get("accessory")
        if accessory and accessory != "none":
            accessories.append(str(accessory))
        return accessories

    @staticmethod
    def _resolve_accessory(name: str, repo: SpriteRepository) -> str | None:
        raw = name.strip()
        if not raw:
            return None
        upper = raw.upper()
        compact = raw.replace(" ", "")
        candidates = [
            raw,
            upper,
            compact,
            f"collars{upper}",
            f"collars{raw}",
            f"collars{compact}",
            f"acc_herbs{raw}",
            f"acc_herbs{upper}",
            f"acc_wild{raw}",
            f"acc_wild{upper}",
            f"acc_{upper}",
            f"accessories{upper}",
        ]
        for candidate in candidates:
            if repo.has_sprite(candidate):
                return candidate
        return None


class CompositeStage(Stage):
    id = LayerIdentifier.output
    label = "Output"

    def render(self, repo: SpriteRepository, params: dict) -> StageResult:
        # This stage does not draw anything new; it exists to normalise alpha.
        base = repo.blank_canvas()
        return StageResult(base, diagnostics=["noop"])
