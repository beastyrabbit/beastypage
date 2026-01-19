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

        self.pelt_names = (
            list(self.pelt_info.get("patterns", [])) if self.pelt_info else []
        )
        self.colours = list(self.pelt_info.get("colors", [])) if self.pelt_info else []
        self.eye_colours = (
            list(self.pelt_info.get("eyes", [])) if self.pelt_info else []
        )
        self.skin_colours = (
            list(self.pelt_info.get("skin", [])) if self.pelt_info else []
        )
        self.accessories = (
            list(self.pelt_info.get("accessories", [])) if self.pelt_info else []
        )
        self.scars = list(self.pelt_info.get("scars", [])) if self.pelt_info else []
        self.white_patches = (
            list(self.pelt_info.get("white", [])) if self.pelt_info else []
        )
        self.points = (
            list(self.pelt_info.get("point_markings", [])) if self.pelt_info else []
        )
        self.vitiligo = (
            list(self.pelt_info.get("vitiligo", [])) if self.pelt_info else []
        )

        self.plant_accessories = {
            str(x).upper()
            for x in (
                self.pelt_info.get("plant_accessories", []) if self.pelt_info else []
            )
        }
        self.wild_accessories = {
            str(x).upper()
            for x in (
                self.pelt_info.get("wild_accessories", []) if self.pelt_info else []
            )
        }
        self.tail_accessories = {
            str(x).upper()
            for x in (
                self.pelt_info.get("tail_accessories", []) if self.pelt_info else []
            )
        }

        sprite_keys = set(self.sprites_index.keys()) if self.sprites_index else set()
        self.accessory_sprite_names = sprite_keys
        self.collar_accessories = {
            name[len("collars") :].upper()
            for name in sprite_keys
            if name.startswith("collars")
        }
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
            raise ValueError(
                "peltInfo.json does not contain scar definitions (scars1/2/3)."
            )

        if not self.white_patches:
            self.white_patches = self._gather_white_patches()
        if not self.white_patches:
            raise ValueError("Could not derive white patches from sprite index data.")

        self._build_accessory_lookup()
        self._validate_accessory_sprites()

    # ------------------------------------------------------------------
    def _load_experimental_defs(self) -> Dict[str, ExperimentalColourDefinition]:
        """Load experimental color palettes from JSON files in data/palettes/"""
        palettes_dir = self.data_dir / "palettes"
        result: Dict[str, ExperimentalColourDefinition] = {}
        self.experimental_categories = {}
        self._palette_metadata: List[dict] = []

        if not palettes_dir.exists():
            return result

        for palette_file in sorted(palettes_dir.glob("*.json")):
            try:
                with open(palette_file, "r", encoding="utf-8") as f:
                    palette_data = json.load(f)

                palette_id = palette_data.get("id", palette_file.stem)
                colors = palette_data.get("colors", {})

                # Store metadata for API endpoint
                self._palette_metadata.append(
                    {
                        "id": palette_id,
                        "label": palette_data.get("label", palette_id),
                        "description": palette_data.get("description"),
                        "colors": colors,
                    }
                )

                # Build category list and color definitions
                category_colors: List[str] = []
                for color_name, color_def in colors.items():
                    upper_name = color_name.upper()
                    category_colors.append(upper_name)
                    result[upper_name] = ExperimentalColourDefinition(
                        base_colour="WHITE",
                        multiply=color_def.get("multiply"),
                        screen=color_def.get("screen"),
                        overlay=color_def.get("overlay"),
                    )

                self.experimental_categories[palette_id] = category_colors

            except (json.JSONDecodeError, IOError) as e:
                print(f"Warning: Failed to load palette {palette_file}: {e}")

        return result

    def get_palette_metadata(self) -> List[dict]:
        """Return palette metadata for API endpoint"""
        return getattr(self, "_palette_metadata", [])

    # ------------------------------------------------------------------
    def build_sprite_name(
        self, sprite_type: str, name: str | None, colour: str | None
    ) -> Optional[str]:
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
    def get_experimental_definition(
        self, colour: str | None
    ) -> Optional[ExperimentalColourDefinition]:
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
            sample = ", ".join(
                f"{name} -> {sprite or 'None'}" for name, sprite in missing[:10]
            )
            raise MissingAccessorySprite(
                f"{len(missing)} accessories do not have sprite mappings. Sample: {sample}. "
                "Check that sprite metadata is up to date."
            )


def get_sprite_mapper(data_dir: Path) -> SpriteMapper:
    return SpriteMapper(data_dir)
