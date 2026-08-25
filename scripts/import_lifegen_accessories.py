#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import shutil
import tarfile
import tempfile
import urllib.request
from collections import OrderedDict
from pathlib import Path
from typing import Any

import numpy as np
from import_clangen_sprites import (
    BACKEND_DATA,
    BACKEND_SPRITES,
    FRONTEND_DATA,
    FRONTEND_SPRITES,
    TILE_SIZE,
    add_group,
    flatten_sprite_list,
    read_json,
    write_json,
)
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LIFEGEN_UPSTREAM = ROOT / ".ref" / "lifegen" / "sprites"
SOURCE_MANIFEST = ROOT / "scripts" / "lifegen-accessories-source.json"
ADAPTED_SHEET = "acc_lifegen_adapted"

ACCESSORY_DICTS = (
    "alive_insect_data.json",
    "dead_insect_data.json",
    "flowercrowns_data.json",
    "fruit_data.json",
    "harness_data.json",
    "misc_accs_data.json",
    "misc2_accs_data.json",
    "plant2_sprite_data.json",
    "smallanimals_data.json",
    "sophisticated_data.json",
    "wild2_sprite_data.json",
)

RAINCOATS = (
    "PURPLERAINCOAT",
    "BLUERAINCOAT",
    "GREENRAINCOAT",
    "PINKRAINCOAT",
    "REDRAINCOAT",
    "LIMERAINCOAT",
    "ORANGERAINCOAT",
    "YELLOWRAINCOAT",
)

# These public names survived in BeastyPage after LifeGen renamed the source
# entry. Both replacements preserve the old pixels in the legacy poses.
RENAMED_ACCESSORIES = {
    "HOLLY2": "HOLLYLEAVES",
    "SPRINGFEATHERS": "SPINGFEATHERS",
}

# This ClanGen accessory already uses the expanded named-pose sheet. Keep the
# layout explicit so a later ClanGen import cannot mistake it for a legacy
# BeastyPage-only sheet.
NAMED_EXISTING_ACCESSORIES = {
    "WISTERIA": "acc_plantsWISTERIA",
}

# LifeGen removed these public entries before adding the new ClanGen poses.
# Their old pixels remain the source of truth. A current LifeGen accessory with
# the same placement supplies the pose-to-pose translation for missing frames.
ADAPTED_ACCESSORIES: OrderedDict[str, tuple[str, str]] = OrderedDict(
    [
        ("ACORN2", ("acc_herbsACORN2", "ACORN")),
        (
            "BLEEDING HEARTS2",
            ("acc_herbsBLEEDING HEARTS2", "BLEEDING HEART BRANCH"),
        ),
        ("CHERRY2", ("acc_herbsCHERRY2", "CHERRY")),
        ("CLOVER2", ("acc_herbsCLOVER2", "SINGULARCLOVER")),
        ("CLOVERS", ("acc_herbsCLOVERS", "CLOVERFLOWER")),
        ("FERNS", ("acc_herbsFERNS", "FERN")),
        ("HESPERIS", ("acc_flowerHESPERIS", "DIANTHUS")),
        ("LADYBUG", ("acc_wildLADYBUG", "RED LADYBUG")),
        ("LARGE COMET", ("acc_wildLARGE COMET", "COMET MOTH")),
        ("LARGE LUNA", ("acc_wildLARGE LUNA", "LUNAR MOTH")),
        ("LILYPADCROWN", ("acc_wildLILYPADCROWN", "LILYPADHAT")),
        ("MARIGOLD", ("acc_flowerMARIGOLD", "ALLIUM")),
        ("MOSS2", ("acc_herbsMOSS2", "MOSS")),
        ("RASPBERRY2", ("acc_fruitRASPBERRY2", "GOLDEN RASPBERRY")),
        ("REDCROWN", ("acc_wildREDCROWN", "PINKFLOWERCROWN")),
        ("SMALL COMET", ("acc_wildSMALL COMET", "COMET MOTH")),
        ("SMALL LUNA", ("acc_wildSMALL LUNA", "LUNAR MOTH")),
        ("YELLOW PRIMROSE", ("acc_flowerYELLOW PRIMROSE", "DIANTHUS")),
        ("YELLOWCROWN", ("acc_wildYELLOWCROWN", "YELLOWFLOWERCROWN")),
        (
            "JAYFEATHER",
            ("acc_flowerJAYFEATHER", "DRACULAPARROTFEATHER"),
        ),
    ]
)


def remove_colorkey(image: Image.Image) -> Image.Image:
    pixels = np.array(image.convert("RGBA"), dtype=np.uint8, copy=True)
    blue = (
        (pixels[:, :, 0] == 0)
        & (pixels[:, :, 1] == 0)
        & (pixels[:, :, 2] == 255)
        & (pixels[:, :, 3] == 255)
    )
    pixels[blue] = 0
    return Image.fromarray(pixels, mode="RGBA")


def crop_group_pose(
    sheet: Image.Image,
    col: int,
    row: int,
    offset: dict[str, int],
    layout: list[int],
) -> Image.Image:
    group_x = col * layout[0] * TILE_SIZE
    group_y = row * layout[1] * TILE_SIZE
    x = group_x + offset["x"] * TILE_SIZE
    y = group_y + offset["y"] * TILE_SIZE
    return remove_colorkey(sheet.crop((x, y, x + TILE_SIZE, y + TILE_SIZE)))


def shift_tile(image: Image.Image, dx: int, dy: int) -> Image.Image:
    shifted = Image.new("RGBA", (TILE_SIZE, TILE_SIZE))
    shifted.alpha_composite(image, (dx, dy))
    return shifted


def alpha_mask(image: Image.Image) -> np.ndarray[Any, np.dtype[np.bool_]]:
    return np.array(image.convert("RGBA"), dtype=np.uint8)[:, :, 3] > 0


def shifted_mask(mask: np.ndarray[Any, np.dtype[np.bool_]], dx: int, dy: int):
    shifted = np.zeros_like(mask)
    source_x = max(0, -dx)
    source_y = max(0, -dy)
    target_x = max(0, dx)
    target_y = max(0, dy)
    width = min(TILE_SIZE - source_x, TILE_SIZE - target_x)
    height = min(TILE_SIZE - source_y, TILE_SIZE - target_y)
    if width > 0 and height > 0:
        shifted[
            target_y : target_y + height,
            target_x : target_x + width,
        ] = mask[
            source_y : source_y + height,
            source_x : source_x + width,
        ]
    return shifted


def best_reference_translation(
    reference_sheet: Image.Image,
    reference_col: int,
    reference_row: int,
    target_pose: str,
    legacy_pose_names: list[str],
    offsets: dict[str, dict[str, int]],
    layout: list[int],
) -> tuple[str, int, int] | None:
    target = crop_group_pose(
        reference_sheet,
        reference_col,
        reference_row,
        offsets[target_pose],
        layout,
    )
    target_mask = alpha_mask(target)
    if not target_mask.any():
        return None

    best_score = -1.0
    best: tuple[str, int, int] | None = None
    for source_pose in legacy_pose_names:
        source = crop_group_pose(
            reference_sheet,
            reference_col,
            reference_row,
            offsets[source_pose],
            layout,
        )
        source_mask = alpha_mask(source)
        if not source_mask.any():
            continue
        for dy in range(-12, 13):
            for dx in range(-12, 13):
                candidate = shifted_mask(source_mask, dx, dy)
                union = np.logical_or(candidate, target_mask).sum()
                if union == 0:
                    continue
                score = float(np.logical_and(candidate, target_mask).sum() / union)
                if score > best_score:
                    best_score = score
                    best = (source_pose, dx, dy)
    return best


def read_lifegen_groups() -> OrderedDict[str, dict[str, Any]]:
    groups: OrderedDict[str, dict[str, Any]] = OrderedDict()
    dicts = LIFEGEN_UPSTREAM / "dicts"
    for file_name in ACCESSORY_DICTS:
        data = read_json(dicts / file_name)
        for col, row, name in flatten_sprite_list(data["sprite_list"]):
            groups[name] = {
                "spritesheet": data["spritesheet"],
                "col": col,
                "row": row,
            }

    for index, name in enumerate(RAINCOATS):
        groups[name] = {
            "spritesheet": "acc_raincoats",
            "col": index % 7,
            "row": index // 7,
        }
    return groups


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_lifegen_source(manifest: dict[str, Any]) -> None:
    assets = list(manifest.get("assets", []))
    if assets and all(
        (LIFEGEN_UPSTREAM / str(asset["path"])).is_file() for asset in assets
    ):
        return

    artifact = manifest.get("source", {}).get("artifact", {})
    url = str(artifact.get("url", ""))
    expected_archive_hash = str(artifact.get("sha256", ""))
    archive_prefix = str(artifact.get("spritesPath", "")).rstrip("/")
    if not url or not expected_archive_hash or not archive_prefix:
        raise ValueError("LifeGen source manifest is missing pinned artifact metadata")

    with tempfile.TemporaryDirectory(prefix="beastypage-lifegen-") as temp_dir:
        archive = Path(temp_dir) / "lifegen.tar.xz"
        print(f"Downloading pinned LifeGen source from {url}")
        with urllib.request.urlopen(url) as response, archive.open("wb") as target:
            shutil.copyfileobj(response, target)

        actual_archive_hash = sha256_file(archive)
        if actual_archive_hash != expected_archive_hash:
            raise ValueError(
                "LifeGen archive checksum mismatch: "
                f"expected {expected_archive_hash}, got {actual_archive_hash}"
            )

        with tarfile.open(archive, mode="r:xz") as source_archive:
            for asset in assets:
                relative_path = str(asset["path"])
                member_name = f"{archive_prefix}/{relative_path}"
                extracted = source_archive.extractfile(member_name)
                if extracted is None:
                    raise FileNotFoundError(
                        f"Missing LifeGen archive asset: {member_name}"
                    )
                target = LIFEGEN_UPSTREAM / relative_path
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("wb") as output:
                    shutil.copyfileobj(extracted, output)


def validate_lifegen_source(manifest: dict[str, Any]) -> None:
    for asset in manifest.get("assets", []):
        relative_path = str(asset["path"])
        expected = str(asset["sha256"])
        source = LIFEGEN_UPSTREAM / relative_path
        if not source.is_file():
            raise FileNotFoundError(f"Missing LifeGen source asset: {relative_path}")
        actual = sha256_file(source)
        if actual != expected:
            raise ValueError(
                f"LifeGen source checksum mismatch for {relative_path}: "
                f"expected {expected}, got {actual}"
            )


def copy_lifegen_assets(groups: OrderedDict[str, dict[str, Any]]) -> None:
    sheets = {str(group["spritesheet"]) for group in groups.values()}
    for target in (FRONTEND_SPRITES, BACKEND_SPRITES):
        target.mkdir(parents=True, exist_ok=True)
        for sheet in sorted(sheets):
            shutil.copy2(LIFEGEN_UPSTREAM / f"{sheet}.png", target / f"{sheet}.png")
        target_dicts = target / "dicts"
        target_dicts.mkdir(parents=True, exist_ok=True)
        for file_name in ACCESSORY_DICTS:
            shutil.copy2(
                LIFEGEN_UPSTREAM / "dicts" / file_name,
                target_dicts / file_name,
            )

    frontend_dicts = FRONTEND_DATA / "dicts"
    frontend_dicts.mkdir(parents=True, exist_ok=True)
    for file_name in ACCESSORY_DICTS:
        shutil.copy2(
            LIFEGEN_UPSTREAM / "dicts" / file_name,
            frontend_dicts / file_name,
        )


def build_adapted_sheet(
    old_index: dict[str, Any],
    groups: OrderedDict[str, dict[str, Any]],
    pose_data: dict[str, Any],
) -> tuple[Image.Image, OrderedDict[str, dict[str, Any]]]:
    poses = [str(pose) for pose in pose_data["poses"]]
    layout = list(pose_data["sheetLayout"])
    offsets = dict(pose_data["poseNameToOffset"])
    legacy_number_to_pose = {
        str(number): str(pose)
        for number, pose in pose_data["legacySpriteNumberToPoseName"].items()
    }
    legacy_pose_to_number = {
        pose: int(number) for number, pose in legacy_number_to_pose.items()
    }
    legacy_pose_names = list(legacy_pose_to_number)
    columns = 10
    rows = (len(ADAPTED_ACCESSORIES) + columns - 1) // columns
    sheet = Image.new(
        "RGBA",
        (columns * layout[0] * TILE_SIZE, rows * layout[1] * TILE_SIZE),
    )
    sheet_cache: dict[tuple[Path, str], Image.Image] = {}

    def load_sheet(root: Path, name: str) -> Image.Image:
        key = (root, name)
        if key not in sheet_cache:
            sheet_cache[key] = Image.open(root / f"{name}.png").convert("RGBA")
        return sheet_cache[key]

    entries: OrderedDict[str, dict[str, Any]] = OrderedDict()
    for index, (name, (old_key, reference_name)) in enumerate(
        ADAPTED_ACCESSORIES.items()
    ):
        old_entry = old_index.get(old_key)
        if not old_entry:
            raise KeyError(f"Missing legacy accessory sprite: {old_key}")
        reference = groups.get(reference_name)
        if not reference:
            raise KeyError(f"Missing LifeGen reference accessory: {reference_name}")

        group_col = index % columns
        group_row = index // columns
        old_sheet = load_sheet(FRONTEND_SPRITES, str(old_entry["spritesheet"]))
        reference_sheet = load_sheet(LIFEGEN_UPSTREAM, str(reference["spritesheet"]))

        for pose in poses:
            if pose in legacy_pose_to_number:
                sprite_number = legacy_pose_to_number[pose]
                source_x = (
                    int(old_entry.get("xOffset", 0)) + (sprite_number % 3) * TILE_SIZE
                )
                source_y = (
                    int(old_entry.get("yOffset", 0)) + (sprite_number // 3) * TILE_SIZE
                )
                tile = remove_colorkey(
                    old_sheet.crop(
                        (
                            source_x,
                            source_y,
                            source_x + TILE_SIZE,
                            source_y + TILE_SIZE,
                        )
                    )
                )
            else:
                translation = best_reference_translation(
                    reference_sheet,
                    int(reference["col"]),
                    int(reference["row"]),
                    pose,
                    legacy_pose_names,
                    offsets,
                    layout,
                )
                if translation is None:
                    tile = Image.new("RGBA", (TILE_SIZE, TILE_SIZE))
                else:
                    source_pose, dx, dy = translation
                    sprite_number = legacy_pose_to_number[source_pose]
                    source_x = (
                        int(old_entry.get("xOffset", 0))
                        + (sprite_number % 3) * TILE_SIZE
                    )
                    source_y = (
                        int(old_entry.get("yOffset", 0))
                        + (sprite_number // 3) * TILE_SIZE
                    )
                    source = remove_colorkey(
                        old_sheet.crop(
                            (
                                source_x,
                                source_y,
                                source_x + TILE_SIZE,
                                source_y + TILE_SIZE,
                            )
                        )
                    )
                    tile = shift_tile(source, dx, dy)

            target = offsets[pose]
            target_x = group_col * layout[0] * TILE_SIZE + target["x"] * TILE_SIZE
            target_y = group_row * layout[1] * TILE_SIZE + target["y"] * TILE_SIZE
            sheet.alpha_composite(tile, (target_x, target_y))

        entry: OrderedDict[str, Any] = OrderedDict()
        add_group(
            entry,
            f"acc_lifegen{name}",
            ADAPTED_SHEET,
            group_col,
            group_row,
            layout,
            poseLayout="named",
        )
        entries.update(entry)

    return sheet, entries


def write_sprite_index(index: OrderedDict[str, dict[str, Any]]) -> None:
    for target in (
        FRONTEND_DATA / "spritesIndex.json",
        BACKEND_DATA / "spritesIndex.json",
    ):
        write_json(target, index)


def write_accessory_aliases(
    groups: OrderedDict[str, dict[str, Any]],
) -> None:
    for target in (
        FRONTEND_DATA / "peltInfo.json",
        BACKEND_DATA / "peltInfo.json",
    ):
        pelt_info = read_json(target)
        current_extras = [str(name) for name in pelt_info.get("extra_accessories", [])]
        upstream_extras = list(groups)
        pelt_info["extra_accessories"] = list(
            OrderedDict.fromkeys([*current_extras, *upstream_extras])
        )
        aliases: OrderedDict[str, str] = OrderedDict(
            (str(name).upper(), str(sprite_name))
            for name, sprite_name in pelt_info.get(
                "accessory_sprite_aliases", {}
            ).items()
            if str(sprite_name).startswith("acc_beastypage")
        )
        for name in pelt_info.get("extra_accessories", []):
            if (
                name in groups
                or name in RENAMED_ACCESSORIES
                or name in ADAPTED_ACCESSORIES
            ):
                aliases[str(name).upper()] = f"acc_lifegen{name}"
        already_named = {
            str(name).upper()
            for category in (
                "plant_accessories",
                "wild_accessories",
                "tail_accessories",
                "collars",
            )
            for name in pelt_info.get(category, [])
        }
        missing = [
            name
            for name in pelt_info.get("extra_accessories", [])
            if str(name).upper() not in aliases
            and str(name).upper() not in already_named
        ]
        if missing:
            raise ValueError(
                "LifeGen import does not cover these extra accessories: "
                + ", ".join(missing)
            )
        pelt_info["accessory_sprite_aliases"] = aliases
        pelt_info["accessories"] = list(
            OrderedDict.fromkeys(
                str(name)
                for category in (
                    "plant_accessories",
                    "wild_accessories",
                    "tail_accessories",
                    "collars",
                    "extra_accessories",
                )
                for name in pelt_info.get(category, [])
            )
        )
        write_json(target, pelt_info)


def main() -> None:
    manifest = read_json(SOURCE_MANIFEST)
    ensure_lifegen_source(manifest)
    validate_lifegen_source(manifest)
    groups = read_lifegen_groups()
    copy_lifegen_assets(groups)
    pose_data = read_json(BACKEND_DATA / "poseData.json")
    layout = list(pose_data["sheetLayout"])
    old_index = read_json(BACKEND_DATA / "spritesIndex.json")

    generated: OrderedDict[str, dict[str, Any]] = OrderedDict()
    for name, group in groups.items():
        add_group(
            generated,
            f"acc_lifegen{name}",
            str(group["spritesheet"]),
            int(group["col"]),
            int(group["row"]),
            layout,
            poseLayout="named",
        )

    for public_name, sprite_key in NAMED_EXISTING_ACCESSORIES.items():
        source = old_index.get(sprite_key)
        if not source:
            raise KeyError(f"Missing named accessory sprite: {public_name}")
        generated[sprite_key] = {**source, "poseLayout": "named"}

    for public_name, source_name in RENAMED_ACCESSORIES.items():
        source = generated[f"acc_lifegen{source_name}"]
        generated[f"acc_lifegen{public_name}"] = dict(source)

    adapted_sheet, adapted_entries = build_adapted_sheet(old_index, groups, pose_data)
    generated.update(adapted_entries)
    for target in (FRONTEND_SPRITES, BACKEND_SPRITES):
        adapted_sheet.save(target / f"{ADAPTED_SHEET}.png", optimize=True)

    # Put named-layout LifeGen entries first. The explicit public-name aliases
    # select them while old entries remain available as reproducible sources
    # for the adapted sheet.
    index: OrderedDict[str, dict[str, Any]] = OrderedDict()
    index.update(generated)
    for key, value in old_index.items():
        if key.startswith("acc_lifegen") or key in index:
            continue
        index[key] = value
    write_sprite_index(index)
    write_accessory_aliases(groups)

    print(
        f"Imported {len(groups)} current LifeGen accessories and "
        f"adapted {len(ADAPTED_ACCESSORIES)} preserved accessories."
    )


if __name__ == "__main__":
    main()
