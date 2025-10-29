from __future__ import annotations

from pathlib import Path


class GameConfig:
    def __init__(self) -> None:
        self.settings = {
            "dark mode": False,
            "tints": True,
        }
        self.config = {
            "fun": {
                "april_fools": False,
                "all_cats_are_newborn": False,
            },
            "cat_generation": {
                "base_heterochromia": 200,
                "direct_inheritance": 10,
            },
        }


game = GameConfig()
