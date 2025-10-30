# Image Service

Lightweight FastAPI service that performs small image transformations for the
BeastyRabbit stack. Right now it focuses on generating 256&nbsp;px WebP
thumbnails for Catdex cards, but it is structured so additional endpoints can be
added for future needs.

## Local development

```bash
cd backend/img_service
uv pip install --editable .[dev]
uv run uvicorn img_service.app.main:app --reload --host 127.0.0.1 --port 8011
```

## Configuration

Environment variables are namespaced with `IMG_SERVICE_`:

| Variable | Default | Description |
| --- | --- | --- |
| `IMG_SERVICE_ALLOWED_ORIGINS` | `*` | Comma separated list of CORS origins. |
| `IMG_SERVICE_FETCH_TIMEOUT` | `10.0` | Timeout (seconds) for source image fetch. |
| `IMG_SERVICE_DEFAULT_MAX_DIMENSION` | `256` | Fallback maximum edge size for thumbnails. |

## Tests

```bash
uv run --directory backend/img_service pytest
```
