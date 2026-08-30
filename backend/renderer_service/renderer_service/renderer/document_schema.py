from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

from .contracts import CatDocument

GENERATED_DIR = Path(__file__).resolve().parents[1] / "generated"
DEFAULT_DOCUMENT_SCHEMA_PATH = GENERATED_DIR / "cat-document.schema.json"


class InvalidCatDocument(ValueError):
    pass


class CatDocumentSchema:
    """Validator for the portable JSON-Schema subset emitted by the TS compiler."""

    def __init__(self, schema: dict[str, Any]) -> None:
        if not isinstance(schema.get("properties"), dict):
            raise InvalidCatDocument("Cat document schema has no properties object")
        traits = schema["properties"].get("traits")
        if not isinstance(traits, dict) or not isinstance(
            traits.get("properties"), dict
        ):
            raise InvalidCatDocument("Cat document schema has no trait definitions")
        self.schema = schema
        self.trait_ids = frozenset(str(key) for key in traits["properties"])
        version_schema = schema["properties"].get("schemaVersion", {})
        self.schema_version = version_schema.get("const")
        if not isinstance(self.schema_version, int):
            raise InvalidCatDocument(
                "Cat document schemaVersion must be an integer const"
            )

    @classmethod
    def from_path(
        cls,
        path: Path = DEFAULT_DOCUMENT_SCHEMA_PATH,
    ) -> CatDocumentSchema:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise InvalidCatDocument(
                f"Generated cat document schema is missing: {path}"
            ) from exc
        except json.JSONDecodeError as exc:
            raise InvalidCatDocument(
                f"Generated cat document schema is invalid JSON: {exc}"
            ) from exc
        if not isinstance(raw, dict):
            raise InvalidCatDocument("Generated cat document schema must be an object")
        return cls(raw)

    def assert_compatible(
        self,
        *,
        schema_version: int,
        trait_ids: set[str],
    ) -> None:
        if schema_version != self.schema_version:
            raise InvalidCatDocument(
                "Compatibility manifest and cat document schema use different "
                f"versions ({schema_version} != {self.schema_version})"
            )
        if trait_ids != self.trait_ids:
            missing = sorted(self.trait_ids - trait_ids)
            extra = sorted(trait_ids - self.trait_ids)
            raise InvalidCatDocument(
                "Compatibility manifest and cat document schema disagree on traits "
                f"(missing={missing}, extra={extra})"
            )

    def validate(self, document: CatDocument) -> None:
        payload = document.model_dump(by_alias=True, exclude_none=True)
        try:
            self._validate_node(payload, self.schema, "$")
        except InvalidCatDocument:
            raise
        except (TypeError, ValueError) as exc:
            raise InvalidCatDocument(f"Cat document validation failed: {exc}") from exc

    def trait_explicitly_allows(self, trait_id: str, value: Any) -> bool:
        """Return whether a trait schema declares a concrete enum/const value."""
        trait_schema = self.schema["properties"]["traits"]["properties"].get(trait_id)
        return isinstance(trait_schema, dict) and self._explicitly_allows(
            trait_schema, value
        )

    def _explicitly_allows(self, schema: dict[str, Any], value: Any) -> bool:
        reference = schema.get("$ref")
        if isinstance(reference, str):
            return self._explicitly_allows(self._resolve_ref(reference), value)
        if "const" in schema:
            return schema["const"] == value
        enum_values = schema.get("enum")
        if isinstance(enum_values, list) and value in enum_values:
            return True
        alternatives = schema.get("anyOf")
        return isinstance(alternatives, list) and any(
            isinstance(alternative, dict)
            and self._explicitly_allows(alternative, value)
            for alternative in alternatives
        )

    def _resolve_ref(self, reference: str) -> dict[str, Any]:
        if not reference.startswith("#/"):
            raise InvalidCatDocument(
                f"Unsupported external schema reference {reference}"
            )
        value: Any = self.schema
        for raw_segment in reference[2:].split("/"):
            segment = raw_segment.replace("~1", "/").replace("~0", "~")
            if not isinstance(value, dict) or segment not in value:
                raise InvalidCatDocument(f"Broken schema reference {reference}")
            value = value[segment]
        if not isinstance(value, dict):
            raise InvalidCatDocument(f"Schema reference {reference} is not an object")
        return value

    def _validate_node(
        self,
        value: Any,
        schema: dict[str, Any],
        path: str,
    ) -> None:
        reference = schema.get("$ref")
        if isinstance(reference, str):
            self._validate_node(value, self._resolve_ref(reference), path)
            return

        alternatives = schema.get("anyOf")
        if isinstance(alternatives, list):
            for alternative in alternatives:
                if not isinstance(alternative, dict):
                    continue
                try:
                    self._validate_node(value, alternative, path)
                except InvalidCatDocument:
                    continue
                return
            raise InvalidCatDocument(f"{path} does not match any allowed schema")

        if "const" in schema and value != schema["const"]:
            raise InvalidCatDocument(
                f"{path} must equal {schema['const']!r}, received {value!r}"
            )
        if "enum" in schema and value not in schema["enum"]:
            raise InvalidCatDocument(f"{path} contains an unsupported value {value!r}")

        expected_type = schema.get("type")
        if isinstance(expected_type, list):
            if not any(
                self._matches_type(value, candidate) for candidate in expected_type
            ):
                raise InvalidCatDocument(
                    f"{path} must be one of {expected_type}, received {type(value).__name__}"
                )
        elif isinstance(expected_type, str) and not self._matches_type(
            value, expected_type
        ):
            raise InvalidCatDocument(
                f"{path} must be {expected_type}, received {type(value).__name__}"
            )

        if isinstance(value, dict):
            self._validate_object(value, schema, path)
        elif isinstance(value, list):
            self._validate_array(value, schema, path)
        elif isinstance(value, str):
            self._validate_string(value, schema, path)
        elif self._is_number(value):
            self._validate_number(value, schema, path)

    def _validate_object(
        self,
        value: dict[str, Any],
        schema: dict[str, Any],
        path: str,
    ) -> None:
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        for key in required:
            if key not in value:
                raise InvalidCatDocument(f"{path}.{key} is required")
        additional = schema.get("additionalProperties", True)
        for key, entry in value.items():
            child_path = f"{path}.{key}"
            child_schema = properties.get(key)
            if isinstance(child_schema, dict):
                self._validate_node(entry, child_schema, child_path)
            elif additional is False:
                raise InvalidCatDocument(f"{child_path} is not allowed")
            elif isinstance(additional, dict):
                self._validate_node(entry, additional, child_path)

    def _validate_array(
        self,
        value: list[Any],
        schema: dict[str, Any],
        path: str,
    ) -> None:
        minimum = schema.get("minItems")
        maximum = schema.get("maxItems")
        if isinstance(minimum, int) and len(value) < minimum:
            raise InvalidCatDocument(f"{path} needs at least {minimum} items")
        if isinstance(maximum, int) and len(value) > maximum:
            raise InvalidCatDocument(f"{path} allows at most {maximum} items")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, entry in enumerate(value):
                self._validate_node(entry, item_schema, f"{path}[{index}]")
        if schema.get("uniqueItems") is True:
            first_index_by_value: dict[tuple[Any, ...], int] = {}
            for index, entry in enumerate(value):
                key = self._json_semantic_key(entry)
                first_index = first_index_by_value.get(key)
                if first_index is not None:
                    raise InvalidCatDocument(
                        f"{path}[{index}] duplicates {path}[{first_index}]; "
                        f"{path} requires unique items"
                    )
                first_index_by_value[key] = index

    @classmethod
    def _json_semantic_key(cls, value: Any) -> tuple[Any, ...]:
        if value is None:
            return ("null",)
        if isinstance(value, bool):
            return ("boolean", value)
        if cls._is_number(value):
            return ("number", value)
        if isinstance(value, str):
            return ("string", value)
        if isinstance(value, list):
            return ("array", *(cls._json_semantic_key(entry) for entry in value))
        if isinstance(value, dict):
            return (
                "object",
                *(
                    (str(key), cls._json_semantic_key(entry))
                    for key, entry in sorted(
                        value.items(), key=lambda item: str(item[0])
                    )
                ),
            )
        raise InvalidCatDocument(
            f"Unsupported JSON value for uniqueItems: {type(value).__name__}"
        )

    @staticmethod
    def _validate_string(
        value: str,
        schema: dict[str, Any],
        path: str,
    ) -> None:
        minimum = schema.get("minLength")
        maximum = schema.get("maxLength")
        if isinstance(minimum, int) and len(value) < minimum:
            raise InvalidCatDocument(f"{path} is shorter than {minimum} characters")
        if isinstance(maximum, int) and len(value) > maximum:
            raise InvalidCatDocument(f"{path} is longer than {maximum} characters")
        pattern = schema.get("pattern")
        if isinstance(pattern, str) and re.search(pattern, value) is None:
            raise InvalidCatDocument(f"{path} does not match {pattern!r}")

    @staticmethod
    def _validate_number(
        value: float,
        schema: dict[str, Any],
        path: str,
    ) -> None:
        if not math.isfinite(value):
            raise InvalidCatDocument(f"{path} must be finite")
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        if isinstance(minimum, (int, float)) and value < minimum:
            raise InvalidCatDocument(f"{path} must be at least {minimum}")
        if isinstance(maximum, (int, float)) and value > maximum:
            raise InvalidCatDocument(f"{path} must be at most {maximum}")

    @staticmethod
    def _is_number(value: Any) -> bool:
        return isinstance(value, (int, float)) and not isinstance(value, bool)

    @classmethod
    def _matches_type(cls, value: Any, expected_type: str) -> bool:
        if expected_type == "null":
            return value is None
        if expected_type == "boolean":
            return isinstance(value, bool)
        if expected_type == "number":
            return cls._is_number(value)
        if expected_type == "integer":
            return isinstance(value, int) and not isinstance(value, bool)
        if expected_type == "string":
            return isinstance(value, str)
        if expected_type == "array":
            return isinstance(value, list)
        if expected_type == "object":
            return isinstance(value, dict)
        raise InvalidCatDocument(f"Unsupported generated schema type {expected_type!r}")


__all__ = [
    "DEFAULT_DOCUMENT_SCHEMA_PATH",
    "CatDocumentSchema",
    "InvalidCatDocument",
]
