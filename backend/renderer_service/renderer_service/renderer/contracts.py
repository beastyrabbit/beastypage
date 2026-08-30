from __future__ import annotations

from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, JsonValue

OperationId = Annotated[
    str,
    Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$"),
]
TraitId = Annotated[
    str,
    Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$"),
]
HashValue = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
BlendMode = Literal["alpha", "multiply", "screen", "add", "replace"]


class ContractModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid", strict=True)


class EmptyConfig(ContractModel):
    pass


class SpriteLayerConfig(ContractModel):
    value_trait: TraitId = Field(alias="valueTrait")
    sprite_family: str = Field(alias="spriteFamily", min_length=1, max_length=64)
    tint_trait: TraitId | None = Field(default=None, alias="tintTrait")
    tint_resolver: Literal["whitePatch"] | None = Field(
        default=None,
        alias="tintResolver",
    )
    diagnostic_prefix: str = Field(
        default="sprite",
        alias="diagnosticPrefix",
        min_length=1,
        max_length=64,
    )
    sprite_by_value: dict[str, str] = Field(
        default_factory=dict,
        alias="spriteByValue",
    )


class BooleanSpriteLayerConfig(ContractModel):
    value_trait: TraitId = Field(alias="valueTrait")
    sprite_keys: list[str] = Field(alias="spriteKeys", min_length=1)
    blend: BlendMode = "alpha"
    diagnostic: str = Field(min_length=1, max_length=128)


class SolidMultiplyConfig(ContractModel):
    value_trait: TraitId = Field(alias="valueTrait")
    colour: list[Annotated[int, Field(ge=0, le=255)]] = Field(
        min_length=4,
        max_length=4,
    )
    diagnostic: str = Field(min_length=1, max_length=128)


class CatalogSpriteListConfig(ContractModel):
    value_trait: TraitId = Field(alias="valueTrait")
    catalog: str = Field(min_length=1, max_length=128)
    resolver: Literal["accessory", "direct", "mapping"]
    sprites: dict[str, str] = Field(default_factory=dict)
    available_poses: dict[str, list[str]] = Field(
        default_factory=dict,
        alias="availablePoses",
    )
    blend: BlendMode = "alpha"


class GlobalMirrorConfig(ContractModel):
    value_trait: TraitId = Field(alias="valueTrait")
    affects_previous_layers: bool = Field(
        default=True,
        alias="affectsPreviousLayers",
    )


class RenderCatalogEntry(ContractModel):
    id: str = Field(min_length=1, max_length=256)
    label: str = Field(min_length=1, max_length=256)
    sprite_key: str | None = Field(default=None, alias="spriteKey")
    poses: list[str] = Field(default_factory=list)
    deprecated: bool = False
    weight: Annotated[float, Field(gt=0)] | None = None


class OperationBase(ContractModel):
    id: OperationId
    layer_id: OperationId = Field(alias="layerId")
    strategy_version: Literal[1] = Field(alias="strategyVersion")
    depends_on: list[OperationId] = Field(default_factory=list, alias="dependsOn")
    order: int = 0
    reads: list[TraitId] = Field(default_factory=list)


class BasePeltOperation(OperationBase):
    strategy: Literal["basePelt"]
    config: EmptyConfig = Field(default_factory=EmptyConfig)


class CoatPatternOperation(OperationBase):
    strategy: Literal["coatPattern"]
    config: EmptyConfig = Field(default_factory=EmptyConfig)


class TintMultiplyOperation(OperationBase):
    strategy: Literal["tintMultiply"]
    config: EmptyConfig = Field(default_factory=EmptyConfig)


class SpriteLayerOperation(OperationBase):
    strategy: Literal["spriteLayer"]
    config: SpriteLayerConfig


class EyesOperation(OperationBase):
    strategy: Literal["eyes"]
    config: EmptyConfig = Field(default_factory=EmptyConfig)


class ScarPrimaryOperation(OperationBase):
    strategy: Literal["scarPrimary"]
    config: EmptyConfig = Field(default_factory=EmptyConfig)


class BooleanSpriteLayerOperation(OperationBase):
    strategy: Literal["booleanSpriteLayer"]
    config: BooleanSpriteLayerConfig


class SolidMultiplyOperation(OperationBase):
    strategy: Literal["solidMultiply"]
    config: SolidMultiplyConfig


class LineartOperation(OperationBase):
    strategy: Literal["lineart"]
    config: EmptyConfig = Field(default_factory=EmptyConfig)


class ScarSecondaryOperation(OperationBase):
    strategy: Literal["scarSecondary"]
    config: EmptyConfig = Field(default_factory=EmptyConfig)


class CatalogSpriteListOperation(OperationBase):
    strategy: Literal["catalogSpriteList"]
    config: CatalogSpriteListConfig


class GlobalMirrorOperation(OperationBase):
    strategy: Literal["globalMirror"]
    config: GlobalMirrorConfig


RenderOperation: TypeAlias = Annotated[
    BasePeltOperation
    | CoatPatternOperation
    | TintMultiplyOperation
    | SpriteLayerOperation
    | EyesOperation
    | ScarPrimaryOperation
    | BooleanSpriteLayerOperation
    | SolidMultiplyOperation
    | LineartOperation
    | ScarSecondaryOperation
    | CatalogSpriteListOperation
    | GlobalMirrorOperation,
    Field(discriminator="strategy"),
]


class RenderPlan(ContractModel):
    format_version: Literal[1] = Field(alias="formatVersion")
    schema_version: int = Field(alias="schemaVersion", ge=1)
    catalog_hash: HashValue = Field(alias="catalogHash")
    manifest_hash: HashValue = Field(alias="manifestHash")
    catalogs: dict[str, list[RenderCatalogEntry]] = Field(default_factory=dict)
    operations: list[RenderOperation] = Field(min_length=1)


class CatDocument(ContractModel):
    """Portable renderer read contract.

    TypeScript owns the exact trait schema. Python deliberately accepts JSON-valued
    trait entries so an older renderer can ignore traits introduced by a newer
    catalog during a rollback. Every operation still receives a Pydantic-validated,
    strategy-specific configuration.
    """

    schema_version: int = Field(alias="schemaVersion", ge=1)
    traits: dict[TraitId, JsonValue]
    unknown_traits: dict[str, JsonValue] = Field(
        default_factory=dict,
        alias="unknownTraits",
    )


STRATEGY_CONFIG_MODELS: dict[str, type[ContractModel]] = {
    "basePelt": EmptyConfig,
    "coatPattern": EmptyConfig,
    "tintMultiply": EmptyConfig,
    "spriteLayer": SpriteLayerConfig,
    "eyes": EmptyConfig,
    "scarPrimary": EmptyConfig,
    "booleanSpriteLayer": BooleanSpriteLayerConfig,
    "solidMultiply": SolidMultiplyConfig,
    "lineart": EmptyConfig,
    "scarSecondary": EmptyConfig,
    "catalogSpriteList": CatalogSpriteListConfig,
    "globalMirror": GlobalMirrorConfig,
}


__all__ = [
    "STRATEGY_CONFIG_MODELS",
    "BlendMode",
    "BooleanSpriteLayerConfig",
    "CatDocument",
    "CatalogSpriteListConfig",
    "ContractModel",
    "EmptyConfig",
    "GlobalMirrorConfig",
    "HashValue",
    "OperationBase",
    "RenderCatalogEntry",
    "RenderOperation",
    "RenderPlan",
    "SolidMultiplyConfig",
    "SpriteLayerConfig",
]
