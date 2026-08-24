#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from collections import OrderedDict
from pathlib import Path
from typing import Any, Iterable

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / ".ref" / "clangen" / "sprites"

FRONTEND_SPRITES = ROOT / "frontend" / "public" / "sprites"
BACKEND_SPRITES = ROOT / "backend" / "renderer_service" / "sprites"
FRONTEND_DATA = ROOT / "frontend" / "public" / "sprite-data"
BACKEND_DATA = ROOT / "backend" / "renderer_service" / "renderer_service" / "data"

TILE_SIZE = 50
LEGACY_SPRITE_COUNT = 21
LEGACY_SHEET_LAYOUT = [3, 7]
LEGACY_POSE_FALLBACK = OrderedDict(
    [
        ("0", "kitten0"),
        ("1", "kitten1"),
        ("2", "kitten2"),
        ("3", "adolescent_short0"),
        ("4", "adolescent_short1"),
        ("5", "adolescent_short2"),
        ("6", "adult_short0"),
        ("7", "adult_short1"),
        ("8", "adult_short2"),
        ("9", "adult_long0"),
        ("10", "adult_long1"),
        ("11", "adult_long2"),
        ("12", "senior0"),
        ("13", "senior1"),
        ("14", "senior2"),
        ("15", "para_adult_short0"),
        ("16", "para_adult_long0"),
        ("17", "para_young0"),
        ("18", "sick_adult0"),
        ("19", "sick_young0"),
        ("20", "newborn2"),
    ]
)

OLD_TO_NEW_SHEETS = {
    "lineart": "lineart",
    "lineartdead": "lineart_sc",
    "lineartdf": "lineart_df",
    "shadersnewwhite": "shader_mask",
    "lightingnew": "shader_lighting",
    "singlecolours": "colours_single",
    "tabbycolours": "colours_tabby",
    "marbledcolours": "colours_marbled",
    "rosettecolours": "colours_rosette",
    "smokecolours": "colours_smoke",
    "tickedcolours": "colours_ticked",
    "speckledcolours": "colours_speckled",
    "bengalcolours": "colours_bengal",
    "mackerelcolours": "colours_mackerel",
    "classiccolours": "colours_classic",
    "sokokecolours": "colours_sokoke",
    "agouticolours": "colours_agouti",
    "singlestripecolours": "colours_singlestripe",
    "maskedcolours": "colours_masked",
    "whitepatches": None,
    "tortiepatchesmasks": "patches_tortie",
    "medcatherbs": "acc_plants",
    "wild": "acc_wilds",
    "collars": "acc_collars",
    "bowcollars": "acc_collars",
    "bellcollars": "acc_collars",
    "nyloncollars": "acc_collars",
    "scars_missing_part": "scars_missing_part",
    "missingscars": "scars_missing_part",
}

LEGACY_COLLAR_COLOURS = OrderedDict(
    [
        ("CRIMSON", "crimson"),
        ("BLUE", "blue"),
        ("YELLOW", "yellow"),
        ("CYAN", "cyan"),
        ("RED", "orange"),
        ("LIME", "lime"),
        ("GREEN", "green"),
        ("RAINBOW", "rainbow"),
        ("BLACK", "black"),
        ("SPIKES", "black_gold"),
        ("WHITE", "white"),
        ("PINK", "pink"),
        ("PURPLE", "purple"),
        ("MULTI", "rainbow"),
        ("INDIGO", "indigo"),
    ]
)


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value:
            continue
        key = str(value)
        if key in seen:
            continue
        seen.add(key)
        result.append(key)
    return result


def flatten_sprite_list(sprite_list: list[Any]) -> list[tuple[int, int, str]]:
    entries: list[tuple[int, int, str]] = []
    for row_index, row in enumerate(sprite_list):
        if isinstance(row, dict):
            names = list(row.keys())
        else:
            names = list(row)
        for col_index, name in enumerate(names):
            entries.append((col_index, row_index, str(name)))
    return entries


def flatten_dict_names(sprite_list: list[Any]) -> list[str]:
    names: list[str] = []
    for row in sprite_list:
        if isinstance(row, dict):
            names.extend(str(name) for name in row.keys())
        else:
            names.extend(str(name) for name in row)
    return names


def group_offsets(col: int, row: int, layout: list[int]) -> dict[str, int]:
    return {
        "xOffset": col * layout[0] * TILE_SIZE,
        "yOffset": row * layout[1] * TILE_SIZE,
    }


def pose_offsets(
    layout: list[int], poses: list[str]
) -> OrderedDict[str, dict[str, int]]:
    result: OrderedDict[str, dict[str, int]] = OrderedDict()
    columns = layout[0]
    for index, pose in enumerate(poses):
        result[pose] = {"x": index % columns, "y": index // columns}
    return result


def legacy_sprite_offset(sprite_number: int) -> dict[str, int]:
    return {
        "x": sprite_number % LEGACY_SHEET_LAYOUT[0],
        "y": sprite_number // LEGACY_SHEET_LAYOUT[0],
    }


def crop_pose(sheet: Image.Image, offset: dict[str, int]) -> bytes:
    box = (
        offset["x"] * TILE_SIZE,
        offset["y"] * TILE_SIZE,
        (offset["x"] + 1) * TILE_SIZE,
        (offset["y"] + 1) * TILE_SIZE,
    )
    return sheet.crop(box).convert("RGBA").tobytes()


def build_legacy_pose_map(
    upstream_pose_data: dict[str, Any], old_lineart_path: Path
) -> OrderedDict[str, str]:
    poses = list(upstream_pose_data["poses"])
    layout = list(upstream_pose_data["sheet_layout"])
    upstream_offsets = pose_offsets(layout, poses)
    fallback = OrderedDict(
        (number, pose)
        for number, pose in LEGACY_POSE_FALLBACK.items()
        if pose in upstream_offsets
    )

    if not old_lineart_path.exists():
        return fallback

    try:
        old_sheet = Image.open(old_lineart_path).convert("RGBA")
        new_sheet = Image.open(UPSTREAM / "lineart.png").convert("RGBA")
    except OSError:
        return fallback

    if old_sheet.size == new_sheet.size:
        return fallback

    old_columns = 3
    old_rows = max(1, old_sheet.height // TILE_SIZE)
    old_offsets = [
        {"x": index % old_columns, "y": index // old_columns}
        for index in range(min(LEGACY_SPRITE_COUNT, old_columns * old_rows))
    ]

    new_crops = {
        pose: crop_pose(new_sheet, offset) for pose, offset in upstream_offsets.items()
    }

    result: OrderedDict[str, str] = OrderedDict()
    used: set[str] = set()
    for index, offset in enumerate(old_offsets):
        old_crop = crop_pose(old_sheet, offset)
        match = next(
            (
                pose
                for pose, crop in new_crops.items()
                if crop == old_crop and pose not in used
            ),
            None,
        )
        if match is None:

            def score(candidate: tuple[str, bytes]) -> int:
                _pose, crop = candidate
                return sum(abs(a - b) for a, b in zip(old_crop, crop))

            candidates = [item for item in new_crops.items() if item[0] not in used]
            if candidates:
                match = min(candidates, key=score)[0]
        if match is not None:
            result[str(index)] = match
            used.add(match)

    for index, pose in fallback.items():
        result.setdefault(index, pose)
    return result


def add_group(
    index: OrderedDict[str, dict[str, Any]],
    key: str,
    spritesheet: str,
    col: int = 0,
    row: int = 0,
    layout: list[int] | None = None,
    **extra: Any,
) -> None:
    layout = layout or [3, 9]
    entry: dict[str, Any] = {
        "spritesheet": spritesheet,
        **group_offsets(col, row, layout),
    }
    entry.update({k: v for k, v in extra.items() if v is not None})
    index[key] = entry


def copy_upstream_assets() -> None:
    for target in (FRONTEND_SPRITES, BACKEND_SPRITES):
        target.mkdir(parents=True, exist_ok=True)
        for src in sorted(UPSTREAM.glob("*.png")):
            shutil.copy2(src, target / src.name)
        for dirname in ("faded", "palettes", "dicts"):
            src_dir = UPSTREAM / dirname
            dst_dir = target / dirname
            dst_dir.mkdir(parents=True, exist_ok=True)
            for src in sorted(src_dir.glob("*")):
                if src.is_file():
                    shutil.copy2(src, dst_dir / src.name)

    frontend_dicts = FRONTEND_DATA / "dicts"
    frontend_dicts.mkdir(parents=True, exist_ok=True)
    for src in sorted((UPSTREAM / "dicts").glob("*.json")):
        shutil.copy2(src, frontend_dicts / src.name)


def build_collar_entries(
    index: OrderedDict[str, dict[str, Any]],
    collar_data: dict[str, Any],
    layout: list[int],
) -> tuple[list[str], dict[str, str]]:
    collars: list[str] = []
    alias_to_key: dict[str, str] = {}
    spritesheet = collar_data["spritesheet"]

    for row_index, style_group in enumerate(collar_data["style_data"]):
        for col_index, (style, colours) in enumerate(style_group.items()):
            base_key = f"{spritesheet}{style}"
            add_group(index, base_key, spritesheet, col_index, row_index, layout)
            palette_sheet = f"palettes/{spritesheet}{style}_palette"
            for colour in colours:
                key = f"{base_key}_{colour}"
                add_group(
                    index,
                    key,
                    spritesheet,
                    col_index,
                    row_index,
                    layout,
                    paletteSheet=palette_sheet,
                    paletteName=colour,
                    paletteNames=["BASE", *colours],
                )
                public_name = f"{style}_{colour}"
                collars.append(public_name)
                alias_to_key[public_name.upper()] = key
                alias_to_key[key.upper()] = key

    def alias(alias: str, style: str, colour: str) -> None:
        target = f"{spritesheet}{style}_{colour}"
        if target not in index:
            return
        index[f"collars{alias}"] = dict(index[target])
        collars.append(alias)
        alias_to_key[alias.upper()] = target
        alias_to_key[f"COLLARS{alias}".upper()] = target

    for old, new_colour in LEGACY_COLLAR_COLOURS.items():
        style = "LEATHER_GRADIENT" if new_colour == "rainbow" else "LEATHER"
        if old == "SPIKES":
            style = "LEATHER_SPIKE"
        alias(old, style, new_colour)

        bell_style = (
            "LEATHER_BELL_GRADIENT" if new_colour == "rainbow" else "LEATHER_BELL"
        )
        if old == "SPIKES":
            bell_style = "LEATHER_BELL_SPIKE"
        alias(f"{old}BELL", bell_style, new_colour)

        bow_style = "BOW_GRADIENT" if new_colour == "rainbow" else "BOW"
        if old == "SPIKES":
            bow_style = "BOW_FOIL"
        alias(f"{old}BOW", bow_style, new_colour)

        nylon_style = "NYLON_GRADIENT" if new_colour == "rainbow" else "NYLON"
        if old == "SPIKES":
            nylon_style = "NYLON"
        alias(f"{old}NYLON", nylon_style, new_colour)

    return dedupe(collars), alias_to_key


def build_sprite_index(
    old_index: dict[str, Any],
) -> tuple[OrderedDict[str, dict[str, Any]], dict[str, str]]:
    dicts = UPSTREAM / "dicts"
    pose_data = read_json(dicts / "pose_sprite_data.json")
    layout = list(pose_data["sheet_layout"])
    upstream_sheets = {path.stem for path in UPSTREAM.glob("*.png")}
    index: OrderedDict[str, dict[str, Any]] = OrderedDict()

    pose_aliases = {
        "lineart": "lines",
        "lineart_df": "lineartdf",
        "lineart_sc": "lineartdead",
        "lineart_ur": "lineartur",
        "shader_lighting": "lighting",
        "shader_mask": "shaders",
    }
    for sheet in pose_data["spritesheet"]:
        add_group(index, sheet, sheet, 0, 0, layout)
        alias = pose_aliases.get(sheet)
        if alias:
            add_group(index, alias, sheet, 0, 0, layout)

    add_group(index, "heterochromiamask", "heterochromiamask", 0, 0, layout)

    for fade_sheet, prefix in (
        ("fademask", "fademask"),
        ("fadestarclan", "fadestarclan"),
        ("fadedarkforest", "fadedf"),
        ("fadeunknownresidence", "fadeur"),
    ):
        for col in range(3):
            add_group(index, f"{prefix}{col}", fade_sheet, col, 0, layout)

    pelt_data = read_json(dicts / "pelt_sprite_data.json")
    pelt_prefix = {
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
    colour_positions = flatten_sprite_list(pelt_data["sprite_list"])
    for sheet, pelt_names in pelt_data["spritesheet"].items():
        for pelt_name in pelt_names:
            prefix = pelt_prefix[pelt_name]
            for col, row, colour in colour_positions:
                add_group(index, f"{prefix}{colour}", sheet, col, row, layout)

    eye_data = read_json(dicts / "eye_sprite_data.json")
    for col, row, colour in flatten_sprite_list(eye_data["sprite_list"]):
        add_group(index, f"eyes{colour}", "eyes", col, row, layout)
        add_group(index, f"eyes2{colour}", "eyes", col, row, layout)

    skin_data = read_json(dicts / "skin_sprite_data.json")
    for col, row, skin in flatten_sprite_list(skin_data["sprite_list"]):
        add_group(index, f"skin{skin}", skin_data["spritesheet"], col, row, layout)

    scar_data = read_json(dicts / "scar_sprite_data.json")
    for col, row, scar in flatten_sprite_list(scar_data["sprite_list"]):
        add_group(index, f"scars{scar}", scar_data["spritesheet"], col, row, layout)

    missing_data = read_json(dicts / "scar_missing_sprite_data.json")
    for col, row, scar in flatten_sprite_list(missing_data["sprite_list"]):
        add_group(index, f"scars{scar}", missing_data["spritesheet"], col, row, layout)

    tortie_data = read_json(dicts / "tortie_patches_sprite_data.json")
    for col, row, mask in flatten_sprite_list(tortie_data["sprite_list"]):
        add_group(
            index, f"tortiemask{mask}", tortie_data["spritesheet"], col, row, layout
        )

    for file_name in (
        "white_patches_mostly_sprite_data.json",
        "white_patches_high_sprite_data.json",
        "white_patches_mid_sprite_data.json",
        "white_patches_little_sprite_data.json",
        "white_patches_points_sprite_data.json",
        "white_patches_vitiligo_sprite_data.json",
    ):
        data = read_json(dicts / file_name)
        for col, row, patch in flatten_sprite_list(data["sprite_list"]):
            add_group(index, f"white{patch}", data["spritesheet"], col, row, layout)

    plant_data = read_json(dicts / "plant_sprite_data.json")
    for col, row, accessory in flatten_sprite_list(plant_data["sprite_list"]):
        add_group(
            index, f"acc_plants{accessory}", plant_data["spritesheet"], col, row, layout
        )
        add_group(
            index, f"acc_herbs{accessory}", plant_data["spritesheet"], col, row, layout
        )

    wild_data = read_json(dicts / "wild_sprite_data.json")
    for col, row, accessory in flatten_sprite_list(wild_data["sprite_list"]):
        add_group(
            index, f"acc_wilds{accessory}", wild_data["spritesheet"], col, row, layout
        )
        add_group(
            index, f"acc_wild{accessory}", wild_data["spritesheet"], col, row, layout
        )

    collar_data = read_json(dicts / "collar_sprite_data.json")
    _collars, alias_to_key = build_collar_entries(index, collar_data, layout)

    generated_keys = set(index)
    for key, value in old_index.items():
        if key in generated_keys:
            continue
        sheet = value.get("spritesheet")
        replacement = OLD_TO_NEW_SHEETS.get(sheet, "__keep__")
        if replacement is None:
            continue
        kept = dict(value)
        if replacement != "__keep__":
            kept["spritesheet"] = replacement
        sheet = kept.get("spritesheet")
        if sheet and sheet not in upstream_sheets and "poseLayout" not in kept:
            kept["poseLayout"] = "legacy"
        index[key] = kept

    return index, alias_to_key


def build_pelt_info(
    old_pelt_info: dict[str, Any], collar_aliases: dict[str, str]
) -> dict[str, Any]:
    dicts = UPSTREAM / "dicts"
    pelt_data = read_json(dicts / "pelt_sprite_data.json")
    eye_data = read_json(dicts / "eye_sprite_data.json")
    skin_data = read_json(dicts / "skin_sprite_data.json")
    scar_data = read_json(dicts / "scar_sprite_data.json")
    missing_data = read_json(dicts / "scar_missing_sprite_data.json")
    plant_data = read_json(dicts / "plant_sprite_data.json")
    wild_data = read_json(dicts / "wild_sprite_data.json")
    tortie_data = read_json(dicts / "tortie_patches_sprite_data.json")
    collar_data = read_json(dicts / "collar_sprite_data.json")

    white_categories: dict[str, list[str]] = {}
    for category, file_name in (
        ("mostly_white", "white_patches_mostly_sprite_data.json"),
        ("high_white", "white_patches_high_sprite_data.json"),
        ("mid_white", "white_patches_mid_sprite_data.json"),
        ("little_white", "white_patches_little_sprite_data.json"),
        ("point_markings", "white_patches_points_sprite_data.json"),
        ("vitiligo", "white_patches_vitiligo_sprite_data.json"),
    ):
        white_categories[category] = flatten_dict_names(
            read_json(dicts / file_name)["sprite_list"]
        )

    plant_names = flatten_dict_names(plant_data["sprite_list"])
    wild_names = flatten_dict_names(wild_data["sprite_list"])
    tail_accessories: list[str] = []
    for row in [*plant_data["sprite_list"], *wild_data["sprite_list"]]:
        if not isinstance(row, dict):
            continue
        tail_accessories.extend(
            name for name, placement in row.items() if placement == "tail"
        )

    collars: list[str] = []
    for style_group in collar_data["style_data"]:
        for style, colours in style_group.items():
            collars.extend(f"{style}_{colour}" for colour in colours)
    collars.extend(old_pelt_info.get("collars", []))

    colours = flatten_dict_names(pelt_data["sprite_list"])
    eyes = flatten_dict_names(eye_data["sprite_list"])
    skin = flatten_dict_names(skin_data["sprite_list"])
    scars1 = flatten_dict_names(scar_data["sprite_list"])
    scars2 = flatten_dict_names(missing_data["sprite_list"])
    old_scars3 = old_pelt_info.get("scars3", [])
    scars3 = [name for name in old_scars3 if name in scars1]

    info: dict[str, Any] = {
        "patterns": dedupe(
            name for names in pelt_data["spritesheet"].values() for name in names
        ),
        "colors": dedupe(colours),
        "eyes": dedupe(eyes),
        "skin": dedupe(skin),
        "white": dedupe(
            [
                *white_categories["mostly_white"],
                *white_categories["high_white"],
                *white_categories["mid_white"],
                *white_categories["little_white"],
            ]
        ),
        **white_categories,
        "scars1": dedupe(
            [name for name in old_pelt_info.get("scars1", []) if name in scars1]
            or scars1
        ),
        "scars2": dedupe(scars2),
        "scars3": dedupe(
            scars3
            or [name for name in scars1 if name not in old_pelt_info.get("scars1", [])]
        ),
        "tortie_masks": dedupe(flatten_dict_names(tortie_data["sprite_list"])),
        "plant_accessories": dedupe(plant_names),
        "wild_accessories": dedupe(wild_names),
        "tail_accessories": dedupe(tail_accessories),
        "collars": dedupe(collars),
        "collar_sprite_aliases": collar_aliases,
        "accessory_sprite_aliases": old_pelt_info.get("accessory_sprite_aliases", {}),
        "extra_accessories": dedupe(old_pelt_info.get("extra_accessories", [])),
    }
    info["accessories"] = dedupe(
        [
            *info["plant_accessories"],
            *info["wild_accessories"],
            *info["tail_accessories"],
            *info["collars"],
            *info["extra_accessories"],
        ]
    )
    return info


def write_pose_data() -> None:
    pose_data = read_json(UPSTREAM / "dicts" / "pose_sprite_data.json")
    offsets = pose_offsets(list(pose_data["sheet_layout"]), list(pose_data["poses"]))
    legacy_map = build_legacy_pose_map(pose_data, FRONTEND_SPRITES / "lineart.png")
    legacy_numbers = OrderedDict(
        (pose, int(number)) for number, pose in legacy_map.items()
    )
    legacy_offsets = OrderedDict(
        (pose, legacy_sprite_offset(number)) for pose, number in legacy_numbers.items()
    )
    renderable = [
        pose
        for pose in pose_data["poses"]
        if not pose.startswith("newborn") and not pose.startswith("kitten")
    ]
    frontend_data = OrderedDict(
        [
            ("spritesheets", pose_data["spritesheet"]),
            ("sheetLayout", pose_data["sheet_layout"]),
            ("tileSize", TILE_SIZE),
            ("poses", pose_data["poses"]),
            ("poseNameToOffset", offsets),
            ("renderablePoseNames", renderable),
        ]
    )
    backend_data = OrderedDict(
        [
            *frontend_data.items(),
            ("legacySpriteNumberToPoseName", legacy_map),
            ("legacyPoseNameToSpriteNumber", legacy_numbers),
            ("legacyPoseNameToOffset", legacy_offsets),
        ]
    )
    write_json(FRONTEND_DATA / "poseData.json", frontend_data)
    write_json(BACKEND_DATA / "poseData.json", backend_data)

    offset_array = [offsets[pose] for pose in pose_data["poses"]]
    for target in (
        FRONTEND_DATA / "spritesOffsetMap.json",
        BACKEND_DATA / "spritesOffsetMap.json",
    ):
        write_json(target, offset_array)


def main() -> None:
    if not UPSTREAM.exists():
        raise SystemExit(f"Missing ClanGen reference checkout: {UPSTREAM}")

    old_index = read_json(FRONTEND_DATA / "spritesIndex.json")
    old_pelt_info = read_json(FRONTEND_DATA / "peltInfo.json")

    write_pose_data()
    copy_upstream_assets()

    sprite_index, collar_aliases = build_sprite_index(old_index)
    pelt_info = build_pelt_info(old_pelt_info, collar_aliases)

    for target in (
        FRONTEND_DATA / "spritesIndex.json",
        BACKEND_DATA / "spritesIndex.json",
    ):
        write_json(target, sprite_index)

    for target in (FRONTEND_DATA / "peltInfo.json", BACKEND_DATA / "peltInfo.json"):
        write_json(target, pelt_info)

    for src_name, dst_names in (
        ("tint.json", ["tint.json", "tints/tint.json"]),
        (
            "white_patches_tint.json",
            ["white_patches_tint.json", "tints/white_patches_tint.json"],
        ),
    ):
        data = read_json(UPSTREAM / "dicts" / src_name)
        write_json(BACKEND_DATA / dst_names[0], data)
        for dst_name in dst_names:
            write_json(FRONTEND_DATA / dst_name, data)

    print(
        f"Imported {len(sprite_index)} sprite groups, "
        f"{len(pelt_info['accessories'])} accessories, "
        f"{len(read_json(FRONTEND_DATA / 'poseData.json')['poses'])} poses."
    )


if __name__ == "__main__":
    main()
