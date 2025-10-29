from __future__ import annotations

import numpy as np
from typing import Sequence

from PIL import Image, ImageChops


def ensure_rgba(image: Image.Image) -> Image.Image:
    if image.mode != "RGBA":
        return image.convert("RGBA")
    return image


def multiply(base: Image.Image, overlay: Image.Image) -> Image.Image:
    base_arr = np.asarray(ensure_rgba(base), dtype=np.float32) / 255.0
    overlay_arr = np.asarray(ensure_rgba(overlay), dtype=np.float32) / 255.0

    base_rgb = base_arr[..., :3]
    base_alpha = base_arr[..., 3:4]
    overlay_rgb = overlay_arr[..., :3]
    overlay_alpha = overlay_arr[..., 3:4]

    multiplied_rgb = base_rgb * overlay_rgb
    result_rgb = overlay_alpha * multiplied_rgb + (1.0 - overlay_alpha) * base_rgb

    result_alpha = base_alpha
    result_rgb = np.where(result_alpha > 0, result_rgb, 0.0)

    result = np.concatenate([result_rgb, result_alpha], axis=-1)
    result = np.clip(np.rint(result * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(result, mode="RGBA")


def add(base: Image.Image, overlay: Image.Image) -> Image.Image:
    base = ensure_rgba(base)
    overlay = ensure_rgba(overlay)
    return ImageChops.add(base, overlay, scale=1.0, offset=0)


def screen(base: Image.Image, overlay: Image.Image) -> Image.Image:
    base = ensure_rgba(base)
    overlay = ensure_rgba(overlay)

    base_arr = np.asarray(base, dtype=np.float32) / 255.0
    overlay_arr = np.asarray(overlay, dtype=np.float32) / 255.0
    rgb = 1.0 - (1.0 - base_arr[..., :3]) * (1.0 - overlay_arr[..., :3])
    alpha = np.clip(base_arr[..., 3:] + overlay_arr[..., 3:] - base_arr[..., 3:] * overlay_arr[..., 3:], 0.0, 1.0)
    result = np.concatenate([rgb, alpha], axis=-1)
    result = np.clip(np.rint(result * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(result, mode="RGBA")


def alpha_over(base: Image.Image, overlay: Image.Image) -> Image.Image:
    base_arr = np.asarray(ensure_rgba(base), dtype=np.float32) / 255.0
    overlay_arr = np.asarray(ensure_rgba(overlay), dtype=np.float32) / 255.0

    alpha_base = base_arr[..., 3:]
    alpha_overlay = overlay_arr[..., 3:]
    inverse_overlay = 1.0 - alpha_overlay
    alpha_out = alpha_overlay + alpha_base * inverse_overlay

    numerator = overlay_arr[..., :3] * alpha_overlay + base_arr[..., :3] * alpha_base * inverse_overlay
    safe_alpha = np.where(alpha_out > 0, alpha_out, 1.0)
    rgb_out = numerator / safe_alpha
    rgb_out = np.where(alpha_out > 0, rgb_out, 0.0)

    out = np.concatenate([rgb_out, alpha_out], axis=-1)
    out_uint8 = np.clip(np.round(out * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out_uint8, mode="RGBA")


def apply_mask(image: Image.Image, mask: Image.Image) -> Image.Image:
    base = np.asarray(ensure_rgba(image), dtype=np.uint16)
    mask_alpha = np.asarray(ensure_rgba(mask).split()[3], dtype=np.uint16)
    # scale RGB by mask alpha to avoid residual colour
    mask_factor = mask_alpha.astype(np.float32) / 255.0
    image_alpha = base[..., 3].astype(np.uint16)
    new_alpha = (image_alpha * mask_alpha) // 255
    base[..., 3] = new_alpha
    # Clear RGB where alpha is zero to avoid residual colour bleed
    zero_mask = new_alpha == 0
    base[zero_mask, :3] = 0
    return Image.fromarray(base.astype(np.uint8), mode="RGBA")


def erase_with_mask(image: Image.Image, mask: Image.Image) -> Image.Image:
    """Remove pixels from image wherever mask alpha is > 0 (destination-out equivalent)."""
    base = np.asarray(ensure_rgba(image), dtype=np.float32)
    mask_alpha = np.asarray(ensure_rgba(mask).split()[3], dtype=np.float32) / 255.0
    if np.all(mask_alpha == 0):
        return image
    keep = 1.0 - mask_alpha
    base[..., :3] *= keep[..., None]
    base[..., 3] *= keep
    base = np.clip(np.rint(base), 0, 255).astype(np.uint8)
    base = np.where(base[..., 3:] == 0, 0, base)
    return Image.fromarray(base, mode="RGBA")


def fill_with_colour(size: tuple[int, int], colour: tuple[int, int, int, int], alpha_source: Image.Image | None = None) -> Image.Image:
    r, g, b, a = colour
    overlay = Image.new("RGBA", size, (r, g, b, 255))
    if alpha_source is not None:
        alpha_arr = np.asarray(ensure_rgba(alpha_source).split()[3], dtype=np.float32) / 255.0
        if a < 255:
            alpha_arr = alpha_arr * (a / 255.0)
        overlay_alpha = np.clip(np.rint(alpha_arr * 255.0), 0, 255).astype(np.uint8)
        overlay.putalpha(Image.fromarray(overlay_alpha, mode="L"))
    else:
        overlay.putalpha(int(a))
    return overlay


def overlay(base: Image.Image, overlay: Image.Image) -> Image.Image:
    base = ensure_rgba(base)
    overlay = ensure_rgba(overlay)

    base_arr = np.asarray(base, dtype=np.float32) / 255.0
    overlay_arr = np.asarray(overlay, dtype=np.float32) / 255.0

    base_rgb = base_arr[..., :3]
    base_alpha = base_arr[..., 3:4]
    overlay_rgb = overlay_arr[..., :3]
    overlay_alpha = overlay_arr[..., 3:4]

    blended_rgb = np.where(
        base_rgb <= 0.5,
        2.0 * base_rgb * overlay_rgb,
        1.0 - 2.0 * (1.0 - base_rgb) * (1.0 - overlay_rgb),
    )

    result_rgb = overlay_alpha * blended_rgb + (1.0 - overlay_alpha) * base_rgb
    result = np.concatenate([result_rgb, base_alpha], axis=-1)
    result = np.clip(np.rint(result * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(result, mode="RGBA")


def apply_missing_scar(canvas: Image.Image, mask: Image.Image) -> Image.Image:
    base = np.asarray(ensure_rgba(canvas), dtype=np.float32) / 255.0
    scar = np.asarray(ensure_rgba(mask), dtype=np.float32) / 255.0

    mask_alpha = scar[..., 3]

    # destination-in clip (keep only pixels where mask alpha > 0)
    base[..., :3] *= mask_alpha[..., None]
    base[..., 3] *= mask_alpha

    # source-in clip for overlay (mask colours limited by current alpha)
    overlay_rgb = scar[..., :3] * base[..., 3][..., None]

    # multiply blended overlay
    base[..., :3] *= overlay_rgb

    result = np.clip(np.rint(base * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(result, mode="RGBA")


def tint_image(image: Image.Image, colour: Sequence[int], mode: str = "multiply") -> Image.Image:
    arr = np.asarray(ensure_rgba(image), dtype=np.float32) / 255.0
    rgb = arr[..., :3]
    alpha = arr[..., 3:]
    tint = np.array([colour[0], colour[1], colour[2]], dtype=np.float32) / 255.0

    if mode == "multiply":
        tinted_rgb = rgb * tint
    elif mode == "add":
        tinted_rgb = np.clip(rgb + tint, 0.0, 1.0)
    else:
        raise ValueError(f"Unsupported tint mode: {mode}")

    result = np.concatenate([tinted_rgb, alpha], axis=-1)
    arr = np.clip(np.rint(result * 255.0), 0, 255).astype(np.uint8)
    arr = np.where(arr[..., 3:] == 0, 0, arr)
    return Image.fromarray(arr, mode="RGBA")


def sanitize_transparency(image: Image.Image) -> Image.Image:
    arr = np.array(ensure_rgba(image), dtype=np.uint8, copy=True)
    mask = arr[..., 3] == 0
    if not np.any(mask):
        return image
    arr[mask, :3] = 0
    return Image.fromarray(arr, mode="RGBA")
