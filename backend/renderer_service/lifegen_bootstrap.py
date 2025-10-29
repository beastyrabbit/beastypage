from __future__ import annotations

import json
import os
from pathlib import Path

import pygame


def initialise_environment(project_root: Path) -> None:
    sprites_path = project_root / "backend/renderer_service/sprites"
    dicts_path = project_root / "frontend/public/sprite-data"

    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
    pygame.display.init()
    pygame.display.set_mode((1, 1))

    os.environ["PYGAME_HIDE_SUPPORT_PROMPT"] = "1"
    os.environ["SPRITES_PATH"] = str(sprites_path)
    os.environ["DICT_PATH"] = str(dicts_path)

    # Optionally tweak configs (game.settings, etc.) here later


def load_tint_dicts(dicts_path: Path) -> None:
    tint_path = dicts_path / "tint.json"
    wp_tint_path = dicts_path / "white_patches_tint.json"
    if tint_path.exists():
        os.environ.setdefault("TINT_JSON", tint_path.read_text())
    if wp_tint_path.exists():
        os.environ.setdefault("WHITE_PATCHES_TINT_JSON", wp_tint_path.read_text())
