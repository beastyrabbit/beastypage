from __future__ import annotations

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict

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

        self._sheet_cache: Dict[str, Image.Image] = {}
        self._sprite_cache: Dict[tuple[str, int], Image.Image] = {}
        self._missing_mask_cache: Dict[tuple[str, int], Image.Image] = {}

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

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def blank_canvas(self, colour: tuple[int, int, int, int] | None = None) -> Image.Image:
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

    def eyes(self, sprite_number: int, primary: str | None, secondary: str | None) -> Image.Image:
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

    def get_sprite(self, sprite_name: str, sprite_number: int) -> Image.Image:
        key = (sprite_name, int(sprite_number))
        if key in self._sprite_cache:
            return self._sprite_cache[key].copy()

        info = self.sprite_index.get(sprite_name)
        if info:
            sheet_name = info["spritesheet"]
            x_offset = int(info.get("xOffset", 0))
            y_offset = int(info.get("yOffset", 0))
        else:
            sheet_name = sprite_name
            x_offset = 0
            y_offset = 0

        try:
            sheet = self._load_sheet(sheet_name)
        except FileNotFoundError:
            return self.blank_canvas()
        offset = self.sprite_offsets[int(sprite_number) % len(self.sprite_offsets)]

        src_box = (
            x_offset + offset["x"] * self.tile_size,
            y_offset + offset["y"] * self.tile_size,
            x_offset + (offset["x"] + 1) * self.tile_size,
            y_offset + (offset["y"] + 1) * self.tile_size,
        )

        sprite = sheet.crop(src_box).convert("RGBA")
        sprite = self._apply_colorkey(sprite)
        self._sprite_cache[key] = sprite
        return sprite.copy()

    def get_missing_scar_mask(self, scar_name: str, sprite_number: int) -> Image.Image:
        key = (scar_name, int(sprite_number))
        if key in self._missing_mask_cache:
            return self._missing_mask_cache[key].copy()

        info = self.sprite_index.get(f"scars{scar_name}")
        if not info:
            return self.blank_canvas()

        try:
            sheet = self._load_sheet("missingscars")
        except FileNotFoundError:
            return self.blank_canvas()

        x_offset = int(info.get("xOffset", 0))
        y_offset = int(info.get("yOffset", 0))
        offset = self.sprite_offsets[int(sprite_number) % len(self.sprite_offsets)]

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
    def _apply_colorkey(self, sprite: Image.Image) -> Image.Image:
        """Treat pure blue (#0000FF) pixels as transparent, mirroring Lifegen's colorkey usage."""
        if sprite.mode != "RGBA":
            sprite = sprite.convert("RGBA")
        data = sprite.getdata()
        if not any(px[2] == 255 and px[0] == 0 and px[1] == 0 and px[3] == 255 for px in data):
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
