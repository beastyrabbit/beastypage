from __future__ import annotations

import base64
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

from .executor import InvalidRenderPlan

GENERATED_DIR = Path(__file__).resolve().parents[1] / "generated"
DEFAULT_INTEGRITY_PATH = GENERATED_DIR / "bundle-integrity.json"

_HASH_PATTERN = re.compile(r"^[a-f0-9]{64}$")
_CATALOG_HASH_PLACEHOLDER = b"0" * 64
_ARTIFACT_COMPONENTS = {
    "catDocumentSchema": ("cat-document.schema.json", False),
    "compatibility": ("compatibility.json", False),
    "publicCatCatalog": ("public-cat-catalog.json", True),
    "renderPlan": ("render-plan.json", True),
    "renderStrategyManifest": ("render-strategies.manifest.json", False),
}
_ASSET_TREE_COMPONENTS = frozenset({"palettes", "spriteData", "sprites"})
_COMPONENT_NAMES = frozenset(_ARTIFACT_COMPONENTS) | _ASSET_TREE_COMPONENTS


class InvalidBundleIntegrity(InvalidRenderPlan):
    pass


@dataclass(frozen=True)
class BundleIntegrityMetadata:
    catalog_hash: str
    schema_version: int


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _read_bytes(path: Path, description: str) -> bytes:
    try:
        return path.read_bytes()
    except FileNotFoundError as exc:
        raise InvalidBundleIntegrity(
            f"Required {description} is missing: {path}"
        ) from exc


def _read_json_object(path: Path, description: str) -> tuple[dict[str, Any], bytes]:
    raw = _read_bytes(path, description)
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidBundleIntegrity(
            f"Invalid JSON in {description} {path}: {exc}"
        ) from exc
    if not isinstance(value, dict):
        raise InvalidBundleIntegrity(
            f"{description.capitalize()} must be a JSON object"
        )
    return value, raw


def _require_hash(value: object, description: str) -> str:
    if not isinstance(value, str) or _HASH_PATTERN.fullmatch(value) is None:
        raise InvalidBundleIntegrity(
            f"{description} must be a lowercase 64-character SHA-256 hash"
        )
    return value


def _require_schema_version(value: object, description: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise InvalidBundleIntegrity(f"{description} must be a positive integer")
    return value


def _validate_relative_path(value: object, description: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value:
        raise InvalidBundleIntegrity(f"{description} is not a portable relative path")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise InvalidBundleIntegrity(f"{description} is not a safe relative path")
    if path.as_posix() != value:
        raise InvalidBundleIntegrity(f"{description} is not canonically encoded")
    return value


def _validate_digest_map(value: object, description: str) -> dict[str, str]:
    if not isinstance(value, dict):
        raise InvalidBundleIntegrity(f"{description} must be an object")
    result: dict[str, str] = {}
    for raw_path, raw_digest in value.items():
        path = _validate_relative_path(raw_path, f"{description} path")
        result[path] = _require_hash(raw_digest, f"{description}[{path!r}]")
    if not result:
        raise InvalidBundleIntegrity(f"{description} must not be empty")
    return result


def _byte_sorted_pairs(values: dict[str, str]) -> list[list[str]]:
    return [
        [key, values[key]]
        for key in sorted(values, key=lambda item: item.encode("utf-8"))
    ]


def _asset_tree_manifest_hash(files: dict[str, str]) -> str:
    # Paths are base64-encoded UTF-8 before hashing. The resulting compact JSON
    # contains ASCII strings only and exactly matches JSON.stringify in the TS
    # generator, independent of locale and Unicode key-ordering differences.
    entries = [
        [base64.b64encode(path.encode("utf-8")).decode("ascii"), digest]
        for path, digest in _byte_sorted_pairs(files)
    ]
    return _sha256(
        json.dumps(entries, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    )


def _bundle_catalog_hash(schema_version: int, components: dict[str, str]) -> str:
    # This array-only, ASCII payload is the cross-language catalog-hash preimage.
    # Keep it in lockstep with buildBundleCatalogHash in generate-cat-system.ts.
    payload = [1, schema_version, _byte_sorted_pairs(components)]
    return _sha256(
        json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    )


def _hash_catalog_artifact(raw: bytes, catalog_hash: str, description: str) -> str:
    encoded_hash = catalog_hash.encode("ascii")
    if raw.count(encoded_hash) != 1:
        raise InvalidBundleIntegrity(
            f"{description} must contain its root catalogHash exactly once"
        )
    return _sha256(raw.replace(encoded_hash, _CATALOG_HASH_PLACEHOLDER, 1))


def _canonical_json_bytes(raw: bytes, description: str) -> bytes:
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidBundleIntegrity(f"Invalid JSON in {description}: {exc}") from exc

    def stable_value(item: Any) -> Any:
        if isinstance(item, list):
            return [stable_value(entry) for entry in item]
        if isinstance(item, dict):
            return {
                key: stable_value(item[key])
                for key in sorted(item, key=lambda entry: entry.encode("utf-8"))
            }
        return item

    try:
        return json.dumps(
            stable_value(value),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise InvalidBundleIntegrity(
            f"Unsupported JSON value in {description}: {exc}"
        ) from exc


def _hash_asset_tree(
    root: Path,
    *,
    top_level_json_only: bool,
    canonical_json: bool = False,
) -> dict[str, str]:
    if not root.is_dir():
        raise InvalidBundleIntegrity(f"Required asset tree is missing: {root}")
    paths = (
        (path for path in root.iterdir() if path.is_file() and path.suffix == ".json")
        if top_level_json_only
        else (path for path in root.rglob("*") if path.is_file())
    )
    result: dict[str, str] = {}
    for path in sorted(
        paths, key=lambda item: item.relative_to(root).as_posix().encode("utf-8")
    ):
        relative_path = path.relative_to(root).as_posix()
        raw = path.read_bytes()
        normalized = (
            _canonical_json_bytes(raw, f"palette {relative_path}")
            if canonical_json
            else raw
        )
        result[relative_path] = _sha256(normalized)
    return result


def _resolve_palette_root(data_root: Path) -> Path:
    data_palette_root = data_root / "palettes"
    if data_palette_root.is_dir():
        return data_palette_root
    return Path(__file__).resolve().parents[1] / "data" / "palettes"


def _assert_tree_matches(
    name: str,
    expected: dict[str, str],
    actual: dict[str, str],
) -> None:
    if expected == actual:
        return
    expected_paths = set(expected)
    actual_paths = set(actual)
    missing = sorted(expected_paths - actual_paths)
    extra = sorted(actual_paths - expected_paths)
    changed = sorted(
        path for path in expected_paths & actual_paths if expected[path] != actual[path]
    )
    raise InvalidBundleIntegrity(
        f"{name} asset tree drifted from the catalog hash "
        f"(missing={missing[:5]}, extra={extra[:5]}, changed={changed[:5]})"
    )


def verify_bundle_integrity(
    *,
    integrity_path: Path = DEFAULT_INTEGRITY_PATH,
    sprite_root: Path,
    data_root: Path,
    expected_catalog_hash: str | None = None,
) -> BundleIntegrityMetadata:
    manifest, _ = _read_json_object(integrity_path, "bundle integrity manifest")
    required_keys = {
        "formatVersion",
        "hashAlgorithm",
        "schemaVersion",
        "catalogHash",
        "components",
        "assetTrees",
    }
    if set(manifest) != required_keys:
        raise InvalidBundleIntegrity(
            "Bundle integrity manifest fields drifted "
            f"(expected={sorted(required_keys)}, actual={sorted(manifest)})"
        )
    if manifest["formatVersion"] != 1 or manifest["hashAlgorithm"] != "sha256":
        raise InvalidBundleIntegrity("Unsupported bundle integrity manifest format")

    schema_version = _require_schema_version(
        manifest["schemaVersion"], "Integrity schemaVersion"
    )
    catalog_hash = _require_hash(manifest["catalogHash"], "Integrity catalogHash")

    raw_components = manifest["components"]
    if not isinstance(raw_components, dict) or set(raw_components) != _COMPONENT_NAMES:
        actual_names = (
            sorted(raw_components) if isinstance(raw_components, dict) else []
        )
        raise InvalidBundleIntegrity(
            "Bundle integrity components drifted "
            f"(expected={sorted(_COMPONENT_NAMES)}, actual={actual_names})"
        )
    components = {
        name: _require_hash(raw_components[name], f"Component {name}")
        for name in _COMPONENT_NAMES
    }

    raw_asset_trees = manifest["assetTrees"]
    if (
        not isinstance(raw_asset_trees, dict)
        or set(raw_asset_trees) != _ASSET_TREE_COMPONENTS
    ):
        raise InvalidBundleIntegrity(
            "Bundle integrity assetTrees must contain palettes, spriteData, and sprites"
        )
    asset_trees = {
        name: _validate_digest_map(raw_asset_trees[name], f"assetTrees.{name}")
        for name in _ASSET_TREE_COMPONENTS
    }
    for name in _ASSET_TREE_COMPONENTS:
        manifest_tree_hash = _asset_tree_manifest_hash(asset_trees[name])
        if manifest_tree_hash != components[name]:
            raise InvalidBundleIntegrity(
                f"assetTrees.{name} is not bound to component {name}"
            )

    computed_catalog_hash = _bundle_catalog_hash(schema_version, components)
    if computed_catalog_hash != catalog_hash:
        raise InvalidBundleIntegrity(
            "Bundle integrity components are not bound to catalogHash "
            f"({computed_catalog_hash} != {catalog_hash})"
        )

    generated_dir = integrity_path.parent
    catalog_hash_bytes = _read_bytes(
        generated_dir / "catalog-hash.txt", "catalog hash anchor"
    )
    if catalog_hash_bytes != f"{catalog_hash}\n".encode("ascii"):
        raise InvalidBundleIntegrity(
            "catalog-hash.txt does not match the integrity catalogHash"
        )

    configured_hash = (
        "unknown" if expected_catalog_hash is None else expected_catalog_hash
    ).strip()
    if (
        configured_hash != "unknown"
        and _HASH_PATTERN.fullmatch(configured_hash) is None
    ):
        raise InvalidBundleIntegrity(
            "CAT_SYSTEM_CATALOG_HASH must be 'unknown' or a lowercase SHA-256 hash"
        )
    if configured_hash not in {"unknown", catalog_hash}:
        raise InvalidBundleIntegrity(
            "CAT_SYSTEM_CATALOG_HASH does not match bundle integrity catalogHash "
            f"({configured_hash} != {catalog_hash})"
        )

    parsed_artifacts: dict[str, dict[str, Any]] = {}
    artifact_contents: dict[str, bytes] = {}
    for component_name, (
        filename,
        normalizes_catalog_hash,
    ) in _ARTIFACT_COMPONENTS.items():
        path = generated_dir / filename
        if filename.endswith(".json"):
            parsed, raw = _read_json_object(path, component_name)
            parsed_artifacts[component_name] = parsed
        else:
            raw = _read_bytes(path, component_name)
        artifact_contents[component_name] = raw

    document_schema = parsed_artifacts["catDocumentSchema"]
    try:
        document_version = document_schema["properties"]["schemaVersion"]["const"]
    except (KeyError, TypeError) as exc:
        raise InvalidBundleIntegrity(
            "cat-document.schema.json has no schemaVersion const"
        ) from exc
    versions = {
        "integrity": schema_version,
        "documentSchema": _require_schema_version(
            document_version, "Document schemaVersion"
        ),
        "compatibility": _require_schema_version(
            parsed_artifacts["compatibility"].get("schemaVersion"),
            "Compatibility schemaVersion",
        ),
        "publicCatalog": _require_schema_version(
            parsed_artifacts["publicCatCatalog"].get("schemaVersion"),
            "Public catalog schemaVersion",
        ),
        "renderPlan": _require_schema_version(
            parsed_artifacts["renderPlan"].get("schemaVersion"),
            "Render plan schemaVersion",
        ),
    }
    if len(set(versions.values())) != 1:
        raise InvalidBundleIntegrity(f"Bundle schemaVersion mismatch: {versions}")

    for name in ("publicCatCatalog", "renderPlan"):
        artifact_hash = parsed_artifacts[name].get("catalogHash")
        if artifact_hash != catalog_hash:
            raise InvalidBundleIntegrity(
                f"{name} catalogHash does not match bundle integrity catalogHash"
            )

    for component_name, (
        filename,
        normalizes_catalog_hash,
    ) in _ARTIFACT_COMPONENTS.items():
        raw = artifact_contents[component_name]
        actual_digest = (
            _hash_catalog_artifact(raw, catalog_hash, component_name)
            if normalizes_catalog_hash
            else _sha256(raw)
        )
        if actual_digest != components[component_name]:
            raise InvalidBundleIntegrity(
                f"{filename} drifted from the catalog hash "
                f"({actual_digest} != {components[component_name]})"
            )

    _assert_tree_matches(
        "palettes",
        asset_trees["palettes"],
        _hash_asset_tree(
            _resolve_palette_root(data_root),
            top_level_json_only=True,
            canonical_json=True,
        ),
    )
    _assert_tree_matches(
        "spriteData",
        asset_trees["spriteData"],
        _hash_asset_tree(data_root, top_level_json_only=True),
    )
    _assert_tree_matches(
        "sprites",
        asset_trees["sprites"],
        _hash_asset_tree(sprite_root, top_level_json_only=False),
    )
    return BundleIntegrityMetadata(
        catalog_hash=catalog_hash,
        schema_version=schema_version,
    )


__all__ = [
    "DEFAULT_INTEGRITY_PATH",
    "BundleIntegrityMetadata",
    "InvalidBundleIntegrity",
    "verify_bundle_integrity",
]
