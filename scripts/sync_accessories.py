#!/usr/bin/env python3
from __future__ import annotations

import ast
import json
import shutil
from collections import OrderedDict, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

ROOT = Path(__file__).resolve().parent.parent
SPRITES_PY = ROOT / "lifegen-fullgen/scripts/cat/sprites.py"
SPRITES_INDEX_PATH = ROOT / "frontend/public/sprite-data/spritesIndex.json"
PELT_INFO_PATH = ROOT / "frontend/public/sprite-data/peltInfo.json"
ACCESORY_DISPLAY_PATH = ROOT / "lifegen-fullgen/resources/dicts/acc_display.json"
BACKEND_SPRITES_DIR = ROOT / "lifegen-fullgen/sprites"
FRONTEND_SPRITES_DIR = ROOT / "frontend/public/sprites"

SPRITE_SIZE = 50


@dataclass
class GroupEntry:
    sheet: str
    x_offset: int
    y_offset: int
    name: str
    value: str


def parse_sprites_py() -> List[GroupEntry]:
    source = SPRITES_PY.read_text()
    module = ast.parse(source)
    entries: List[GroupEntry] = []

    class Visitor(ast.NodeVisitor):
        def visit_For(self, node: ast.For) -> None:
            # match: for a, i in enumerate([...]):
            if not isinstance(node.target, ast.Tuple):
                return
            if len(node.target.elts) != 2:
                return
            idx_var, value_var = node.target.elts
            if not (isinstance(idx_var, ast.Name) and isinstance(value_var, ast.Name)):
                return
            iter_call = node.iter
            if not (isinstance(iter_call, ast.Call) and isinstance(iter_call.func, ast.Name) and iter_call.func.id == "enumerate"):
                return
            if not iter_call.args:
                return
            list_node = iter_call.args[0]
            if not isinstance(list_node, (ast.List, ast.Tuple)):
                return
            values: List[str] = []
            for elt in list_node.elts:
                if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                    values.append(elt.value)
                else:
                    return
            start_index = 0
            if len(iter_call.args) >= 2:
                start_arg = iter_call.args[1]
                if isinstance(start_arg, ast.Constant) and isinstance(start_arg.value, int):
                    start_index = start_arg.value
            else:
                for kw in iter_call.keywords:
                    if kw.arg == "start" and isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, int):
                        start_index = kw.value.value
            for stmt in node.body:
                if not isinstance(stmt, ast.Expr):
                    continue
                call = stmt.value
                if not (isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == "make_group"):
                    continue
                if len(call.args) < 3:
                    continue
                sheet_arg, pos_arg, name_arg = call.args[:3]
                if not isinstance(sheet_arg, ast.Constant) or not isinstance(sheet_arg.value, str):
                    continue
                sheet_name = sheet_arg.value
                if not isinstance(pos_arg, ast.Tuple) or len(pos_arg.elts) != 2:
                    continue
                pos_expr: List[Tuple[bool, int]] = []
                for elt in pos_arg.elts:
                    if isinstance(elt, ast.Name) and elt.id == idx_var.id:
                        pos_expr.append((True, 0))
                    elif isinstance(elt, ast.Constant) and isinstance(elt.value, int):
                        pos_expr.append((False, elt.value))
                    else:
                        break
                else:
                    pass
                if len(pos_expr) != 2:
                    continue
                pattern = None
                if isinstance(name_arg, ast.JoinedStr):
                    parts: List[str] = []
                    valid = True
                    for part in name_arg.values:
                        if isinstance(part, ast.Constant):
                            parts.append(str(part.value))
                        elif isinstance(part, ast.FormattedValue) and isinstance(part.value, ast.Name) and part.value.id == value_var.id:
                            parts.append("{value}")
                        else:
                            valid = False
                            break
                    if valid:
                        pattern = "".join(parts)
                if not pattern or "{value}" not in pattern:
                    continue
                sprites_x = 3
                sprites_y = 7
                for kw in call.keywords:
                    if kw.arg == "sprites_x" and isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, int):
                        sprites_x = kw.value.value
                    elif kw.arg == "sprites_y" and isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, int):
                        sprites_y = kw.value.value
                for offset, value in enumerate(values):
                    idx = start_index + offset
                    pos_x = idx if pos_expr[0][0] else pos_expr[0][1]
                    pos_y = idx if pos_expr[1][0] else pos_expr[1][1]
                    x_offset = pos_x * sprites_x * SPRITE_SIZE
                    y_offset = pos_y * sprites_y * SPRITE_SIZE
                    name = pattern.replace("{value}", value)
                    entries.append(GroupEntry(sheet=sheet_name, x_offset=x_offset, y_offset=y_offset, name=name, value=value))
            # Continue traversal for nested loops
            self.generic_visit(node)

    Visitor().visit(module)
    return entries


def load_json(path: Path) -> OrderedDict[str, Dict]:
    return json.loads(path.read_text(), object_pairs_hook=OrderedDict)


def main() -> None:
    entries = parse_sprites_py()
    sprites_index = load_json(SPRITES_INDEX_PATH)
    pelt_info = json.loads(PELT_INFO_PATH.read_text())
    accessory_display = json.loads(ACCESORY_DISPLAY_PATH.read_text())

    existing_accessories = set()
    for key in ("plant_accessories", "wild_accessories", "collars", "extra_accessories"):
        existing_accessories.update(pelt_info.get(key, []))

    new_entries = OrderedDict()
    new_accessories = set(pelt_info.get("extra_accessories", []))
    sheets_needed = set()

    def is_accessory(name: str) -> bool:
        prefixes = ("acc_", "collars")
        return name.startswith(prefixes)

    for entry in entries:
        if entry.name in sprites_index:
            continue
        if not is_accessory(entry.name):
            continue
        new_entries[entry.name] = {
            "spritesheet": entry.sheet,
            "xOffset": entry.x_offset,
            "yOffset": entry.y_offset,
        }
        sheets_needed.add(entry.sheet)
        accessory_key = entry.value.strip()
        if accessory_key and accessory_key not in existing_accessories:
            new_accessories.add(accessory_key)

    if not new_entries:
        print("No new sprite groups detected.")
    else:
        print(f"Adding {len(new_entries)} sprite groups to spritesIndex.json")
        merged = OrderedDict()
        merged.update(sprites_index)
        merged.update(new_entries)
        SPRITES_INDEX_PATH.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n")

    if new_accessories:
        sorted_accessories = sorted(new_accessories)
        pelt_info["extra_accessories"] = sorted_accessories
        PELT_INFO_PATH.write_text(json.dumps(pelt_info, indent=2, ensure_ascii=False) + "\n")
        print(f"extra_accessories count: {len(sorted_accessories)}")

    copied = 0
    for sheet in sorted(sheets_needed):
        src = BACKEND_SPRITES_DIR / f"{sheet}.png"
        if not src.exists():
            continue
        dest = FRONTEND_SPRITES_DIR / f"{sheet}.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            shutil.copy2(src, dest)
            copied += 1
    if copied:
        print(f"Copied {copied} missing sprite sheet(s) into frontend/public/sprites")


if __name__ == "__main__":
    main()
