import hashlib
import json
from pathlib import Path
from statistics import median

from PIL import Image
from renderer_service.renderer.repository import SpriteRepository
from renderer_service.renderer.sprite_mapper import SpriteMapper

DATA_DIR = Path("renderer_service/data")
DICT_DIR = Path("sprites/dicts")
ROOT_DIR = Path(__file__).parents[3]

CUSTOM_ACCESSORIES = (
    "COMPUTER MOUSE",
    "GAME CONTROLLER",
    "SCREWDRIVER",
)
RETIRED_CUSTOM_ACCESSORIES = ("HEADPHONES", "HANDBAG")


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _flatten_sprite_list(sprite_list):
    for row in sprite_list:
        if isinstance(row, dict):
            yield from row.keys()
        else:
            yield from row


def test_all_accessories_have_sprites():
    mapper = SpriteMapper(DATA_DIR)
    repo = SpriteRepository()

    missing = []
    for name in mapper.accessories:
        sprite_name = mapper.accessory_sprite_name(name)
        if not sprite_name or not repo.has_sprite(sprite_name, 8):
            missing.append((name, sprite_name))

    assert not missing, (
        f"Accessories without sprites: {missing[:10]} (total {len(missing)})"
    )


def test_new_upstream_and_beasty_accessories_resolve():
    mapper = SpriteMapper(DATA_DIR)
    repo = SpriteRepository()

    for name in ("WISTERIA", "ROAD RUNNER FEATHER", "TOAST"):
        sprite_name = mapper.accessory_sprite_name(name)
        assert sprite_name is not None
        assert repo.has_sprite(sprite_name, 8)


def test_palette_collars_and_legacy_aliases_resolve():
    mapper = SpriteMapper(DATA_DIR)
    repo = SpriteRepository()

    for name in ("LEATHER_blue", "BLUE", "BLUEBELL"):
        sprite_name = mapper.accessory_sprite_name(name)
        assert sprite_name is not None
        assert sprite_name.startswith("acc_collars")
        assert repo.has_sprite(sprite_name, 8)


def test_all_extra_accessories_render_every_new_pose():
    mapper = SpriteMapper(DATA_DIR)
    repo = SpriteRepository()

    missing = []
    for name in mapper.pelt_info.get("extra_accessories", []):
        sprite_name = mapper.accessory_sprite_name(name)
        for pose_name in (
            "adolescent_long0",
            "adolescent_long1",
            "adolescent_long2",
        ):
            if (
                not sprite_name
                or repo.get_sprite(sprite_name, 8, pose_name).getbbox() is None
            ):
                missing.append((name, sprite_name, pose_name))

    assert not missing, f"Extra accessories missing new poses: {missing[:10]}"


def test_custom_accessories_render_every_named_pose():
    mapper = SpriteMapper(DATA_DIR)
    repo = SpriteRepository()
    pose_data = _load_json(DATA_DIR / "poseData.json")

    missing = []
    for name in CUSTOM_ACCESSORIES:
        sprite_name = mapper.accessory_sprite_name(name)
        assert sprite_name == f"acc_beastypage{name}"
        assert repo.sprite_index[sprite_name]["poseLayout"] == "named"
        for pose_name in pose_data["poses"]:
            sprite = repo.get_sprite(sprite_name, None, pose_name)
            if sprite.getbbox() is None:
                missing.append((name, pose_name))
            assert sprite.size == (50, 50)

    assert not missing, f"Custom accessories missing named poses: {missing}"


def test_custom_accessory_art_is_unique_and_not_age_scaled():
    mapper = SpriteMapper(DATA_DIR)
    repo = SpriteRepository()
    poses = _load_json(DATA_DIR / "poseData.json")["poses"]
    age_groups = {
        "newborn": poses[0:3],
        "kitten": poses[3:6],
        "adolescent": poses[6:12],
        "adult": poses[12:18],
    }

    def pixel_count(sprite: Image.Image) -> int:
        alpha_histogram = sprite.getchannel("A").histogram()
        return sum(alpha_histogram[1:])

    counts_by_accessory = {}
    for name in CUSTOM_ACCESSORIES:
        sprite_name = mapper.accessory_sprite_name(name)
        sprites = {
            pose_name: repo.get_sprite(sprite_name, None, pose_name)
            for pose_name in poses
        }
        assert len({sprite.tobytes() for sprite in sprites.values()}) == len(poses)
        counts_by_accessory[name] = {
            age: [pixel_count(sprites[pose_name]) for pose_name in pose_names]
            for age, pose_names in age_groups.items()
        }

    for counts in counts_by_accessory.values():
        # Different viewing angles change the projected footprint, but a
        # newborn gets the same physical object instead of a miniature copy.
        assert median(counts["newborn"]) >= median(counts["adult"]) * 0.7


def test_rejected_custom_accessories_are_fully_removed():
    mapper = SpriteMapper(DATA_DIR)
    repo = SpriteRepository()

    for name in RETIRED_CUSTOM_ACCESSORIES:
        assert name not in mapper.accessories
        assert name not in mapper.pelt_info.get("extra_accessories", [])
        assert mapper.accessory_sprite_name(name) is None
        assert f"acc_beastypage{name}" not in repo.sprite_index


def test_custom_accessory_sheet_is_synchronized():
    paths = (
        ROOT_DIR / "frontend/public/sprites/acc_beastypage_custom.png",
        ROOT_DIR / "backend/renderer_service/sprites/acc_beastypage_custom.png",
    )
    hashes = [hashlib.sha256(path.read_bytes()).hexdigest() for path in paths]

    assert hashes[0] == hashes[1]


def test_renamed_and_adapted_lifegen_accessories_use_named_layout():
    mapper = SpriteMapper(DATA_DIR)
    repo = SpriteRepository()

    holly = mapper.accessory_sprite_name("HOLLY2")
    feathers = mapper.accessory_sprite_name("SPRINGFEATHERS")
    jay = mapper.accessory_sprite_name("JAYFEATHER")

    assert holly == "acc_lifegenHOLLY2"
    assert feathers == "acc_lifegenSPRINGFEATHERS"
    assert jay == "acc_lifegenJAYFEATHER"
    assert repo.sprite_index[holly]["spritesheet"] == "acc_sophisticated"
    assert repo.sprite_index[feathers]["spritesheet"] == "acc_misc2"
    assert repo.sprite_index[jay]["spritesheet"] == "acc_lifegen_adapted"
    assert all(
        repo.sprite_index[key]["poseLayout"] == "named"
        for key in (holly, feathers, jay)
    )


def test_wisteria_preserves_named_layout_through_future_imports():
    mapper = SpriteMapper(DATA_DIR)
    repo = SpriteRepository()

    sprite_name = mapper.accessory_sprite_name("WISTERIA")

    assert sprite_name == "acc_plantsWISTERIA"
    assert repo.sprite_index[sprite_name]["poseLayout"] == "named"
    assert all(
        repo.get_sprite(sprite_name, 8, pose_name).getbbox() is not None
        for pose_name in (
            "adolescent_long0",
            "adolescent_long1",
            "adolescent_long2",
        )
    )


def test_missing_scar_masks_use_imported_named_pose_sheet():
    repo = SpriteRepository()

    mask = repo.get_missing_scar_mask("NOTAIL", 8, "adolescent_long0")
    direct_sprite = repo.get_sprite("scarsNOTAIL", 8, "adolescent_long0")

    assert repo.sprite_index["scarsNOTAIL"]["spritesheet"] == "scars_missing_part"
    assert mask.getbbox() is not None
    assert mask.tobytes() == direct_sprite.tobytes()


def test_missing_scar_mask_cache_separates_named_and_legacy_offsets():
    repo = SpriteRepository()

    named_pose_mask = repo.get_missing_scar_mask("NOTAIL", 8, "adolescent_long0")
    legacy_number_mask = repo.get_missing_scar_mask("NOTAIL", 9)
    fresh_legacy_mask = SpriteRepository().get_missing_scar_mask("NOTAIL", 9)

    assert legacy_number_mask.tobytes() == fresh_legacy_mask.tobytes()
    assert named_pose_mask.tobytes() != legacy_number_mask.tobytes()


def test_invalid_pose_names_share_canonical_sprite_cache_key():
    repo = SpriteRepository()

    repo.get_sprite("singleWHITE", 8, "invalid-one")
    repo.get_sprite("singleWHITE", 8, "invalid-two")

    cache_keys = [key for key in repo._sprite_cache if key[0] == "singleWHITE"]
    assert cache_keys == [("singleWHITE", 8, "adult_short2", None)]


def test_palette_map_uses_original_pixels_for_overlapping_targets():
    repo = SpriteRepository()
    sprite = Image.new("RGBA", (2, 1))
    sprite.putdata([(1, 1, 1, 255), (2, 2, 2, 255)])
    palette = Image.new("RGBA", (2, 2))
    palette.putdata(
        [
            (1, 1, 1, 255),
            (2, 2, 2, 255),
            (2, 2, 2, 255),
            (3, 3, 3, 255),
        ]
    )
    repo._sheet_cache["test_palette"] = palette

    mapped = repo._apply_palette_map(
        sprite,
        {
            "paletteSheet": "test_palette",
            "paletteName": "TARGET",
            "paletteNames": ["BASE", "TARGET"],
        },
    )

    assert list(mapped.getdata()) == [(2, 2, 2, 255), (3, 3, 3, 255)]


def test_generated_metadata_covers_upstream_sprite_dicts():
    repo = SpriteRepository()
    index = repo.sprite_index

    pelt_data = _load_json(DICT_DIR / "pelt_sprite_data.json")
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
    colours = list(_flatten_sprite_list(pelt_data["sprite_list"]))
    for pelt_names in pelt_data["spritesheet"].values():
        for pelt_name in pelt_names:
            prefix = pelt_prefix[pelt_name]
            for colour in colours:
                assert f"{prefix}{colour}" in index

    expectations = {
        "eye_sprite_data.json": ("eyes", ""),
        "skin_sprite_data.json": ("skin", ""),
        "scar_sprite_data.json": ("scars", ""),
        "scar_missing_sprite_data.json": ("scars", ""),
        "tortie_patches_sprite_data.json": ("tortiemask", ""),
        "white_patches_little_sprite_data.json": ("white", ""),
        "white_patches_mid_sprite_data.json": ("white", ""),
        "white_patches_high_sprite_data.json": ("white", ""),
        "white_patches_mostly_sprite_data.json": ("white", ""),
        "white_patches_points_sprite_data.json": ("white", ""),
        "white_patches_vitiligo_sprite_data.json": ("white", ""),
    }
    for file_name, (prefix, suffix) in expectations.items():
        data = _load_json(DICT_DIR / file_name)
        for name in _flatten_sprite_list(data["sprite_list"]):
            assert f"{prefix}{name}{suffix}" in index

    pose_data = _load_json(DICT_DIR / "pose_sprite_data.json")
    for sheet in pose_data["spritesheet"]:
        assert repo.has_sprite(sheet, 0)
