from __future__ import annotations

import json
from collections.abc import Callable
from copy import deepcopy
from pathlib import Path
from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from .coat_patterns import normalize_coat_pattern_name
from .contracts import CatDocument
from .document_schema import (
    DEFAULT_DOCUMENT_SCHEMA_PATH,
    CatDocumentSchema,
)

DEFAULT_COMPATIBILITY_PATH = (
    Path(__file__).resolve().parents[1] / "generated" / "compatibility.json"
)


class CompatibilityModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class DirectBinding(CompatibilityModel):
    strategy: Literal["direct"]
    key: str


class ListBinding(CompatibilityModel):
    strategy: Literal["list"]
    key: str
    single_key: str | None = Field(default=None, alias="singleKey")


class PoseBinding(CompatibilityModel):
    strategy: Literal["pose"]
    key: Literal["poseName"]
    sprite_key: Literal["spriteNumber"] = Field(alias="spriteKey")


class TortieBinding(CompatibilityModel):
    strategy: Literal["tortie"]


class BooleanAliasBinding(CompatibilityModel):
    strategy: Literal["booleanAlias"]
    key: str
    aliases: list[str] = Field(default_factory=list)


LegacyBinding: TypeAlias = Annotated[
    DirectBinding | ListBinding | PoseBinding | TortieBinding | BooleanAliasBinding,
    Field(discriminator="strategy"),
]


class CompatibilityTrait(CompatibilityModel):
    id: str
    value_kind: Literal[
        "string",
        "boolean",
        "integer",
        "stringList",
        "objectList",
    ] = Field(alias="valueKind")
    required: bool
    default: JsonValue | None = None
    legacy: LegacyBinding

    @property
    def has_default(self) -> bool:
        return "default" in self.model_fields_set


class Tombstone(CompatibilityModel):
    removed_in: int = Field(alias="removedIn", ge=1)
    reason: str


class CompatibilityManifest(CompatibilityModel):
    format_version: Literal[1] = Field(alias="formatVersion")
    schema_version: int = Field(alias="schemaVersion", ge=1)
    aliases: dict[str, str] = Field(default_factory=dict)
    tombstones: dict[str, Tombstone] = Field(default_factory=dict)
    traits: list[CompatibilityTrait]


def _truthy(value: JsonValue | None) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "on"}
    return bool(value)


def _normalise_string_list(*values: JsonValue | None) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        entries = value if isinstance(value, list) else [value]
        for entry in entries:
            if not isinstance(entry, str):
                continue
            normalized = entry.strip()
            if (
                not normalized
                or normalized.lower() in {"none", "null"}
                or normalized.upper() in seen
            ):
                continue
            seen.add(normalized.upper())
            result.append(normalized)
    return result


class LegacyCatAdapter:
    def __init__(
        self,
        manifest: CompatibilityManifest,
        document_schema: CatDocumentSchema | None = None,
    ) -> None:
        self.manifest = manifest
        trait_ids = [trait.id for trait in manifest.traits]
        if len(trait_ids) != len(set(trait_ids)):
            raise ValueError("Compatibility manifest contains duplicate trait IDs")
        self._traits_by_id = {trait.id: trait for trait in manifest.traits}
        self.document_schema = document_schema
        if document_schema is not None:
            document_schema.assert_compatible(
                schema_version=manifest.schema_version,
                trait_ids=set(self._traits_by_id),
            )

    @classmethod
    def from_path(
        cls,
        path: Path = DEFAULT_COMPATIBILITY_PATH,
        schema_path: Path = DEFAULT_DOCUMENT_SCHEMA_PATH,
    ) -> LegacyCatAdapter:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise ValueError(f"Compatibility artifact is missing: {path}") from exc
        return cls(
            CompatibilityManifest.model_validate(raw),
            CatDocumentSchema.from_path(schema_path),
        )

    def normalize_document(self, document: CatDocument) -> CatDocument:
        traits: dict[str, JsonValue] = {}
        unknown = deepcopy(document.unknown_traits)
        for raw_id, value in document.traits.items():
            trait_id = self.manifest.aliases.get(raw_id, raw_id)
            if trait_id in self._traits_by_id:
                traits[trait_id] = deepcopy(value)
            elif trait_id not in self.manifest.tombstones:
                unknown[raw_id] = deepcopy(value)
        self._apply_defaults(traits)
        normalized = CatDocument(
            schemaVersion=self.manifest.schema_version,
            traits=traits,
            unknownTraits=unknown,
        )
        if self.document_schema is not None:
            self.document_schema.validate(normalized)
        return normalized

    def from_legacy_params(
        self,
        params: dict[str, JsonValue],
        pose_for_sprite_number: Callable[[int | None], str | None],
    ) -> CatDocument:
        traits: dict[str, JsonValue] = {}
        consumed: set[str] = set()

        for trait in self.manifest.traits:
            binding = trait.legacy
            value: JsonValue | None = None
            present = False

            if isinstance(binding, DirectBinding):
                consumed.add(binding.key)
                if binding.key in params:
                    value = deepcopy(params[binding.key])
                    present = True
                    schema_allows_none = (
                        self.document_schema is not None
                        and self.document_schema.trait_explicitly_allows(
                            trait.id, "none"
                        )
                    )
                    if (
                        not trait.required
                        and trait.value_kind == "string"
                        and not trait.has_default
                        and not schema_allows_none
                        and isinstance(value, str)
                        and value.strip().lower() in {"", "none", "null"}
                    ):
                        value = None
                        present = False
            elif isinstance(binding, ListBinding):
                consumed.add(binding.key)
                if binding.single_key:
                    consumed.add(binding.single_key)
                present = binding.key in params or bool(
                    binding.single_key and binding.single_key in params
                )
                if present:
                    value = _normalise_string_list(
                        params.get(binding.key),
                        params.get(binding.single_key) if binding.single_key else None,
                    )
            elif isinstance(binding, PoseBinding):
                consumed.update(
                    {
                        binding.key,
                        binding.sprite_key,
                        "pose_name",
                        "sprite_number",
                        "sprite",
                    }
                )
                raw_pose = params.get(binding.key, params.get("pose_name"))
                if isinstance(raw_pose, str) and raw_pose.strip():
                    value = raw_pose.strip()
                    present = True
                else:
                    raw_sprite = params.get(
                        binding.sprite_key,
                        params.get("sprite_number", params.get("sprite")),
                    )
                    try:
                        sprite_number = (
                            int(raw_sprite) if raw_sprite is not None else None
                        )
                    except (TypeError, ValueError):
                        sprite_number = None
                    pose_name = pose_for_sprite_number(sprite_number)
                    if pose_name:
                        value = pose_name
                        present = True
            elif isinstance(binding, TortieBinding):
                tortie_keys = {
                    "tortie",
                    "isTortie",
                    "tortieMask",
                    "tortiePattern",
                    "tortieColour",
                }
                consumed.update(tortie_keys)
                present = any(key in params for key in tortie_keys)
                if isinstance(params.get("tortie"), list):
                    value = [
                        deepcopy(entry)
                        for entry in params["tortie"]
                        if isinstance(entry, dict)
                    ]
                elif _truthy(params.get("isTortie")):
                    value = [
                        {
                            "mask": str(params.get("tortieMask") or "ONE"),
                            "pattern": str(
                                params.get("tortiePattern") or "SingleColour"
                            ),
                            "colour": str(params.get("tortieColour") or "GINGER"),
                        }
                    ]
                else:
                    value = []
            elif isinstance(binding, BooleanAliasBinding):
                keys = [binding.key, *binding.aliases]
                consumed.update(keys)
                present = any(key in params for key in keys)
                if present:
                    value = any(_truthy(params.get(key)) for key in keys)

            if present and value is not None:
                traits[trait.id] = value

        self._normalise_legacy_coat(params, traits)
        self._apply_defaults(traits)
        unknown = {
            key: deepcopy(value) for key, value in params.items() if key not in consumed
        }
        document = CatDocument(
            schemaVersion=self.manifest.schema_version,
            traits=traits,
            unknownTraits=unknown,
        )
        if self.document_schema is not None:
            self.document_schema.validate(document)
        return document

    def to_renderer_params(
        self,
        document: CatDocument,
        sprite_number_for_pose: Callable[[str | None, int | None], int],
    ) -> dict[str, JsonValue]:
        normalized = self.normalize_document(document)
        params: dict[str, JsonValue] = {}

        for trait in self.manifest.traits:
            if trait.id not in normalized.traits:
                continue
            value = deepcopy(normalized.traits[trait.id])
            binding = trait.legacy
            if isinstance(binding, DirectBinding):
                params[binding.key] = value
            elif isinstance(binding, ListBinding):
                values = value if isinstance(value, list) else []
                params[binding.key] = values
                if binding.single_key and values:
                    params[binding.single_key] = deepcopy(values[0])
            elif isinstance(binding, PoseBinding):
                pose_name = value if isinstance(value, str) else None
                if pose_name:
                    params[binding.key] = pose_name
                    params[binding.sprite_key] = sprite_number_for_pose(pose_name, 0)
            elif isinstance(binding, TortieBinding):
                layers = value if isinstance(value, list) else []
                params["tortie"] = layers
                params["isTortie"] = bool(layers)
                primary = layers[0] if layers and isinstance(layers[0], dict) else None
                if primary:
                    for legacy_key, layer_key in (
                        ("tortieMask", "mask"),
                        ("tortiePattern", "pattern"),
                        ("tortieColour", "colour"),
                    ):
                        layer_value = primary.get(layer_key)
                        if isinstance(layer_value, (str, int, float, bool)):
                            params[legacy_key] = layer_value
            elif isinstance(binding, BooleanAliasBinding):
                enabled = _truthy(value)
                params[binding.key] = enabled
                for alias in binding.aliases:
                    params[alias] = enabled

        return params

    def _apply_defaults(self, traits: dict[str, JsonValue]) -> None:
        for trait in self.manifest.traits:
            if trait.id not in traits and trait.has_default:
                traits[trait.id] = deepcopy(trait.default)

    @staticmethod
    def _normalise_legacy_coat(
        params: dict[str, JsonValue],
        traits: dict[str, JsonValue],
    ) -> None:
        pattern = normalize_coat_pattern_name(params.get("coatPattern"))
        legacy_pattern = normalize_coat_pattern_name(params.get("peltName"))
        if pattern or legacy_pattern:
            traits["pelt"] = "SingleColour"
            traits["coatPattern"] = pattern or legacy_pattern


__all__ = [
    "DEFAULT_COMPATIBILITY_PATH",
    "CompatibilityManifest",
    "LegacyCatAdapter",
]
