#!/usr/bin/env python
from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys
from io import BytesIO
from pathlib import Path
from typing import Any, Dict

import numpy as np
from PIL import Image

from renderer_service.renderer.image_ops import add, multiply, screen
from renderer_service.renderer.pipeline import RenderPipeline
from renderer_service.renderer.repository import SpriteRepository

ROOT = Path(__file__).resolve().parents[3]
FRONTEND_DIR = ROOT / "frontend"
WORKER_PATH = FRONTEND_DIR / "scripts" / "v2_worker.ts"


def launch_worker() -> subprocess.Popen:
    cmd = ["bun", "run", str(WORKER_PATH)]
    return subprocess.Popen(
        cmd,
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
        bufsize=1,
    )


def read_json_line(stream) -> Dict[str, Any]:
    line = stream.readline()
    if not line:
        raise RuntimeError("worker terminated unexpectedly")
    return json.loads(line)


def sanitize_params(params: Dict[str, Any]) -> Dict[str, Any]:
    cleaned: Dict[str, Any] = {}
    for key, value in params.items():
        if value is None:
            continue
        if isinstance(value, str) and value == "":
            continue
        cleaned[key] = value
    return cleaned


def load_v2_image(encoded: str) -> Image.Image:
    data = base64.b64decode(encoded)
    return Image.open(BytesIO(data)).convert("RGBA")


def image_to_array(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGBA"), dtype=np.uint8)


def apply_blend(base: Image.Image, overlay: Image.Image, mode: str) -> Image.Image:
    if mode == "alpha":
        return Image.alpha_composite(base, overlay)
    if mode == "multiply":
        return multiply(base, overlay)
    if mode == "screen":
        return screen(base, overlay)
    if mode == "add":
        return add(base, overlay)
    if mode == "replace":
        return overlay.copy()
    return Image.alpha_composite(base, overlay)


def diff_images(img_a: Image.Image, img_b: Image.Image) -> np.ndarray:
    arr_a = image_to_array(img_a)
    arr_b = image_to_array(img_b)
    return arr_a.astype(np.int16) - arr_b.astype(np.int16)


def mismatch_count(diff: np.ndarray) -> int:
    return int(np.count_nonzero(diff))


def accumulate_snapshots(layers, initial: Image.Image) -> list[Image.Image]:
    composed = initial.copy()
    snapshots: list[Image.Image] = []
    for layer in layers:
        composed = apply_blend(composed, layer.image, layer.blend_mode or "alpha")
        snapshots.append(composed.copy())
    return snapshots


def run_parity(max_samples: int = 10000, tolerance: int = 0) -> int:
    worker = launch_worker()
    assert worker.stdout is not None and worker.stdin is not None

    handshake = read_json_line(worker.stdout)
    if not handshake.get("ok"):
        raise RuntimeError(f"Worker failed to start: {handshake}")

    repo = SpriteRepository()
    pipeline = RenderPipeline(repository=repo)

    failure_dir = ROOT / "parity_failures"
    failure_dir.mkdir(exist_ok=True)

    for idx in range(1, max_samples + 1):
        worker.stdin.write("random\n")
        worker.stdin.flush()

        message = read_json_line(worker.stdout)
        if not message.get("ok"):
            raise RuntimeError(f"Worker error: {message}")

        params = sanitize_params(message["params"])
        if "spriteNumber" not in params:
            raise RuntimeError("V2 result missing spriteNumber")

        result_v3 = pipeline.render(params, collect_layers=True)
        img_v3 = result_v3.composed.convert("RGBA")
        img_v2 = load_v2_image(message["imageBase64"])  # already 50x50

        diff = diff_images(img_v3, img_v2)
        total_mismatch = mismatch_count(diff)
        if total_mismatch <= tolerance:
            if idx % 100 == 0:
                print(f"{idx} samples OK", file=sys.stderr)
            continue

        snapshots = accumulate_snapshots(result_v3.layers, repo.blank_canvas())
        failing_layer = None
        stage_mismatch = None
        for snapshot, layer in zip(snapshots, result_v3.layers):
            stage_diff = diff_images(snapshot, img_v2)
            count = mismatch_count(stage_diff)
            if count > tolerance:
                failing_layer = layer
                stage_mismatch = count
                break


        diff_image = Image.fromarray(np.clip(np.abs(diff), 0, 255).astype(np.uint8))
        img_v3.save(failure_dir / f"v3_{idx}.png")
        img_v2.save(failure_dir / f"v2_{idx}.png")
        diff_image.save(failure_dir / f"diff_{idx}.png")
        if failing_layer:
            failing_layer.image.save(failure_dir / f"layer_{failing_layer.id.value}_{idx}.png")

        print(json.dumps({
            "sample": idx,
            "mismatch_pixels": int(total_mismatch),
            "params": params,
            "failing_layer": {
                "id": failing_layer.id.value if failing_layer else None,
                "blend_mode": failing_layer.blend_mode if failing_layer else None,
                "diagnostics": failing_layer.diagnostics if failing_layer else None,
                "stage_mismatch": int(stage_mismatch) if stage_mismatch is not None else None,
            },
        }, indent=2))

        worker.terminate()
        return 1

    worker.terminate()
    print(json.dumps({"samples": max_samples, "mismatch_pixels": 0, "status": "ok"}))
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Run V2 vs V3 parity stress test")
    parser.add_argument("--samples", type=int, default=10000, help="maximum random samples to test")
    parser.add_argument("--tolerance", type=int, default=0, help="allowed per-channel mismatch count")
    args = parser.parse_args()

    sys.exit(run_parity(max_samples=args.samples, tolerance=args.tolerance))


if __name__ == "__main__":
    main()
