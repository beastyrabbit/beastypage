from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from .repository import SpriteRepository


class MissingAccessorySprite(RuntimeError):
    """Raised when an accessory cannot be mapped to an atlas sprite."""



@dataclass
class ExperimentalColourDefinition:
    base_colour: str
    multiply: Optional[List[float]] = None
    screen: Optional[List[float]] = None
    overlay: Optional[List[float]] = None


def _dedupe(seq: Iterable[str]) -> List[str]:
    seen: set[str] = set()
    result: List[str] = []
    for item in seq:
        if not item:
            continue
        key = str(item).strip()
        if not key:
            continue
        if key not in seen:
            seen.add(key)
            result.append(key)
    return result


class SpriteMapper:
    """Python port of the browser sprite mapper used by catGeneratorV2."""

    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.sprites_index: Dict[str, dict] | None = None
        self.pelt_info: Dict[str, list] | None = None
        self.tints: Dict[str, list[int]] = {}
        self.white_patch_tints: Dict[str, list[int]] = {}
        self.experimental_defs: Dict[str, ExperimentalColourDefinition] = {}
        self.experimental_categories: Dict[str, List[str]] = {}

        self.pelt_names: List[str] = []
        self.colours: List[str] = []
        self.eye_colours: List[str] = []
        self.skin_colours: List[str] = []
        self.accessories: List[str] = []
        self.scars: List[str] = []
        self.white_patches: List[str] = []
        self.points: List[str] = []
        self.vitiligo: List[str] = []

        self._load()

    # ------------------------------------------------------------------
    def _load(self) -> None:
        index_path = self.data_dir / "spritesIndex.json"
        with index_path.open("r", encoding="utf-8") as fh:
            self.sprites_index = json.load(fh)

        pelt_path = self.data_dir / "peltInfo.json"
        with pelt_path.open("r", encoding="utf-8") as fh:
            self.pelt_info = json.load(fh)

        tint_path = self.data_dir / "tint.json"
        with tint_path.open("r", encoding="utf-8") as fh:
            tint_data = json.load(fh)
        self.tints = tint_data.get("tint_colours", {})
        self.dilute_tints = tint_data.get("dilute_tint_colours", {})

        wp_tint_path = self.data_dir / "white_patches_tint.json"
        with wp_tint_path.open("r", encoding="utf-8") as fh:
            wp_tint_data = json.load(fh)
        self.white_patch_tints = wp_tint_data.get("tint_colours", {})

        self.experimental_defs = self._load_experimental_defs()

        self.pelt_names = list(self.pelt_info.get("patterns", [])) if self.pelt_info else []
        self.colours = list(self.pelt_info.get("colors", [])) if self.pelt_info else []
        self.eye_colours = list(self.pelt_info.get("eyes", [])) if self.pelt_info else []
        self.skin_colours = list(self.pelt_info.get("skin", [])) if self.pelt_info else []
        self.accessories = list(self.pelt_info.get("accessories", [])) if self.pelt_info else []
        self.scars = list(self.pelt_info.get("scars", [])) if self.pelt_info else []
        self.white_patches = list(self.pelt_info.get("white", [])) if self.pelt_info else []
        self.points = list(self.pelt_info.get("point_markings", [])) if self.pelt_info else []
        self.vitiligo = list(self.pelt_info.get("vitiligo", [])) if self.pelt_info else []

        self.plant_accessories = {str(x).upper() for x in (self.pelt_info.get("plant_accessories", []) if self.pelt_info else [])}
        self.wild_accessories = {str(x).upper() for x in (self.pelt_info.get("wild_accessories", []) if self.pelt_info else [])}
        self.tail_accessories = {str(x).upper() for x in (self.pelt_info.get("tail_accessories", []) if self.pelt_info else [])}

        sprite_keys = set(self.sprites_index.keys()) if self.sprites_index else set()
        self.accessory_sprite_names = sprite_keys
        self.collar_accessories = {name[len("collars"):].upper() for name in sprite_keys if name.startswith("collars")}
        self.accessory_lookup: Dict[str, str] = {}

        self.accessories = self._collect_accessories()
        if not self.accessories:
            raise ValueError(
                "No accessories found in peltInfo.json. Check that peltInfo.json contains valid accessory data."
            )

        collected_scars = self._collect_list("scars", ("scars1", "scars2", "scars3"))
        if collected_scars:
            self.scars = collected_scars
        if not self.scars:
            raise ValueError("peltInfo.json does not contain scar definitions (scars1/2/3).")

        if not self.white_patches:
            self.white_patches = self._gather_white_patches()
        if not self.white_patches:
            raise ValueError("Could not derive white patches from sprite index data.")

        self._build_accessory_lookup()
        self._validate_accessory_sprites()

    # ------------------------------------------------------------------
    def _load_experimental_defs(self) -> Dict[str, ExperimentalColourDefinition]:
        raw_defs = {
            "AQUA": {"base": "WHITE", "multiply": [96, 212, 255]},
            "AMETHYST": {"base": "WHITE", "multiply": [168, 120, 255]},
            "APRICOT": {"base": "WHITE", "multiply": [255, 198, 150], "screen": [255, 220, 190, 0.25]},
            "BURGUNDY": {"base": "WHITE", "multiply": [120, 40, 70], "screen": [160, 60, 90, 0.25]},
            "CERULEAN": {"base": "WHITE", "multiply": [90, 160, 254]},
            "CHARTREUSE": {"base": "WHITE", "multiply": [184, 255, 80], "screen": [210, 255, 120, 0.2]},
            "COBALT": {"base": "WHITE", "multiply": [80, 118, 232]},
            "CORAL": {"base": "WHITE", "multiply": [255, 148, 130], "screen": [255, 190, 170, 0.25]},
            "CRIMSON": {"base": "WHITE", "multiply": [200, 32, 64], "screen": [220, 80, 110, 0.25]},
            "DAWN": {"base": "WHITE", "multiply": [247, 214, 214], "screen": [255, 230, 230, 0.2]},
            "ELECTRICBLUE": {"base": "WHITE", "multiply": [70, 145, 255], "screen": [110, 180, 255, 0.22]},
            "EMERALD": {"base": "WHITE", "multiply": [56, 190, 125]},
            "FERN": {"base": "WHITE", "multiply": [170, 214, 150], "screen": [195, 236, 182, 0.22]},
            "FOREST": {"base": "WHITE", "multiply": [88, 150, 88], "screen": [30, 60, 30, 0.2]},
            "FUCHSIA": {"base": "WHITE", "multiply": [255, 103, 218]},
            "GLAZEDBLUE": {"base": "WHITE", "multiply": [175, 210, 235], "screen": [204, 232, 255, 0.22]},
            "GOLDLEAF": {"base": "WHITE", "multiply": [240, 203, 120], "screen": [255, 226, 170, 0.2]},
            "HOTPINK": {"base": "WHITE", "multiply": [255, 80, 150], "screen": [255, 120, 190, 0.2]},
            "INDIGO": {"base": "WHITE", "multiply": [76, 63, 170], "screen": [120, 110, 210, 0.2]},
            "LAVENDER": {"base": "WHITE", "multiply": [186, 160, 255]},
            "LEMONADE": {"base": "WHITE", "multiply": [255, 232, 180], "screen": [255, 245, 214, 0.2]},
            "LIME": {"base": "WHITE", "multiply": [200, 255, 110], "screen": [220, 255, 150, 0.2]},
            "MAGENTA": {"base": "WHITE", "multiply": [226, 71, 174]},
            "MANGO": {"base": "WHITE", "multiply": [255, 204, 140], "screen": [255, 225, 175, 0.22]},
            "MIST": {"base": "WHITE", "multiply": [210, 230, 243], "screen": [230, 245, 255, 0.18]},
            "MINT": {"base": "WHITE", "multiply": [155, 233, 202]},
            "NAVY": {"base": "WHITE", "multiply": [43, 58, 120], "screen": [90, 102, 180, 0.25]},
            "NECTARINE": {"base": "WHITE", "multiply": [255, 188, 140], "screen": [255, 213, 178, 0.22]},
            "NEONBLUE": {"base": "WHITE", "multiply": [60, 120, 255], "screen": [120, 180, 255, 0.25]},
            "NEONGREEN": {"base": "WHITE", "multiply": [120, 255, 120], "screen": [150, 255, 170, 0.22]},
            "NEONPINK": {"base": "WHITE", "multiply": [255, 70, 190], "screen": [255, 140, 220, 0.22]},
            "NEONPURPLE": {"base": "WHITE", "multiply": [180, 70, 255], "screen": [210, 130, 255, 0.22]},
            "PEACH": {"base": "WHITE", "multiply": [255, 210, 175], "screen": [255, 235, 210, 0.2]},
            "PASTELBLUE": {"base": "WHITE", "multiply": [190, 220, 255], "screen": [220, 235, 255, 0.18]},
            "PASTELMINT": {"base": "WHITE", "multiply": [190, 255, 227], "screen": [210, 255, 235, 0.18]},
            "PASTELPINK": {"base": "WHITE", "multiply": [255, 200, 225], "screen": [255, 220, 235, 0.18]},
            "PASTELPURPLE": {"base": "WHITE", "multiply": [220, 200, 255], "screen": [235, 220, 255, 0.18]},
            "PASTELYELLOW": {"base": "WHITE", "multiply": [255, 240, 180], "screen": [255, 250, 210, 0.18]},
            "PERIWINKLE": {"base": "WHITE", "multiply": [158, 167, 250]},
            "PLUM": {"base": "WHITE", "multiply": [158, 82, 158], "screen": [200, 140, 200, 0.2]},
            "ROYALPURPLE": {"base": "WHITE", "multiply": [104, 63, 192], "screen": [150, 115, 220, 0.2]},
            "SAND": {"base": "WHITE", "multiply": [235, 214, 170], "screen": [245, 230, 190, 0.18]},
            "SCARLET": {"base": "WHITE", "multiply": [255, 60, 40], "screen": [255, 110, 90, 0.22]},
            "SEAFOAM": {"base": "WHITE", "multiply": [126, 230, 207]},
            "SKYBLUE": {"base": "WHITE", "multiply": [122, 196, 255]},
            "SPRINGGREEN": {"base": "WHITE", "multiply": [115, 224, 130]},
            "SUNSETORANGE": {"base": "WHITE", "multiply": [255, 120, 70], "screen": [255, 170, 120, 0.22]},
            "TEAL": {"base": "WHITE", "multiply": [70, 192, 196]},
            "TURQUOISE": {"base": "WHITE", "multiply": [72, 210, 208]},
            "WATERLILY": {"base": "WHITE", "multiply": [198, 225, 215], "screen": [220, 240, 230, 0.16]},
            "WISTERIA": {"base": "WHITE", "multiply": [210, 190, 255], "screen": [230, 210, 255, 0.18]},
            "ZEST": {"base": "WHITE", "multiply": [255, 214, 140], "screen": [255, 240, 180, 0.2]},
            "ZIRCON": {"base": "WHITE", "multiply": [220, 240, 255], "screen": [235, 245, 255, 0.14]},
            "MIDNIGHT": {"base": "WHITE", "multiply": [40, 50, 90]},
            "OBSIDIAN": {"base": "WHITE", "multiply": [30, 40, 60]},
            "DEEPSEA": {"base": "WHITE", "multiply": [20, 45, 70]},
            "NIGHTFALL": {"base": "WHITE", "multiply": [34, 44, 78]},
            "SHADOWPURPLE": {"base": "WHITE", "multiply": [50, 40, 80]},
            "DARKORCHID": {"base": "WHITE", "multiply": [70, 30, 90]},
            "STORMBLUE": {"base": "WHITE", "multiply": [48, 80, 108]},
            "DARKTEAL": {"base": "WHITE", "multiply": [40, 90, 90]},
            "EVERGREEN": {"base": "WHITE", "multiply": [40, 70, 50]},
            "FORESTSHADOW": {"base": "WHITE", "multiply": [44, 74, 54]},
            "MOSSY": {"base": "WHITE", "multiply": [70, 90, 60]},
            "DEEPFUCHSIA": {"base": "WHITE", "multiply": [110, 30, 80]},
            "GARNET": {"base": "WHITE", "multiply": [110, 40, 60]},
            "RAVEN": {"base": "WHITE", "multiply": [38, 40, 48]},
            "COBALTSTORM": {"base": "WHITE", "multiply": [52, 68, 110]},
            "TWILIGHTBLUE": {"base": "WHITE", "multiply": [50, 70, 120]},
            "VELVETPLUM": {"base": "WHITE", "multiply": [74, 50, 90]},
            "INDIGONIGHT": {"base": "WHITE", "multiply": [62, 52, 94]},
            "MULBERRY": {"base": "WHITE", "multiply": [82, 40, 68]},
            "CHARCOAL": {"base": "WHITE", "multiply": [46, 46, 52]},
            "SMOKESLATE": {"base": "WHITE", "multiply": [58, 65, 72]},
            "DUSKROSE": {"base": "WHITE", "multiply": [78, 46, 58]},
            "BRONZELEAF": {"base": "WHITE", "multiply": [91, 62, 36]},
            "DARKSUNSET": {"base": "WHITE", "multiply": [91, 46, 36]},
            "MIDNIGHTTEAL": {"base": "WHITE", "multiply": [26, 72, 72]},
            "OCEANDEPTHS": {"base": "WHITE", "multiply": [32, 62, 88]},
            "SHADOWMINT": {"base": "WHITE", "multiply": [58, 84, 72]},
            "NIGHTSKY": {"base": "WHITE", "multiply": [46, 52, 84]},
            "ASHWOOD": {"base": "WHITE", "multiply": [78, 72, 58]},
            "DEEPRUBY": {"base": "WHITE", "multiply": [98, 29, 46]},
            "BLACKOUTBLUE": {"base": "WHITE", "multiply": [10, 12, 26], "screen": [30, 36, 76, 0.08]},
            "BLACKOUTPURPLE": {"base": "WHITE", "multiply": [12, 10, 24], "screen": [54, 30, 80, 0.08]},
            "BLACKOUTRED": {"base": "WHITE", "multiply": [22, 8, 14], "screen": [80, 28, 40, 0.08]},
            "BLACKOUTTEAL": {"base": "WHITE", "multiply": [8, 20, 22], "screen": [36, 80, 82, 0.08]},
            "BLACKOUTGREEN": {"base": "WHITE", "multiply": [12, 24, 12], "screen": [56, 90, 48, 0.08]},
            "BLACKOUTGOLD": {"base": "WHITE", "multiply": [24, 18, 8], "screen": [96, 72, 36, 0.08]},
            "STARLESS_NAVY": {"base": "WHITE", "multiply": [9, 12, 28], "screen": [28, 40, 88, 0.07]},
            "NEBULA_INDIGO": {"base": "WHITE", "multiply": [11, 10, 26], "screen": [36, 30, 84, 0.07]},
            "UMBRAL_VIOLET": {"base": "WHITE", "multiply": [14, 9, 22], "screen": [60, 28, 80, 0.08]},
            "CRYPTIC_CRIMSON": {"base": "WHITE", "multiply": [22, 9, 14], "screen": [92, 30, 42, 0.08]},
            "ABYSSAL_TEAL": {"base": "WHITE", "multiply": [8, 18, 20], "screen": [32, 76, 80, 0.08]},
            "MOURNING_EMERALD": {"base": "WHITE", "multiply": [12, 22, 14], "screen": [50, 90, 56, 0.08]},
            "SHADOW_SAPPHIRE": {"base": "WHITE", "multiply": [10, 13, 30], "screen": [34, 44, 92, 0.07]},
            "NOCTURNE_MAGENTA": {"base": "WHITE", "multiply": [18, 8, 20], "screen": [88, 28, 78, 0.08]},
            "PHANTOM_COPPER": {"base": "WHITE", "multiply": [20, 14, 10], "screen": [90, 70, 50, 0.08]},
            "ECLIPSE_SKY": {"base": "WHITE", "multiply": [12, 16, 24], "screen": [46, 58, 90, 0.07]},
        }

        self.experimental_categories = {
            "mood": [
                "AQUA",
                "APRICOT",
                "CORAL",
                "DAWN",
                "FERN",
                "GLAZEDBLUE",
                "GOLDLEAF",
                "LAVENDER",
                "LEMONADE",
                "MANGO",
                "MINT",
                "MIST",
                "PEACH",
                "PASTELBLUE",
                "PASTELMINT",
                "PASTELPINK",
                "PASTELPURPLE",
                "PASTELYELLOW",
                "PERIWINKLE",
                "SEAFOAM",
                "SPRINGGREEN",
                "WATERLILY",
                "WISTERIA",
                "ZIRCON",
            ],
            "bold": [
                "CHARTREUSE",
                "CERULEAN",
                "COBALT",
                "ELECTRICBLUE",
                "EMERALD",
                "FUCHSIA",
                "HOTPINK",
                "LIME",
                "MAGENTA",
                "NEONBLUE",
                "NEONGREEN",
                "NEONPINK",
                "NEONPURPLE",
                "SKYBLUE",
                "SUNSETORANGE",
                "TEAL",
                "TURQUOISE",
                "ZEST",
                "SAND",
                "SCARLET",
                "NECTARINE",
            ],
            "darker": [
                "MIDNIGHT",
                "OBSIDIAN",
                "DEEPSEA",
                "NIGHTFALL",
                "SHADOWPURPLE",
                "DARKORCHID",
                "STORMBLUE",
                "DARKTEAL",
                "EVERGREEN",
                "FORESTSHADOW",
                "MOSSY",
                "DEEPFUCHSIA",
                "GARNET",
                "RAVEN",
                "COBALTSTORM",
                "TWILIGHTBLUE",
                "VELVETPLUM",
                "INDIGONIGHT",
                "MULBERRY",
                "CHARCOAL",
                "SMOKESLATE",
                "DUSKROSE",
                "BRONZELEAF",
                "DARKSUNSET",
                "MIDNIGHTTEAL",
                "OCEANDEPTHS",
                "SHADOWMINT",
                "NIGHTSKY",
                "ASHWOOD",
                "DEEPRUBY",
            ],
            "blackout": [
                "BLACKOUTBLUE",
                "BLACKOUTPURPLE",
                "BLACKOUTRED",
                "BLACKOUTTEAL",
                "BLACKOUTGREEN",
                "BLACKOUTGOLD",
                "STARLESS_NAVY",
                "NEBULA_INDIGO",
                "UMBRAL_VIOLET",
                "CRYPTIC_CRIMSON",
                "ABYSSAL_TEAL",
                "MOURNING_EMERALD",
                "SHADOW_SAPPHIRE",
                "NOCTURNE_MAGENTA",
                "PHANTOM_COPPER",
                "ECLIPSE_SKY",
            ],
        }

        result: Dict[str, ExperimentalColourDefinition] = {}
        for name, payload in raw_defs.items():
            result[name] = ExperimentalColourDefinition(
                base_colour=payload["base"],
                multiply=payload.get("multiply"),
                screen=payload.get("screen"),
                overlay=payload.get("overlay"),
            )
        return result
    # ------------------------------------------------------------------
    def build_sprite_name(self, sprite_type: str, name: str | None, colour: str | None) -> Optional[str]:
        colour = colour or "WHITE"
        if sprite_type == "pelt":
            if not name:
                return None
            mapping = {
                "SingleColour": "single",
                "TwoColour": "single",
                "Tabby": "tabby",
                "Marbled": "marbled",
                "Rosette": "rosette",
                "Smoke": "smoke",
                "Ticked": "ticked",
                "Speckled": "speckled",
                "Bengal": "bengal",
                "Mackerel": "mackerel",
                "Classic": "classic",
                "Sokoke": "sokoke",
                "Agouti": "agouti",
                "Singlestripe": "singlestripe",
                "Masked": "masked",
            }
            prefix = mapping.get(name, name.lower())
            return f"{prefix}{colour}" if colour else prefix
        if sprite_type == "eyes":
            return f"eyes{colour}"
        if sprite_type == "skin":
            return f"skin{colour}"
        if sprite_type == "white":
            if not name:
                return None
            return f"white{name}"
        if sprite_type == "scar":
            if not name:
                return None
            return f"scar{name}"
        if sprite_type == "scars":
            if not name:
                return None
            return f"scars{name}"
        if sprite_type == "accessory":
            return name
        if sprite_type == "tortie":
            if not name:
                return None
            return f"tortiemask{name}"
        if not name:
            return None
        return f"{sprite_type}{name}"

    # ------------------------------------------------------------------
    def get_experimental_definition(self, colour: str | None) -> Optional[ExperimentalColourDefinition]:
        if not colour:
            return None
        return self.experimental_defs.get(colour.upper())

    def get_tint_colour(self, tint: str | None) -> Optional[List[int]]:
        if not tint:
            return None
        key = tint.lower()
        value = self.tints.get(key)
        return list(value) if value else None

    def get_dilute_tint_colour(self, tint: str | None) -> Optional[List[int]]:
        if not tint:
            return None
        key = tint.lower()
        value = self.dilute_tints.get(key)
        return list(value) if value else None

    def get_white_patch_tint(self, tint: str | None) -> Optional[List[int]]:
        if not tint:
            return None
        key = tint.lower()
        value = self.white_patch_tints.get(key)
        return list(value) if value else None

    # ------------------------------------------------------------------
    @property
    def sprite_index(self) -> Dict[str, dict]:  # type: ignore[return-value]
        return self.sprites_index or {}

    # ------------------------------------------------------------------
    def accessory_sprite_name(self, raw: str) -> Optional[str]:
        if not raw:
            return None

        trimmed = raw.strip()
        upper = trimmed.upper()

        if trimmed in self.accessory_sprite_names:
            return trimmed
        if upper in self.accessory_sprite_names:
            return upper

        if upper in self.collar_accessories:
            candidate = f"collars{upper}"
            if candidate in self.accessory_sprite_names:
                return candidate
            candidate = f"collars{trimmed}"
            if candidate in self.accessory_sprite_names:
                return candidate

        if upper in self.plant_accessories:
            candidate = f"acc_herbs{trimmed}"
            if candidate in self.accessory_sprite_names:
                return candidate

        if upper in self.wild_accessories:
            candidate = f"acc_wild{trimmed}"
            if candidate in self.accessory_sprite_names:
                return candidate

        if upper in self.tail_accessories:
            candidate = f"tail2_accessories{trimmed}"
            if candidate in self.accessory_sprite_names:
                return candidate

        fallback_options = [
            trimmed,
            upper,
            trimmed.replace(" ", ""),
            upper.replace(" ", ""),
        ]
        for option in fallback_options:
            if option in self.accessory_sprite_names:
                return option

        for prefix in (
            "acc_herbs",
            "acc_wild",
            "acc_smallanimal",
            "acc_smallAnimal",
            "acc_tail2",
            "acc_fruit",
            "acc_crafted",
            "acc_aliveinsect",
            "acc_deadinsect",
            "acc_plant2",
            "acc_aliveInsect",
            "acc_deadInsect",
            "tail2_accessories",
        ):
            candidate = f"{prefix}{trimmed}"
            if candidate in self.accessory_sprite_names:
                return candidate
            candidate_upper = f"{prefix}{upper}"
            if candidate_upper in self.accessory_sprite_names:
                return candidate_upper

        lookup_key = self.accessory_lookup.get(upper)
        if lookup_key:
            return lookup_key

        return None
    def _collect_accessories(self) -> List[str]:
        combined: List[str] = []
        for key in (
            "accessories",
            "plant_accessories",
            "wild_accessories",
            "tail_accessories",
            "collars",
            "extra_accessories",
        ):
            values = self.pelt_info.get(key, []) if self.pelt_info else []
            if isinstance(values, list):
                combined.extend(str(item) for item in values if item)

        return _dedupe(combined)

    # ------------------------------------------------------------------
    def _collect_list(self, label: str, keys: Iterable[str]) -> List[str]:
        combined: List[str] = []
        for key in keys:
            values = self.pelt_info.get(key, []) if self.pelt_info else []
            if isinstance(values, list):
                combined.extend(str(item) for item in values if item)
        return _dedupe(combined)

    # ------------------------------------------------------------------
    def _gather_white_patches(self) -> List[str]:
        derived: List[str] = []
        for key in self.sprites_index.keys():
            if key.startswith("white") and key not in {"whitepatches"}:
                suffix = key[5:]
                if suffix:
                    derived.append(suffix)
        base = _dedupe(derived)
        points_set = set(self.points)
        vit_set = set(self.vitiligo)
        return [name for name in base if name not in points_set and name not in vit_set]

    # ------------------------------------------------------------------
    def _build_accessory_lookup(self) -> None:
        lookup: Dict[str, str] = {}
        for key in self.sprites_index.keys():
            if not key.startswith("acc_"):
                continue
            idx = 4
            while idx < len(key) and not key[idx].isupper():
                idx += 1
            if idx >= len(key):
                continue
            name = key[idx:]
            normalized = name.upper()
            lookup.setdefault(normalized, key)
            lookup.setdefault(normalized.replace(" ", ""), key)
        self.accessory_lookup = lookup

    # ------------------------------------------------------------------
    def _validate_accessory_sprites(self) -> None:
        repository = SpriteRepository()
        missing: List[tuple[str, str | None]] = []
        for name in self.accessories:
            sprite_key = self.accessory_sprite_name(name)
            if not sprite_key or not repository.has_sprite(sprite_key, 8):
                missing.append((name, sprite_key))
        if missing:
            sample = ", ".join(f"{name} -> {sprite or 'None'}" for name, sprite in missing[:10])
            raise MissingAccessorySprite(
                f"{len(missing)} accessories do not have sprite mappings. Sample: {sample}. "
                "Check that sprite metadata is up to date."
            )



def get_sprite_mapper(data_dir: Path) -> SpriteMapper:
    return SpriteMapper(data_dir)
