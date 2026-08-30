from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Generic, TypeVar

from PIL import Image
from pydantic import JsonValue

from .contracts import BlendMode, ContractModel, OperationBase

ConfigT = TypeVar("ConfigT", bound=ContractModel)


@dataclass
class StrategyResult:
    image: Image.Image | None = None
    diagnostics: list[str] | None = None
    blend_mode: BlendMode = "alpha"
    transform_previous_layers: bool = False

    def diagnostic_entries(self) -> list[str]:
        return list(self.diagnostics or [])


@dataclass(frozen=True)
class StrategyContext:
    renderer: object
    catalogs: Mapping[str, Mapping[str, Mapping[str, JsonValue]]]


StrategyHandler = Callable[
    [StrategyContext, OperationBase, ContractModel, dict[str, JsonValue], Image.Image],
    StrategyResult,
]


@dataclass(frozen=True)
class StrategyDefinition(Generic[ConfigT]):
    key: str
    version: int
    config_model: type[ConfigT]
    handler: StrategyHandler


class UnknownRenderStrategy(ValueError):
    pass


class StrategyRegistry:
    def __init__(self) -> None:
        self._definitions: dict[tuple[str, int], StrategyDefinition] = {}
        self._frozen = False

    def register(
        self,
        key: str,
        version: int,
        config_model: type[ConfigT],
        handler: StrategyHandler,
    ) -> None:
        if self._frozen:
            raise RuntimeError("Strategy registry is frozen")
        identity = (key, version)
        if identity in self._definitions:
            raise ValueError(f"Duplicate render strategy {key}@{version}")
        self._definitions[identity] = StrategyDefinition(
            key=key,
            version=version,
            config_model=config_model,
            handler=handler,
        )

    def freeze(self) -> StrategyRegistry:
        self._frozen = True
        return self

    @property
    def definitions(self) -> Mapping[tuple[str, int], StrategyDefinition]:
        return MappingProxyType(self._definitions)

    def resolve(self, key: str, version: int) -> StrategyDefinition:
        try:
            return self._definitions[(key, version)]
        except KeyError as exc:
            raise UnknownRenderStrategy(
                f"Unknown render strategy {key}@{version}"
            ) from exc

    def manifest_payload(self) -> dict[str, JsonValue]:
        strategies: list[dict[str, JsonValue]] = []
        for definition in sorted(
            self._definitions.values(),
            key=lambda item: (item.key, item.version),
        ):
            strategies.append(
                {
                    "key": definition.key,
                    "version": definition.version,
                    "configSchema": definition.config_model.model_json_schema(
                        by_alias=True,
                        mode="validation",
                    ),
                }
            )
        return {"formatVersion": 1, "strategies": strategies}

    def manifest_bytes(self) -> bytes:
        rendered = json.dumps(
            self.manifest_payload(),
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        return f"{rendered}\n".encode()

    def manifest_sha256(self) -> str:
        return hashlib.sha256(self.manifest_bytes()).hexdigest()

    def write_manifest(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(self.manifest_bytes())

    def check_manifest(self, path: Path) -> None:
        try:
            actual = path.read_bytes()
        except FileNotFoundError as exc:
            raise ValueError(f"Render strategy manifest is missing: {path}") from exc
        expected = self.manifest_bytes()
        if actual != expected:
            raise ValueError(
                "Render strategy manifest is stale. Run "
                "`python -m renderer_service.render_contract --write`."
            )


__all__ = [
    "StrategyContext",
    "StrategyDefinition",
    "StrategyRegistry",
    "StrategyResult",
    "UnknownRenderStrategy",
]
