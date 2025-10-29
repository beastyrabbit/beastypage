#!/usr/bin/env python3
"""Upload catdex export data into Convex storage and tables.

This CLI expects an extracted export directory created by
`scripts/export_catdex_report.py`. It performs the following steps:

1. Index every referenced image inside the export folder and gather metadata
   such as width, height, size, and MIME type.
2. Request pre-signed Convex upload URLs and stream each asset directly into
   Convex storage while printing progress feedback.
3. Assemble the final payload (seasons, rarities, catdex cards, collection
   entries) with the newly issued storage ids.
4. Invoke the `importer:ingestBundle` mutation to seed the Convex database.

Usage:
    python scripts/import_catdex.py \
        --export-dir backend/catdex-export-20251022-142634 \
        --env-file frontend/.env.local

The script prompts for the Convex admin key if it is not passed via
`--admin-key`. The target Convex instance must have empty `catdex` and
`collection` tables; the mutation will abort otherwise.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import getpass
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

try:  # Optional dependency for image dimensions
  from PIL import Image  # type: ignore
except Exception:  # pragma: no cover - Pillow is optional at runtime
  Image = None


class ConvexRequestError(RuntimeError):
  def __init__(self, kind: str, fn: str, status: int, reason: str, detail: str):
    super().__init__(f"Convex {kind} {fn} failed: {status} {reason}\n{detail}")
    self.kind = kind
    self.fn = fn
    self.status = status
    self.reason = reason
    self.detail = detail


@dataclasses.dataclass
class Asset:
  key: str
  file_name: str
  path: Path
  category: str
  content_type: str
  size_bytes: int
  width: Optional[int]
  height: Optional[int]
  storage_id: Optional[str] = None


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Import catdex export bundle into Convex")
  parser.add_argument(
    "--export-dir",
    default="backend/catdex-export-20251022-142634",
    help="Path to the extracted export directory (contains data/ and images/)."
  )
  parser.add_argument(
    "--host",
    help="Base URL of the Convex backend (e.g. http://192.168.50.233:3210)."
  )
  parser.add_argument(
    "--admin-key",
    help="Convex admin key. If omitted you will be prompted securely."
  )
  parser.add_argument(
    "--env-file",
    default="frontend/.env.local",
    help="Path to a .env-style file providing Convex credentials (default: frontend/.env.local)."
  )
  parser.add_argument(
    "--batch-size",
    type=int,
    default=40,
    help="Number of assets to request per upload URL batch."
  )
  parser.add_argument(
    "--dry-run",
    action="store_true",
    help="Only print the actions without uploading or mutating Convex."
  )
  return parser.parse_args()


def load_env_file(path: Optional[Path]) -> Dict[str, str]:
  if not path:
    return {}
  path = path.resolve()
  if not path.exists() or not path.is_file():
    return {}
  env: Dict[str, str] = {}
  with path.open("r", encoding="utf-8") as fh:
    for raw_line in fh:
      line = raw_line.strip()
      if not line or line.startswith("#") or "=" not in line:
        continue
      key, value = line.split("=", 1)
      key = key.strip()
      val = value.strip().strip('"').strip("'")
      if key:
        env[key] = val
  return env


def ensure_host(url: Optional[str]) -> str:
  if not url:
    url = os.environ.get("CONVEX_SELF_HOSTED_URL") or os.environ.get("NEXT_PUBLIC_CONVEX_URL")
  if not url:
    url = input("Convex host (e.g. http://192.168.50.233:3210): ").strip()
  if not url:
    raise SystemExit("Convex host is required")
  parsed = urllib.parse.urlparse(url)
  if not parsed.scheme:
    raise SystemExit("Convex host must include http:// or https://")
  return url.rstrip("/")


def ensure_admin_key(key: Optional[str]) -> str:
  if not key:
    key = os.environ.get("CONVEX_SELF_HOSTED_ADMIN_KEY")
  if key:
    return key.strip()
  return getpass.getpass("Convex admin key: ").strip()


def load_payload(export_dir: Path) -> dict:
  payload_path = export_dir / "catdex-payload.json"
  if not payload_path.exists():
    raise SystemExit(f"Expected {payload_path} (run build-catdex-payload.mjs first)")
  with payload_path.open("r", encoding="utf-8") as fh:
    return json.load(fh)


def index_image_files(export_dir: Path) -> Tuple[Dict[str, Asset], Dict[str, str]]:
  images_root = export_dir / "images"
  if not images_root.exists():
    raise SystemExit(f"Images directory missing at {images_root}")

  assets: Dict[str, Asset] = {}
  name_to_key: Dict[str, str] = {}

  for category in ("catdex", "collection"):
    category_root = images_root / category
    if not category_root.exists():
      continue
    for file_path in category_root.rglob("*"):
      if not file_path.is_file() or file_path.suffix == ".attrs":
        continue
      file_name = file_path.name
      key = f"{category}:{file_name}"
      if file_name in name_to_key:
        raise SystemExit(f"Duplicate filename detected: {file_name}")
      content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
      size_bytes = file_path.stat().st_size
      width = height = None
      if Image is not None:
        try:
          with Image.open(file_path) as img:
            width, height = img.size
        except Exception:
          pass
      assets[key] = Asset(
        key=key,
        file_name=file_name,
        path=file_path,
        category=category,
        content_type=content_type,
        size_bytes=size_bytes,
        width=width,
        height=height
      )
      name_to_key[file_name] = key

  return assets, name_to_key


def parse_timestamp(value: Optional[str]) -> Optional[int]:
  if not value:
    return None
  val = value.strip()
  if not val:
    return None
  try:
    if val.endswith("Z"):
      val = val[:-1] + "+00:00"
    dt_obj = dt.datetime.fromisoformat(val)
  except ValueError:
    return None
  return int(dt_obj.timestamp() * 1000)


def convex_call(base_url: str, admin_key: str, kind: str, fn: str, args: dict) -> dict:
  if kind not in {"query", "mutation", "action"}:
    raise ValueError(f"Unsupported function type: {kind}")
  url = f"{base_url}/api/{kind}"
  body = {
    "path": fn,
    "format": "json",
    "args": [args],
  }
  data = json.dumps(body).encode("utf-8")
  req = urllib.request.Request(url, data=data, method="POST")
  req.add_header("Authorization", f"Convex {admin_key}")
  req.add_header("Content-Type", "application/json")
  try:
    with urllib.request.urlopen(req) as resp:
      body = resp.read().decode("utf-8")
      return json.loads(body)
  except urllib.error.HTTPError as exc:  # pragma: no cover - convenience for CLI feedback
    detail = exc.read().decode("utf-8", errors="ignore")
    raise ConvexRequestError(kind, fn, exc.code, exc.reason or "", detail)


def request_upload_urls(
  base_url: str,
  admin_key: str,
  batch: List[Asset]
) -> Dict[str, str]:
  args = {
    "assets": [
      {
        "key": asset.key,
        "contentType": asset.content_type
      }
      for asset in batch
    ]
  }
  try:
    response = convex_call(base_url, admin_key, "action", "importer.js:prepareUploadUrls", args)
  except ConvexRequestError as error:
    raise SystemExit(str(error)) from error
  uploads = response.get("value") if isinstance(response, dict) else response
  if not isinstance(uploads, list):
    raise SystemExit(f"Unexpected response from prepareUploadUrls: {uploads}")
  return {entry["key"]: entry["uploadUrl"] for entry in uploads}


def upload_file(upload_url: str, asset: Asset) -> str:
  with asset.path.open("rb") as fh:
    file_bytes = fh.read()

  req = urllib.request.Request(upload_url, data=file_bytes, method="POST")
  req.add_header("Content-Type", asset.content_type)
  req.add_header("Content-Length", str(len(file_bytes)))

  try:
    with urllib.request.urlopen(req) as resp:
      response_body = resp.read().decode("utf-8")
      parsed = json.loads(response_body)
      storage_id = parsed.get("storageId")
      if not storage_id:
        raise RuntimeError("Upload response missing storageId")
      return storage_id
  except urllib.error.HTTPError as exc:
    detail = exc.read().decode("utf-8", errors="ignore")
    raise RuntimeError(f"Upload failed for {asset.file_name}: {exc.code} {exc.reason}\n{detail}")


def ensure_tables_empty(base_url: str, admin_key: str) -> None:
  try:
    cat_resp = convex_call(base_url, admin_key, "query", "catdex.js:totalCount", {})
    col_resp = convex_call(base_url, admin_key, "query", "collection.js:totalCount", {})
    cat_count = cat_resp.get("value", 0) if isinstance(cat_resp, dict) else cat_resp
    col_count = col_resp.get("value", 0) if isinstance(col_resp, dict) else col_resp
  except ConvexRequestError as error:
    if error.status == 400:
      print(
        "Warning: could not verify existing catdex/collection entries (missing totalCount query). "
        "Proceeding anyway; the importer mutation will abort if rows already exist."
      )
      return
    raise SystemExit(str(error)) from error

  if (cat_count or col_count):
    raise SystemExit(
      "Convex catdex/collection tables are not empty. Clear them before running the importer."
    )


def gather_required_assets(
  payload: dict,
  name_to_key: Dict[str, str],
  assets: Dict[str, Asset]
) -> set[str]:
  required: set[str] = set()

  def resolve(file_name: Optional[str], *, required_asset: bool = False) -> Optional[Asset]:
    if not file_name:
      return None
    key = name_to_key.get(file_name)
    if not key:
      if required_asset:
        raise SystemExit(f"Missing file in export images directory: {file_name}")
      print(f"Warning: optional asset '{file_name}' not found; skipping")
      return None
    required.add(file_name)
    return assets[key]

  for season in payload.get("seasons", []):
    resolve(season.get("cardBack"))

  for record in payload.get("catdexRecords", []):
    resolve(record.get("defaultCard"), required_asset=True)
    resolve(record.get("defaultCardThumb"))
    resolve(record.get("customCard"))
    resolve(record.get("customCardThumb"))

  for record in payload.get("collectionRecords", []):
    resolve(record.get("blurImage"))
    resolve(record.get("previewImage"))
    resolve(record.get("fullImage"))

  return required


def build_bundle(
  payload: dict,
  assets: Dict[str, Asset],
  name_to_key: Dict[str, str]
) -> dict:
  def image_for(name: Optional[str], *, required: bool = False) -> Optional[dict]:
    if not name:
      return None
    key = name_to_key.get(name)
    if not key:
      if required:
        raise SystemExit(f"No storage id for image {name}")
      return None
    asset = assets[key]
    if not asset.storage_id:
      raise SystemExit(f"Asset {name} has not been uploaded yet")
    return {
      "fileName": asset.file_name,
      "storageId": asset.storage_id,
      **({"width": asset.width} if asset.width is not None else {}),
      **({"height": asset.height} if asset.height is not None else {})
    }

  seasons = []
  season_lookup: Dict[str, dict] = {}
  for season in payload.get("seasons", []):
    name = (season.get("seasonName") or season.get("season_name") or "").strip()
    if not name:
      raise SystemExit("Encountered season entry without a name")
    season_entry_out = {
      "name": name,
      "shortName": season.get("shortName") or season.get("short_name")
    }
    card_back = image_for(season.get("cardBack") or season.get("card_back"), required=False)
    if card_back:
      season_entry_out["cardBack"] = card_back
    seasons.append(season_entry_out)
    season_lookup[str(season.get("id", name))] = season
    season_lookup[name] = season

  rarities = []
  rarity_lookup: Dict[str, dict] = {}
  for rarity in payload.get("rarities", []):
    name = (rarity.get("name") or rarity.get("rarity_name") or "").strip()
    if not name:
      raise SystemExit("Encountered rarity entry without a name")
    rarity_entry_out = {
      "name": name
    }
    if rarity.get("stars") is not None:
      rarity_entry_out["stars"] = rarity.get("stars")
    chance_val = rarity.get("chancePercent") or rarity.get("chance_percent")
    if chance_val is not None:
      rarity_entry_out["chancePercent"] = chance_val
    rarities.append(rarity_entry_out)
    rarity_lookup[str(rarity.get("id", name))] = rarity
    rarity_lookup[name] = rarity

  catdex = []
  for record in payload.get("catdexRecords", []):
    default_card = image_for(record.get("defaultCard") or record.get("default_card"), required=True)
    if default_card is None:
      raise SystemExit(f"Cat record {record.get('id')} missing default card image")
    season_id = str(record.get("seasonId") or record.get("season") or "").strip()
    season_entry = season_lookup.get(season_id) if season_id else None
    season_name = ""
    if season_entry:
      season_name = (season_entry.get("seasonName") or season_entry.get("season_name") or "").strip()
    elif season_id:
      season_name = season_id
    rarity_id = str(record.get("rarityId") or record.get("rarity") or "").strip()
    rarity_entry = rarity_lookup.get(rarity_id) if rarity_id else None
    rarity_name = ""
    if rarity_entry:
      rarity_name = (rarity_entry.get("name") or rarity_entry.get("rarity_name") or "").strip()
    elif rarity_id:
      rarity_name = rarity_id
    if not season_name:
      raise SystemExit(f"Cat record {record.get('id')} is missing a season reference")
    if not rarity_name:
      raise SystemExit(f"Cat record {record.get('id')} is missing a rarity reference")

    cat_entry = {
      "legacyId": record.get("id", ""),
      "twitchUserName": record.get("twitchUserName") or record.get("twitch_user_name") or "unknown",
      "catName": record.get("catName") or record.get("cat_name") or "Unnamed",
      "seasonName": season_name,
      "rarityName": rarity_name,
      "cardNumber": record.get("cardNumber") or record.get("card_number"),
      "approved": bool(record.get("approved", False)),
      "createdAt": parse_timestamp(record.get("created")),
      "updatedAt": parse_timestamp(record.get("updated")),
      "defaultCard": default_card
    }
    default_thumb = image_for(record.get("defaultCardThumb") or record.get("default_card_thumb"), required=False)
    if default_thumb:
      cat_entry["defaultCardThumb"] = default_thumb
    custom_card = image_for(record.get("customCard") or record.get("custom_card"), required=False)
    if custom_card:
      cat_entry["customCard"] = custom_card
    custom_thumb = image_for(record.get("customCardThumb") or record.get("custom_card_thumb"), required=False)
    if custom_thumb:
      cat_entry["customCardThumb"] = custom_thumb
    catdex.append(cat_entry)

  collection = []
  for record in payload.get("collectionRecords", []):
    collection_entry = {
      "legacyId": record.get("id", ""),
      "artistName": record.get("artistName") or record.get("artist_name") or "",
      "animal": record.get("animal") or "",
      "link": record.get("link"),
      "createdAt": parse_timestamp(record.get("created")),
      "updatedAt": parse_timestamp(record.get("updated"))
    }
    blur_image = image_for(record.get("blurImage") or record.get("blur_img"), required=False)
    if blur_image:
      collection_entry["blurImage"] = blur_image
    preview_image = image_for(record.get("previewImage") or record.get("preview_img"), required=False)
    if preview_image:
      collection_entry["previewImage"] = preview_image
    full_image = image_for(record.get("fullImage") or record.get("full_img"), required=False)
    if full_image:
      collection_entry["fullImage"] = full_image
    collection.append(collection_entry)

  return {
    "seasons": seasons,
    "rarities": rarities,
    "catdex": catdex,
    "collection": collection
  }


def main() -> None:
  args = parse_args()
  export_dir = Path(args.export_dir).resolve()
  if not export_dir.exists():
    raise SystemExit(f"Export directory not found: {export_dir}")

  env_values = load_env_file(Path(args.env_file) if args.env_file else None)
  for key, value in env_values.items():
    os.environ.setdefault(key, value)

  base_url = ensure_host(args.host)
  admin_key = ensure_admin_key(args.admin_key)

  payload = load_payload(export_dir)
  assets, name_to_key = index_image_files(export_dir)
  required_names = gather_required_assets(payload, name_to_key, assets)

  if not args.dry_run:
    ensure_tables_empty(base_url, admin_key)

  total_assets = len(required_names)
  if total_assets == 0:
    raise SystemExit("No image assets discovered inside the export directory.")

  print(f"Uploading {total_assets} assets to Convex storage…")
  remaining_assets = [assets[name_to_key[name]] for name in sorted(required_names)]

  uploaded = 0
  for chunk_start in range(0, len(remaining_assets), args.batch_size):
    batch = remaining_assets[chunk_start:chunk_start + args.batch_size]
    upload_urls = request_upload_urls(base_url, admin_key, batch) if not args.dry_run else {}
    for asset in batch:
      if args.dry_run:
        uploaded += 1
        continue
      upload_url = upload_urls.get(asset.key)
      if not upload_url:
        raise SystemExit(f"Missing upload URL for asset {asset.file_name}")
      parsed_upload = urllib.parse.urlparse(upload_url)
      parsed_base = urllib.parse.urlparse(base_url)
      if parsed_upload.hostname in {"127.0.0.1", "localhost"}:
        replacement_netloc = parsed_base.netloc
        upload_url = urllib.parse.urlunparse(
          parsed_upload._replace(scheme=parsed_base.scheme, netloc=replacement_netloc)
        )
      print(f"Uploading via {upload_url}", flush=True)
      asset.storage_id = upload_file(upload_url, asset)
      uploaded += 1
      percent = uploaded / total_assets * 100
      print(f"  · {uploaded}/{total_assets} ({percent:5.1f}%) {asset.file_name}")

  if args.dry_run:
    print("Dry run complete — skipping Convex mutation.")
    return

  bundle = build_bundle(payload, assets, name_to_key)
  print("Seeding Convex via importer:ingestBundle …")
  try:
    result = convex_call(base_url, admin_key, "mutation", "importer.js:ingestBundle", {"bundle": bundle})
  except ConvexRequestError as error:
    raise SystemExit(str(error)) from error
  print("Import complete:")
  print(json.dumps(result, indent=2))


if __name__ == "__main__":
  try:
    main()
  except KeyboardInterrupt:
    print("Aborted", file=sys.stderr)
    sys.exit(1)
