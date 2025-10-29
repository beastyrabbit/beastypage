#!/usr/bin/env python3
"""
Upload collection images and metadata into PocketBase.

- Reads mapping JSON with fields: animal, artist, link, image (filename)
- Uploads to a PocketBase Base collection with fields:
    artist_name (text), animal (text), link (url)
    blur_img_load (file), preview_img (file), full_img (file)

Dev defaults (override with args/env):
  BASE_URL: http://192.168.50.206:8000
  COLLECTION: collection
  JSON: frontend/assets/images/collection/collection_mapping.json
  IMAGES_DIR: frontend/assets/images/collection/marked

Auth: Use a regular user (recommended) or admin.
  export PB_EMAIL=image_python@beastyrabbit.de
  export PB_PASSWORD=<secret>

Usage examples:
  python backend/scripts/upload_collection_to_pb.py \
    --base-url http://192.168.50.206:8000 \
    --collection collection \
    --json frontend/assets/images/collection/collection_mapping.json \
    --images-dir frontend/assets/images/collection/marked \
    --generate-previews

Notes:
- For safety, do not pass the password on the command line; use env PB_PASSWORD.
- If Pillow is unavailable, the script will skip generating preview/blur and reuse the full image.
- Re-running will create duplicate records unless you use --skip-existing and your PB rules allow filter lookups.
"""

from __future__ import annotations

import argparse
import io
import json
import mimetypes
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Tuple

import requests

try:
    from PIL import Image, ImageFilter
    PIL_AVAILABLE = True
except Exception:
    PIL_AVAILABLE = False

DEFAULT_BASE_URL = os.environ.get("PB_BASE_URL", "http://192.168.50.206:8000")
DEFAULT_COLLECTION = os.environ.get("PB_COLLECTION", "collection")
DEFAULT_JSON = os.environ.get("PB_JSON", "frontend/assets/images/collection/collection_mapping.json")
DEFAULT_IMAGES_DIR = os.environ.get("PB_IMAGES_DIR", "frontend/assets/images/collection/marked")

EMAIL = os.environ.get("PB_EMAIL")  # image_python@beastyrabbit.de
PASSWORD = os.environ.get("PB_PASSWORD")

SESSION = requests.Session()


def auth(base_url: str, email: str, password: str) -> Tuple[str, Dict[str, Any]]:
    """Authenticate with PocketBase (user first, fallback to admin). Returns (token, auth_data)."""
    base_url = base_url.rstrip("/")

    # Try user auth (most secure/common)
    user_auth_url = f"{base_url}/api/collections/users/auth-with-password"
    resp = SESSION.post(user_auth_url, json={"identity": email, "password": password})
    if resp.ok:
        data = resp.json()
        return data.get("token", ""), data

    # Fallback to admin auth
    admin_auth_url = f"{base_url}/api/admins/auth-with-password"
    resp = SESSION.post(admin_auth_url, json={"identity": email, "password": password})
    if resp.ok:
        data = resp.json()
        return data.get("token", ""), data

    raise SystemExit(f"Auth failed: {resp.status_code} {resp.text}")


def ensure_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    return mime or "application/octet-stream"


def make_preview_and_blur(full_path: Path, generate_previews: bool) -> Tuple[Path, Path]:
    """Return (preview_path, blur_path). May create temp files in memory if PIL present.
    If generation disabled/unavailable, returns the original file twice."""
    if not generate_previews or not PIL_AVAILABLE:
        return full_path, full_path

    try:
        with Image.open(full_path) as im:
            im = im.convert("RGBA") if im.mode in ("LA", "P") else im.convert("RGB")
            # Preview: max dimension ~1280px
            preview = im.copy()
            preview.thumbnail((1280, 1280), Image.LANCZOS)
            # Blur: tiny (e.g., width~32) + strong blur
            blur = im.copy()
            blur.thumbnail((48, 48), Image.LANCZOS)
            blur = blur.filter(ImageFilter.GaussianBlur(radius=2.5))

            # Save both to BytesIO and return special pseudo-Path wrappers
            preview_io = io.BytesIO()
            blur_io = io.BytesIO()

            # Heuristic: use PNG if alpha present
            has_alpha = im.mode == "RGBA"
            if has_alpha:
                preview.save(preview_io, format="PNG", optimize=True)
                blur.save(blur_io, format="PNG", optimize=True)
                preview_name = full_path.stem + "__preview.png"
                blur_name = full_path.stem + "__blur.png"
            else:
                preview.save(preview_io, format="JPEG", quality=85, optimize=True)
                blur.save(blur_io, format="JPEG", quality=60, optimize=True)
                preview_name = full_path.stem + "__preview.jpg"
                blur_name = full_path.stem + "__blur.jpg"

            # Create ad-hoc Path-like objects storing name and bytes
            class MemFile(Path):
                _flavour = type(Path())._flavour
                def __new__(cls, name: str, payload: bytes):
                    obj = super().__new__(cls, name)
                    obj._payload = payload
                    return obj

            preview_path = MemFile(preview_name, preview_io.getvalue())
            blur_path = MemFile(blur_name, blur_io.getvalue())
            return preview_path, blur_path

    except Exception as e:
        print(f"[WARN] Failed to generate preview/blur for {full_path.name}: {e}")
        return full_path, full_path


def open_for_requests(p: Path) -> Tuple[str, Any, str]:
    """Return a (filename, fileobj, mime) tuple for requests' files=... Supports MemFile."""
    mime = ensure_mime(p)
    if hasattr(p, "_payload"):
        # in-memory file
        return (p.name, io.BytesIO(getattr(p, "_payload")), mime)
    return (p.name, open(p, "rb"), mime)


def record_exists(base_url: str, collection: str, animal: str, artist_name: str, token: str) -> Optional[Dict[str, Any]]:
    """Best-effort check to avoid duplicates by animal+artist."""
    base_url = base_url.rstrip("/")
    flt = f"animal='{animal.replace("'", "\\'")}' && artist_name='{artist_name.replace("'", "\\'")}'"
    url = f"{base_url}/api/collections/{collection}/records?filter={requests.utils.quote(flt)}&perPage=1"
    headers = {"Authorization": f"Bearer {token}"}
    r = SESSION.get(url, headers=headers)
    if not r.ok:
        return None
    data = r.json() or {}
    items = data.get("items") or []
    return items[0] if items else None


def upload_record(base_url: str, collection: str, token: str, item: Dict[str, Any], images_dir: Path, generate_previews: bool, skip_existing: bool) -> Optional[str]:
    base_url = base_url.rstrip("/")

    animal = item.get("animal", "").strip()
    artist = item.get("artist") or item.get("artist_name") or ""
    link = item.get("link", "")
    image_name = item.get("image")

    if not image_name:
        print("[SKIP] Missing 'image' for", item)
        return None

    full_path = images_dir / image_name
    if not full_path.exists():
        # also try URL-escaped and space-normalized variants
        alt = images_dir / image_name.replace("%20", " ")
        if alt.exists():
            full_path = alt
        else:
            print(f"[MISS] File not found: {full_path}")
            return None

    if skip_existing:
        existing = record_exists(base_url, collection, animal, artist, token)
        if existing:
            print(f"[SKIP] Exists: {animal} — {artist} (id={existing.get('id')})")
            return existing.get("id")

    preview_path, blur_path = make_preview_and_blur(full_path, generate_previews)

    url = f"{base_url}/api/collections/{collection}/records"
    headers = {"Authorization": f"Bearer {token}"}

    data = {
        "artist_name": artist,
        "animal": animal,
        "link": link,
    }
    files = {
        "full_img": open_for_requests(full_path),
        "preview_img": open_for_requests(preview_path),
        "blur_img_load": open_for_requests(blur_path),
    }

    # Ensure opened files are closed
    closers = []
    for k, v in files.items():
        if hasattr(v[1], "close"):
            closers.append(v[1])

    try:
        resp = SESSION.post(url, headers=headers, data=data, files=files)
        if not resp.ok:
            print(f"[FAIL] {animal} — {artist}: {resp.status_code} {resp.text[:200]}...")
            return None
        rec = resp.json()
        print(f"[OK]   {animal} — {artist} (id={rec.get('id')})")
        return rec.get("id")
    finally:
        for c in closers:
            try:
                c.close()
            except Exception:
                pass


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Upload collection images to PocketBase")
    parser.add_argument('--base-url', default=DEFAULT_BASE_URL)
    parser.add_argument('--collection', default=DEFAULT_COLLECTION)
    parser.add_argument('--json', dest='json_path', default=DEFAULT_JSON)
    parser.add_argument('--images-dir', default=DEFAULT_IMAGES_DIR)
    parser.add_argument('--generate-previews', action='store_true', help='Generate preview and blur images with Pillow')
    parser.add_argument('--skip-existing', action='store_true', help='Skip if animal+artist exists')
    parser.add_argument('--limit', type=int, default=0, help='Only upload first N entries')

    args = parser.parse_args(argv)

    email = EMAIL or os.environ.get('PB_EMAIL')
    password = PASSWORD or os.environ.get('PB_PASSWORD')
    token = None
    if email and password:
        token, _ = auth(args.base_url, email, password)
    else:
        print("[INFO] No PB credentials provided; attempting unauthenticated uploads.")

    json_path = Path(args.json_path)
    images_dir = Path(args.images_dir)
    if not json_path.exists():
        print(f"ERROR: JSON not found: {json_path}")
        return 2
    if not images_dir.exists():
        print(f"ERROR: images dir not found: {images_dir}")
        return 2

    data = json.loads(json_path.read_text(encoding='utf-8'))
    if not isinstance(data, list):
        print("ERROR: JSON root must be a list")
        return 2

    total = len(data)
    print(f"Loaded {total} entries from {json_path}")

    count = 0
    for i, item in enumerate(data, 1):
        if args.limit and count >= args.limit:
            break
        rec_id = upload_record(
            base_url=args.base_url,
            collection=args.collection,
            token=token,
            item=item,
            images_dir=images_dir,
            generate_previews=args.generate_previews,
            skip_existing=args.skip_existing,
        )
        if rec_id:
            count += 1

    print(f"Done. Uploaded {count} records.")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())