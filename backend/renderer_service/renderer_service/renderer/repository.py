from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import numpy as np
from PIL import Image

from ..config import settings
from .colors import resolve_colour


class SpriteRepository:
    """Thin loader around the Lifegen sprite atlases (minimal subset for V3 bootstrap)."""

    def __init__(self, sprite_root: Path | None = None, tile_size: int = 50) -> None:
        self.sprite_root = sprite_root or settings.sprite_root
        self.tile_size = tile_size
        data_root = Path(__file__).resolve().parents[1] / "data"
        with open(data_root / "spritesIndex.json", "r", encoding="utf-8") as fh:
            self.sprite_index: Dict[str, dict] = json.load(fh)
        with open(data_root / "spritesOffsetMap.json", "r", encoding="utf-8") as fh:
            self.sprite_offsets = json.load(fh)
        with open(data_root / "poseData.json", "r", encoding="utf-8") as fh:
            self.pose_data: Dict[str, Any] = json.load(fh)

        self.pose_names: list[str] = list(self.pose_data.get("poses", []))
        self.pose_name_to_offset: Dict[str, dict] = dict(
            self.pose_data.get("poseNameToOffset", {})
        )
        self.legacy_sprite_to_pose: Dict[str, str] = {
            str(key): str(value)
            for key, value in self.pose_data.get(
                "legacySpriteNumberToPoseName", {}
            ).items()
        }
        self.legacy_pose_to_sprite: Dict[str, int] = {
            str(key): int(value)
            for key, value in self.pose_data.get(
                "legacyPoseNameToSpriteNumber", {}
            ).items()
        }
        self.legacy_pose_to_offset: Dict[str, dict] = dict(
            self.pose_data.get("legacyPoseNameToOffset", {})
        )

        self._sheet_cache: Dict[str, Image.Image] = {}
        self._sprite_cache: Dict[
            tuple[str, int, str | None, str | None], Image.Image
        ] = {}
        self._missing_mask_cache: Dict[tuple[str, int, str | None], Image.Image] = {}

    # ------------------------------------------------------------------
    # Sprite sheet helpers
    # ------------------------------------------------------------------
    def _load_sheet(self, sheet_name: str) -> Image.Image:
        if sheet_name in self._sheet_cache:
            return self._sheet_cache[sheet_name]
        path = self.sprite_root / f"{sheet_name}.png"
        image = Image.open(path).convert("RGBA")
        self._sheet_cache[sheet_name] = image
        return image

    def _legacy_offset_for_number(self, sprite_number: int | None) -> dict:
        try:
            number = int(sprite_number or 0)
        except (TypeError, ValueError):
            number = 0
        number = max(0, number)
        return {"x": number % 3, "y": number // 3}

    def _resolve_pose_offset(
        self,
        sprite_number: int | None = None,
        pose_name: str | None = None,
        pose_layout: str | None = None,
    ) -> dict | None:
        if pose_layout == "legacy":
            if pose_name:
                return self.legacy_pose_to_offset.get(str(pose_name))
            return self._legacy_offset_for_number(sprite_number)

        if pose_name:
            pose = str(pose_name)
            offset = self.pose_name_to_offset.get(pose)
            if offset:
                return offset

        try:
            number = int(sprite_number or 0)
        except (TypeError, ValueError):
            number = 0

        legacy_pose = self.legacy_sprite_to_pose.get(str(number))
        if legacy_pose and legacy_pose in self.pose_name_to_offset:
            return self.pose_name_to_offset[legacy_pose]

        if self.sprite_offsets:
            return self.sprite_offsets[number % len(self.sprite_offsets)]
        return {"x": 0, "y": 0}

    def pose_name_for_sprite_number(self, sprite_number: int | None) -> str | None:
        try:
            number = int(sprite_number or 0)
        except (TypeError, ValueError):
            number = 0
        return self.legacy_sprite_to_pose.get(str(number))

    def sprite_number_for_pose(
        self,
        pose_name: str | None,
        fallback: int | None = 0,
        pose_layout: str | None = None,
    ) -> int:
        if pose_name:
            pose = str(pose_name)
            if pose in self.legacy_pose_to_sprite:
                return self.legacy_pose_to_sprite[pose]
            if pose_layout != "legacy" and pose in self.pose_names:
                return self.pose_names.index(pose)
        try:
            return int(fallback or 0)
        except (TypeError, ValueError):
            return 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def blank_canvas(
        self, colour: tuple[int, int, int, int] | None = None
    ) -> Image.Image:
        colour = colour or (0, 0, 0, 0)
        return Image.new("RGBA", (self.tile_size, self.tile_size), colour)

    def base_fill(self, colour_name: str | None, tint_name: str | None) -> Image.Image:
        colour = resolve_colour(colour_name)
        tint = resolve_colour(tint_name, (0, 0, 0, 0))
        base = self.blank_canvas(colour)
        if tint[-1] > 0:
            tint_layer = self.blank_canvas(tint)
            base = Image.alpha_composite(base, tint_layer)
        return base

    def lineart(self, sprite_number: int) -> Image.Image:
        return self.get_sprite("lines", sprite_number)

    def eyes(
        self, sprite_number: int, primary: str | None, secondary: str | None
    ) -> Image.Image:
        eyes = self.get_sprite("eyes", sprite_number)

        # Tint simple gradients for heterochromia approximation.
        if primary or secondary:
            eye_layer = self.blank_canvas()
            left_colour = resolve_colour(primary, (255, 255, 255, 180))
            right_colour = resolve_colour(secondary or primary, (255, 255, 255, 180))
            for x in range(self.tile_size):
                for y in range(self.tile_size):
                    px = eyes.getpixel((x, y))
                    if px[3] == 0:
                        continue
                    if x < self.tile_size // 2:
                        eye_layer.putpixel((x, y), left_colour)
                    else:
                        eye_layer.putpixel((x, y), right_colour)
            eyes = Image.alpha_composite(eye_layer, eyes)
        return eyes

    def get_sprite(
        self,
        sprite_name: str,
        sprite_number: int | None,
        pose_name: str | None = None,
    ) -> Image.Image:
        info = self.sprite_index.get(sprite_name)
        if info:
            sheet_name = info["spritesheet"]
            x_offset = int(info.get("xOffset", 0))
            y_offset = int(info.get("yOffset", 0))
            pose_layout = info.get("poseLayout")
        else:
            sheet_name = sprite_name
            x_offset = 0
            y_offset = 0
            pose_layout = None

        resolved_number = self.sprite_number_for_pose(
            pose_name, sprite_number, pose_layout
        )
        key = (sprite_name, resolved_number, pose_name, pose_layout)
        if key in self._sprite_cache:
            return self._sprite_cache[key].copy()

        try:
            sheet = self._load_sheet(sheet_name)
        except FileNotFoundError:
            return self.blank_canvas()
        offset = self._resolve_pose_offset(resolved_number, pose_name, pose_layout)
        if offset is None:
            sprite = self.blank_canvas()
            self._sprite_cache[key] = sprite
            return sprite.copy()

        src_box = (
            x_offset + offset["x"] * self.tile_size,
            y_offset + offset["y"] * self.tile_size,
            x_offset + (offset["x"] + 1) * self.tile_size,
            y_offset + (offset["y"] + 1) * self.tile_size,
        )

        sprite = sheet.crop(src_box).convert("RGBA")
        sprite = self._apply_colorkey(sprite)
        sprite = self._apply_palette_map(sprite, info)
        self._sprite_cache[key] = sprite
        return sprite.copy()

    def get_missing_scar_mask(
        self,
        scar_name: str,
        sprite_number: int | None,
        pose_name: str | None = None,
    ) -> Image.Image:
        resolved_number = self.sprite_number_for_pose(pose_name, sprite_number)
        key = (scar_name, resolved_number, pose_name)
        if key in self._missing_mask_cache:
            return self._missing_mask_cache[key].copy()

        info = self.sprite_index.get(f"scars{scar_name}")
        if not info:
            return self.blank_canvas()

        try:
            sheet = self._load_sheet(info["spritesheet"])
        except FileNotFoundError:
            return self.blank_canvas()

        x_offset = int(info.get("xOffset", 0))
        y_offset = int(info.get("yOffset", 0))
        offset = self._resolve_pose_offset(resolved_number, pose_name)

        src_box = (
            x_offset + offset["x"] * self.tile_size,
            y_offset + offset["y"] * self.tile_size,
            x_offset + (offset["x"] + 1) * self.tile_size,
            y_offset + (offset["y"] + 1) * self.tile_size,
        )

        mask = sheet.crop(src_box).convert("RGBA")
        mask = self._apply_colorkey(mask)
        self._missing_mask_cache[key] = mask
        return mask.copy()

    # ------------------------------------------------------------------
    def _apply_palette_map(self, sprite: Image.Image, info: dict | None) -> Image.Image:
        if not info:
            return sprite

        palette_sheet = info.get("paletteSheet")
        palette_name = info.get("paletteName")
        palette_names = info.get("paletteNames") or []
        if not palette_sheet or not palette_name or not palette_names:
            return sprite

        try:
            target_row = list(palette_names).index(palette_name)
            base_row = list(palette_names).index("BASE")
        except ValueError:
            return sprite

        try:
            palette = self._load_sheet(str(palette_sheet))
        except FileNotFoundError:
            return sprite

        width, height = palette.size
        if base_row >= height or target_row >= height:
            return sprite

        base_colours = [palette.getpixel((x, base_row)) for x in range(width)]
        target_colours = [palette.getpixel((x, target_row)) for x in range(width)]

        arr = np.array(sprite, dtype=np.uint8, copy=True)
        for base, target in zip(base_colours, target_colours):
            base_arr = np.array(base, dtype=np.uint8)
            target_arr = np.array(target, dtype=np.uint8)
            mask = np.all(arr == base_arr, axis=-1)
            if np.any(mask):
                arr[mask] = target_arr
        return Image.fromarray(arr, mode="RGBA")

    def _apply_colorkey(self, sprite: Image.Image) -> Image.Image:
        """Treat pure blue (#0000FF) pixels as transparent, mirroring Lifegen's colorkey usage."""
        if sprite.mode != "RGBA":
            sprite = sprite.convert("RGBA")
        data = sprite.getdata()
        if not any(
            px[2] == 255 and px[0] == 0 and px[1] == 0 and px[3] == 255 for px in data
        ):
            return sprite
        new_data = []
        for r, g, b, a in data:
            if r == 0 and g == 0 and b == 255:
                new_data.append((0, 0, 0, 0))
            else:
                new_data.append((r, g, b, a))
        sprite.putdata(new_data)
        return sprite

    def has_sprite(self, sprite_name: str, sprite_number: int | None = None) -> bool:
        info = self.sprite_index.get(sprite_name)
        if info:
            sheet_path = self.sprite_root / f"{info['spritesheet']}.png"
            return sheet_path.exists()
        sheet_path = self.sprite_root / f"{sprite_name}.png"
        return sheet_path.exists()
