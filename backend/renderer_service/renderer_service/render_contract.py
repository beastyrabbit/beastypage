from __future__ import annotations

import argparse
from pathlib import Path

from .renderer.executor import DEFAULT_MANIFEST_PATH
from .renderer.pipeline import RenderPipeline
from .renderer.strategies import STRATEGY_REGISTRY


def check_manifest(path: Path = DEFAULT_MANIFEST_PATH) -> None:
    STRATEGY_REGISTRY.check_manifest(path)


def write_manifest(path: Path = DEFAULT_MANIFEST_PATH) -> None:
    STRATEGY_REGISTRY.write_manifest(path)


def check_contract(path: Path = DEFAULT_MANIFEST_PATH) -> None:
    check_manifest(path)
    RenderPipeline(manifest_path=path)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate or verify the Python renderer strategy manifest."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    parser.add_argument("--path", type=Path, default=DEFAULT_MANIFEST_PATH)
    args = parser.parse_args()

    if args.write:
        write_manifest(args.path)
    else:
        check_contract(args.path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = ["check_contract", "check_manifest", "main", "write_manifest"]
