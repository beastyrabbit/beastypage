from __future__ import annotations

from collections.abc import Iterable

from PIL import Image, ImageOps
from pydantic import JsonValue

from .contracts import (
    BooleanSpriteLayerConfig,
    CatalogSpriteListConfig,
    ContractModel,
    EmptyConfig,
    GlobalMirrorConfig,
    OperationBase,
    SolidMultiplyConfig,
    SpriteLayerConfig,
)
from .image_ops import alpha_over, fill_with_colour, tint_image
from .strategy_registry import StrategyContext, StrategyRegistry, StrategyResult
from .v3_renderer import CatRendererV3, _is_empty_value


def _renderer(value: object) -> CatRendererV3:
    if isinstance(value, StrategyContext):
        value = value.renderer
    if not isinstance(value, CatRendererV3):
        raise TypeError("Render strategy received an invalid renderer")
    return value


def _stage_result(result: tuple) -> StrategyResult:
    image, diagnostics, blend_mode, _legacy_identifier = result
    return StrategyResult(
        image=image,
        diagnostics=diagnostics,
        blend_mode=blend_mode,
    )


def _base_pelt(
    renderer: object,
    operation: OperationBase,
    config: ContractModel,
    params: dict[str, JsonValue],
    canvas: Image.Image,
) -> StrategyResult:
    return _stage_result(_renderer(renderer)._stage_base(params, canvas))


def _coat_pattern(
    renderer: object,
    operation: OperationBase,
    config: ContractModel,
    params: dict[str, JsonValue],
    canvas: Image.Image,
) -> StrategyResult:
    return _stage_result(_renderer(renderer)._stage_coat_pattern(params, canvas))


def _tint_multiply(
    renderer: object,
    operation: OperationBase,
    config: ContractModel,
    params: dict[str, JsonValue],
    canvas: Image.Image,
) -> StrategyResult:
    return _stage_result(_renderer(renderer)._stage_tint(params, canvas))


def _values(value: JsonValue | None) -> Iterable[str]:
    entries = value if isinstance(value, list) else [value]
    for entry in entries:
        if isinstance(entry, str) and not _is_empty_value(entry):
            yield entry


def _sprite_layer(
    renderer: object,
    operation: OperationBase,
    raw_config: ContractModel,
    params: dict[str, JsonValue],
    canvas: Image.Image,
) -> StrategyResult:
    cat_renderer = _renderer(renderer)
    config = SpriteLayerConfig.model_validate(raw_config.model_dump(by_alias=True))
    overlay = cat_renderer.repo.blank_canvas()
    diagnostics: list[str] = []

    for value in _values(params.get(config.value_trait)):
        sprite_name = config.sprite_by_value.get(value)
        if not sprite_name:
            if config.sprite_family in {"eyes", "skin"}:
                sprite_name = cat_renderer.mapper.build_sprite_name(
                    config.sprite_family,
                    None,
                    value,
                )
            else:
                sprite_name = cat_renderer.mapper.build_sprite_name(
                    config.sprite_family,
                    value,
                    None,
                )
        if not sprite_name or not cat_renderer.repo.has_sprite(sprite_name):
            diagnostics.append(f"missing:{value}")
            continue
        sprite = cat_renderer._get_sprite(sprite_name, params)
        if config.tint_trait and config.tint_resolver == "whitePatch":
            tint = cat_renderer.mapper.get_white_patch_tint(
                params.get(config.tint_trait)
                if isinstance(params.get(config.tint_trait), str)
                else None
            )
            if tint:
                sprite = tint_image(
                    sprite,
                    [int(component) for component in tint[:3]],
                    mode="multiply",
                )
        overlay = alpha_over(overlay, sprite)
        diagnostics.append(f"{config.diagnostic_prefix}:{value}")

    if overlay.getbbox() is None:
        return StrategyResult(diagnostics=diagnostics)
    return StrategyResult(image=overlay, diagnostics=diagnostics, blend_mode="alpha")


def _eyes(
    renderer: object,
    operation: OperationBase,
    config: ContractModel,
    params: dict[str, JsonValue],
    canvas: Image.Image,
) -> StrategyResult:
    return _stage_result(_renderer(renderer)._stage_eyes(params, canvas))


def _scar_primary(
    renderer: object,
    operation: OperationBase,
    config: ContractModel,
    params: dict[str, JsonValue],
    canvas: Image.Image,
) -> StrategyResult:
    return _stage_result(_renderer(renderer)._stage_scar_primary(params, canvas))


def _boolean_sprite_layer(
    renderer: object,
    operation: OperationBase,
    raw_config: ContractModel,
    params: dict[str, JsonValue],
    canvas: Image.Image,
) -> StrategyResult:
    cat_renderer = _renderer(renderer)
    config = BooleanSpriteLayerConfig.model_validate(
        raw_config.model_dump(by_alias=True)
    )
    if not cat_renderer._truthy(params.get(config.value_trait)):
        return StrategyResult()
    for sprite_key in config.sprite_keys:
        if cat_renderer.repo.has_sprite(
            sprite_key,
            cat_renderer._sprite_number(params),
        ):
            return StrategyResult(
                image=cat_renderer._get_sprite(sprite_key, params),
                diagnostics=[config.diagnostic],
                blend_mode=config.blend,
            )
    return StrategyResult(diagnostics=[f"missing:{config.sprite_keys[0]}"])


def _solid_multiply(
    renderer: object,
    operation: OperationBase,
    raw_config: ContractModel,
    params: dict[str, JsonValue],
    canvas: Image.Image,
) -> StrategyResult:
    cat_renderer = _renderer(renderer)
    config = SolidMultiplyConfig.model_validate(raw_config.model_dump(by_alias=True))
    if not cat_renderer._truthy(params.get(config.value_trait)):
        return StrategyResult()
    colour = tuple(config.colour)
    overlay = fill_with_colour(canvas.size, colour, canvas)
    return StrategyResult(
        image=overlay,
        diagnostics=[config.diagnostic],
        blend_mode="multiply",
    )


def _lineart(
    renderer: object,
    operation: OperationBase,
    config: ContractModel,
    params: dict[str, JsonValue],
    canvas: Image.Image,
) -> StrategyResult:
    return _stage_result(_renderer(renderer)._stage_lineart(params, canvas))


def _scar_secondary(
    renderer: object,
    operation: OperationBase,
    config: ContractModel,
    params: dict[str, JsonValue],
    canvas: Image.Image,
) -> StrategyResult:
    return _stage_result(_renderer(renderer)._stage_scar_secondary(params, canvas))


def _catalog_sprite_list(
    context: StrategyContext,
    operation: OperationBase,
    raw_config: ContractModel,
    params: dict[str, JsonValue],
    canvas: Image.Image,
) -> StrategyResult:
    cat_renderer = _renderer(context)
    config = CatalogSpriteListConfig.model_validate(
        raw_config.model_dump(by_alias=True)
    )
    overlay = cat_renderer.repo.blank_canvas()
    diagnostics: list[str] = []
    pose_name = cat_renderer._pose_name(params)
    catalog = context.catalogs.get(config.catalog, {})
    for value in _values(params.get(config.value_trait)):
        catalog_entry = catalog.get(value, {})
        catalog_poses = catalog_entry.get("poses")
        allowed_poses = config.available_poses.get(value)
        if not allowed_poses and isinstance(catalog_poses, list):
            allowed_poses = [str(item) for item in catalog_poses]
        if allowed_poses and pose_name and pose_name not in allowed_poses:
            diagnostics.append(f"unavailable:{value}:{pose_name}")
            continue
        if config.resolver == "accessory":
            raw_sprite_key = catalog_entry.get("spriteKey")
            sprite_name = (
                str(raw_sprite_key)
                if isinstance(raw_sprite_key, str)
                else cat_renderer._resolve_accessory(value)
            )
        elif config.resolver == "mapping":
            sprite_name = config.sprites.get(value)
            if not sprite_name and isinstance(catalog_entry.get("spriteKey"), str):
                sprite_name = str(catalog_entry["spriteKey"])
        else:
            sprite_name = value
        if not sprite_name or not cat_renderer.repo.has_sprite(sprite_name):
            diagnostics.append(f"missing:{value}")
            continue
        overlay = alpha_over(overlay, cat_renderer._get_sprite(sprite_name, params))
        diagnostics.append(sprite_name)
    if overlay.getbbox() is None:
        return StrategyResult(diagnostics=diagnostics)
    return StrategyResult(
        image=overlay,
        diagnostics=diagnostics,
        blend_mode=config.blend,
    )


def _global_mirror(
    renderer: object,
    operation: OperationBase,
    raw_config: ContractModel,
    params: dict[str, JsonValue],
    canvas: Image.Image,
) -> StrategyResult:
    config = GlobalMirrorConfig.model_validate(raw_config.model_dump(by_alias=True))
    cat_renderer = _renderer(renderer)
    if not cat_renderer._truthy(params.get(config.value_trait)):
        return StrategyResult()
    return StrategyResult(
        image=ImageOps.mirror(canvas),
        diagnostics=["mirror"],
        blend_mode="replace",
        transform_previous_layers=config.affects_previous_layers,
    )


def build_strategy_registry() -> StrategyRegistry:
    registry = StrategyRegistry()
    registry.register("basePelt", 1, EmptyConfig, _base_pelt)
    registry.register("coatPattern", 1, EmptyConfig, _coat_pattern)
    registry.register("tintMultiply", 1, EmptyConfig, _tint_multiply)
    registry.register("spriteLayer", 1, SpriteLayerConfig, _sprite_layer)
    registry.register("eyes", 1, EmptyConfig, _eyes)
    registry.register("scarPrimary", 1, EmptyConfig, _scar_primary)
    registry.register(
        "booleanSpriteLayer",
        1,
        BooleanSpriteLayerConfig,
        _boolean_sprite_layer,
    )
    registry.register("solidMultiply", 1, SolidMultiplyConfig, _solid_multiply)
    registry.register("lineart", 1, EmptyConfig, _lineart)
    registry.register("scarSecondary", 1, EmptyConfig, _scar_secondary)
    registry.register(
        "catalogSpriteList",
        1,
        CatalogSpriteListConfig,
        _catalog_sprite_list,
    )
    registry.register("globalMirror", 1, GlobalMirrorConfig, _global_mirror)
    return registry.freeze()


STRATEGY_REGISTRY = build_strategy_registry()


__all__ = ["STRATEGY_REGISTRY", "build_strategy_registry"]
