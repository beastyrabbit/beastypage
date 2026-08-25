#!/usr/bin/env python3
"""Generate BeastyPage's pose-aware, native-pixel accessories.

Every accessory is drawn directly at 50 x 50 pixels from absolute coordinates
for its exact cat frame. The cat sprite is never moved, resized, or redrawn.
"""

from __future__ import annotations

from collections import OrderedDict
from collections.abc import Callable

from beastypage_accessory_pixel_designs import (
    CONTROLLER_PIXEL_DESIGNS,
    MOUSE_PIXEL_DESIGNS,
    SCREWDRIVER_PIXEL_DESIGNS,
    PixelDesign,
)
from import_clangen_sprites import (
    BACKEND_DATA,
    BACKEND_SPRITES,
    FRONTEND_DATA,
    FRONTEND_SPRITES,
    TILE_SIZE,
    add_group,
    read_json,
    write_json,
)
from PIL import Image, ImageDraw

SHEET_NAME = "acc_beastypage_custom"
SHEET_LAYOUT = (3, 9)

ACCESSORIES: OrderedDict[str, str] = OrderedDict(
    [
        ("COMPUTER MOUSE", "mouse"),
        ("GAME CONTROLLER", "controller"),
        ("SCREWDRIVER", "screwdriver"),
    ]
)
RETIRED_ACCESSORIES = ("HEADPHONES", "HANDBAG")

EXPECTED_POSES = (
    "newborn0",
    "newborn1",
    "newborn2",
    "kitten0",
    "kitten1",
    "kitten2",
    "adolescent_short0",
    "adolescent_short1",
    "adolescent_short2",
    "adolescent_long0",
    "adolescent_long1",
    "adolescent_long2",
    "adult_short0",
    "adult_short1",
    "adult_short2",
    "adult_long0",
    "adult_long1",
    "adult_long2",
    "senior0",
    "senior1",
    "senior2",
    "para_adult_short0",
    "para_adult_long0",
    "para_young0",
    "sick_adult0",
    "sick_young0",
)

OUTLINE = (32, 27, 34, 255)
CABLE = (48, 43, 52, 255)
MOUSE_DARK = (58, 72, 82, 255)
MOUSE_LIGHT = (116, 151, 158, 255)
NAVY = (45, 52, 82, 255)
TEAL = (75, 139, 144, 255)
VIOLET = (87, 62, 112, 255)
ROSE = (164, 74, 102, 255)
GOLD = (224, 180, 69, 255)
ORANGE = (190, 81, 39, 255)
STEEL = (177, 190, 195, 255)
HIGHLIGHT = (230, 226, 206, 255)

COLOURS = {
    "outline": OUTLINE,
    "mouse_dark": MOUSE_DARK,
    "teal": TEAL,
    "violet": VIOLET,
    "rose": ROSE,
    "gold": GOLD,
    "orange": ORANGE,
    "steel": STEEL,
    "highlight": HIGHLIGHT,
}


def draw_pixel_design(
    image: Image.Image,
    design: PixelDesign,
    fill_colour: tuple[int, int, int, int],
) -> None:
    """Paint one fully materialized pose design onto a transparent tile."""
    draw = ImageDraw.Draw(image)

    cable = design["cable"]
    if cable:
        draw.line(cable, fill=CABLE)

    outline = design["outline"]
    if outline:
        draw.polygon(outline, fill=OUTLINE)

    fill = design["fill"]
    if fill:
        draw.polygon(fill, fill=fill_colour)

    for colour_name, points in design["polygons"]:
        draw.polygon(points, fill=COLOURS[colour_name])

    for colour_name, width, points in design["strokes"]:
        colour = COLOURS[colour_name]
        if len(points) == 1:
            draw.point(points[0], fill=colour)
        else:
            draw.line(points, fill=colour, width=width)

    # The final dark pixel makes the cable or handle visibly pinch at the
    # mouth. Resting newborn/sick designs deliberately have no bite point.
    bite = design["bite"]
    if bite is not None:
        draw.point(bite, fill=OUTLINE)


def draw_mouse(image: Image.Image, variant: int) -> None:
    draw_pixel_design(image, MOUSE_PIXEL_DESIGNS[variant], MOUSE_LIGHT)


def draw_controller(image: Image.Image, variant: int) -> None:
    draw_pixel_design(image, CONTROLLER_PIXEL_DESIGNS[variant], NAVY)


def draw_screwdriver(image: Image.Image, variant: int) -> None:
    draw_pixel_design(image, SCREWDRIVER_PIXEL_DESIGNS[variant], ORANGE)


DRAWERS: dict[str, Callable[[Image.Image, int], None]] = {
    "mouse": draw_mouse,
    "controller": draw_controller,
    "screwdriver": draw_screwdriver,
}


def validate_designs(all_poses: tuple[str, ...]) -> None:
    if all_poses != EXPECTED_POSES:
        missing = sorted(set(EXPECTED_POSES) - set(all_poses))
        extra = sorted(set(all_poses) - set(EXPECTED_POSES))
        raise ValueError(
            "Named pose order changed; "
            f"missing={missing}, extra={extra}, actual={all_poses}"
        )

    expected_variants = set(range(len(EXPECTED_POSES)))
    for name, designs in (
        ("mouse", MOUSE_PIXEL_DESIGNS),
        ("controller", CONTROLLER_PIXEL_DESIGNS),
        ("screwdriver", SCREWDRIVER_PIXEL_DESIGNS),
    ):
        if set(designs) != expected_variants:
            missing = sorted(expected_variants - set(designs))
            extra = sorted(set(designs) - expected_variants)
            raise ValueError(
                f"{name} designs are out of sync; missing={missing}, extra={extra}"
            )


def build_sheet(pose_data: dict) -> Image.Image:
    layout = tuple(int(value) for value in pose_data["sheetLayout"])
    if layout != SHEET_LAYOUT:
        raise ValueError(f"Expected named pose layout {SHEET_LAYOUT}, got {layout}")

    all_poses = tuple(str(name) for name in pose_data["poses"])
    validate_designs(all_poses)

    group_width = layout[0] * TILE_SIZE
    group_height = layout[1] * TILE_SIZE
    sheet = Image.new("RGBA", (group_width * len(ACCESSORIES), group_height))

    for group_index, (_, drawer_name) in enumerate(ACCESSORIES.items()):
        drawer = DRAWERS[drawer_name]
        for variant, pose_name in enumerate(all_poses):
            offset = pose_data["poseNameToOffset"][pose_name]
            tile = Image.new("RGBA", (TILE_SIZE, TILE_SIZE))
            drawer(tile, variant)
            target_x = group_index * group_width + int(offset["x"]) * TILE_SIZE
            target_y = int(offset["y"]) * TILE_SIZE
            sheet.alpha_composite(tile, (target_x, target_y))

    return sheet


def update_sprite_index(pose_data: dict) -> None:
    index = read_json(BACKEND_DATA / "spritesIndex.json")
    layout = list(pose_data["sheetLayout"])
    generated: OrderedDict[str, dict] = OrderedDict()
    for group_index, public_name in enumerate(ACCESSORIES):
        add_group(
            generated,
            f"acc_beastypage{public_name}",
            SHEET_NAME,
            group_index,
            0,
            layout,
            poseLayout="named",
        )

    removed_keys = {f"acc_beastypage{name}" for name in RETIRED_ACCESSORIES}
    combined: OrderedDict[str, dict] = OrderedDict()
    combined.update(generated)
    combined.update(
        (key, value)
        for key, value in index.items()
        if key not in generated and key not in removed_keys
    )
    for target in (
        FRONTEND_DATA / "spritesIndex.json",
        BACKEND_DATA / "spritesIndex.json",
    ):
        write_json(target, combined)


def update_pelt_info() -> None:
    pelt_info = read_json(BACKEND_DATA / "peltInfo.json")
    retired = set(RETIRED_ACCESSORIES)
    extra_accessories = OrderedDict.fromkeys(
        [
            *(
                str(name)
                for name in pelt_info.get("extra_accessories", [])
                if str(name) not in retired
            ),
            *ACCESSORIES.keys(),
        ]
    )
    pelt_info["extra_accessories"] = list(extra_accessories)

    aliases = OrderedDict(
        (str(name).upper(), str(sprite))
        for name, sprite in pelt_info.get("accessory_sprite_aliases", {}).items()
        if str(name).upper() not in retired
    )
    for public_name in ACCESSORIES:
        aliases[public_name] = f"acc_beastypage{public_name}"
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

    for target in (
        FRONTEND_DATA / "peltInfo.json",
        BACKEND_DATA / "peltInfo.json",
    ):
        write_json(target, pelt_info)


def main() -> None:
    pose_data = read_json(BACKEND_DATA / "poseData.json")
    sheet = build_sheet(pose_data)
    for target in (FRONTEND_SPRITES, BACKEND_SPRITES):
        sheet.save(target / f"{SHEET_NAME}.png", optimize=True)
    update_sprite_index(pose_data)
    update_pelt_info()
    print(
        f"Generated {len(ACCESSORIES)} accessories for {len(pose_data['poses'])} poses."
    )


if __name__ == "__main__":
    main()
