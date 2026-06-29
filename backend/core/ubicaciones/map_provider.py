"""Static map provider — OSM tiles / Google Static Maps + cache de screenshots.

Reemplazo del Playwright/Chromium persistente. Sin proceso de browser.

Puntos parcheables por tests (resueltos vía ``_patch.patch_module()`` para que
``monkeypatch.setattr(backend.handlers.ubicaciones, "_http_get", ...)`` y
``...ThreadPoolExecutor`` sigan atrapando tras el split):
- ``_http_get`` (usado en ``_fetch_osm_tile`` y ``_fetch_google_static_map``)
- ``ThreadPoolExecutor`` (usado en ``_fetch_osm_tiles_map``)
"""
from __future__ import annotations

import logging
import math
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
from io import BytesIO
from typing import Any, cast

from PIL import Image

from backend.core.ubicaciones._patch import patch_module
from backend.core.ubicaciones.layout import (
    _map_cache_key,
    _map_capture_size,
)

logger = logging.getLogger(__name__)

# ── Static map provider ──────────────────────────────────────────────────────
# Two selectable backends, chosen at processing time:
#   - "osm":    OpenStreetMap tiles (free, no API key). Default.
#   - "google": Google Static Maps API (requires ANTARES_GOOGLE_MAPS_KEY).
# Selection order: per-call payload ("provider") > env ANTARES_MAP_PROVIDER > "osm".
# The Google key is read from payload ("google_maps_key") > env ANTARES_GOOGLE_MAPS_KEY.
_MAP_ZOOM = 18
_MAP_PROVIDER_DEFAULT = "osm"
# Cap the static-map fetch on its long side so OSM tile counts stay bounded and
# Google's size limit is respected. The composition upsamples to full A4 with
# LANCZOS, so the map stays sharp enough under the dimming overlay + pin.
_MAP_FETCH_MAX_DIM = 1024
_OSM_TILE_SIZE = 256
_OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
_OSM_TILE_FETCH_WORKERS = 8  # perf-03: bounded per OSM reasonable-use policy
_GOOGLE_STATIC_URL = "https://maps.googleapis.com/maps/api/staticmap"
_HTTP_USER_AGENT = "ANTARES/0.10 (ubicaciones static map; +https://github.com/sechgio/antares)"
_HTTP_TIMEOUT = 12

# ── Map screenshot cache ─────────────────────────────────────────────────────
# ponytail: dict LRU manual + lock propio (desacoplado de la cache de composed
# preview en cache.py). El original usaba un único _cache_lock compartido; dos
# locks independientes preservan el comportamiento porque cada cache se protege
# por separado y el prefetch (que lee sin lock) se mantiene igual. Upgrade path:
# cachetools.LRUCache con lock por instancia.
_map_screenshot_cache: dict[tuple[Any, ...], bytes] = {}
_cache_lock = threading.Lock()
_MAX_MAP_CACHE = 40


def _trim_cache(cache: dict, max_size: int) -> None:
    while len(cache) > max_size:
        del cache[next(iter(cache))]


def _screenshot_has_map_tiles(screenshot_bytes: bytes) -> bool:
    """Rechaza capturas con cuadrícula gris sin calles cargadas."""
    img = Image.open(BytesIO(screenshot_bytes)).convert("RGB")
    w, h = img.size
    light_gray = 0
    chroma = 0
    samples = 24
    for i in range(samples):
        x = max(0, min(w - 1, (w * (i + 1)) // (samples + 1)))
        y = max(0, min(h - 1, (h * (i + 1)) // (samples + 1)))
        r, g, b = cast(tuple[int, int, int], img.getpixel((x, y)))
        spread = max(r, g, b) - min(r, g, b)
        lum = r + g + b
        if spread < 14 and lum > 620:
            light_gray += 1
        if spread > 18 and 180 < lum < 650:
            chroma += 1
    return light_gray < samples * 0.55 and chroma >= 2


def _is_gutter_pixel(r: int, g: int, b: int) -> bool:
    """Detecta píxeles de relleno gris de Google Maps (no tiles)."""
    spread = max(r, g, b) - min(r, g, b)
    return r > 225 and g > 232 and b > 228 and spread < 40


def _column_is_gutter(img: Image.Image, x: int) -> bool:
    _w, h = img.size
    step = max(1, h // 80)
    return all(_is_gutter_pixel(*cast(tuple[int, int, int], img.getpixel((x, y)))) for y in range(0, h, step))


def _row_is_gutter(img: Image.Image, y: int) -> bool:
    w, _h = img.size
    step = max(1, w // 80)
    return all(_is_gutter_pixel(*cast(tuple[int, int, int], img.getpixel((x, y)))) for x in range(0, w, step))


def _trim_map_gutters(img: Image.Image) -> Image.Image:
    """Recorta bandas grises uniformes en los bordes del canvas capturado."""
    w, h = img.size
    left = 0
    while left < w - 20 and _column_is_gutter(img, left):
        left += 1
    right = w - 1
    while right > left + 20 and _column_is_gutter(img, right):
        right -= 1
    top = 0
    while top < h - 20 and _row_is_gutter(img, top):
        top += 1
    bottom = h - 1
    while bottom > top + 20 and _row_is_gutter(img, bottom):
        bottom -= 1
    return img.crop((left, top, right + 1, bottom + 1))


def _center_crop_to_aspect(img: Image.Image, width: int, height: int) -> Image.Image:
    """Recorte centrado al aspect ratio objetivo (centro geográfico del mapa)."""
    target_aspect = width / height
    w, h = img.size
    src_aspect = w / h
    if src_aspect > target_aspect:
        new_w = max(1, int(h * target_aspect))
        left = (w - new_w) // 2
        return img.crop((left, 0, left + new_w, h))
    if src_aspect < target_aspect:
        new_h = max(1, int(w / target_aspect))
        top = (h - new_h) // 2
        return img.crop((0, top, w, top + new_h))
    return img


def _normalize_map_screenshot(screenshot_bytes: bytes, width: int, height: int) -> bytes:
    """Canvas → recorte de márgenes + escala exacta. Usado en preview y export PDF."""
    img = Image.open(BytesIO(screenshot_bytes)).convert("RGB")
    if img.size != (width, height):
        img = _center_crop_to_aspect(img, width, height)
    img = _trim_map_gutters(img)
    if img.size != (width, height):
        img = img.resize((width, height), Image.Resampling.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _resolve_provider(map_opts: dict[str, Any] | None) -> str:
    """Per-call payload > env > default. Lets the user choose the backend at processing time."""
    if map_opts and map_opts.get("provider"):
        return str(map_opts["provider"]).lower()
    return os.environ.get("ANTARES_MAP_PROVIDER", _MAP_PROVIDER_DEFAULT).lower()


def _resolve_google_key(map_opts: dict[str, Any] | None) -> str | None:
    if map_opts and map_opts.get("google_maps_key"):
        return str(map_opts["google_maps_key"])
    return os.environ.get("ANTARES_GOOGLE_MAPS_KEY") or None


def _cap_fetch_size(width: int, height: int) -> tuple[int, int]:
    """Scale (width, height) down so the long side <= _MAP_FETCH_MAX_DIM, preserving aspect."""
    longest = max(width, height)
    if longest <= _MAP_FETCH_MAX_DIM:
        return max(1, width), max(1, height)
    scale = _MAP_FETCH_MAX_DIM / longest
    return max(1, round(width * scale)), max(1, round(height * scale))


def _http_get(url: str, headers: dict[str, str], timeout: int = _HTTP_TIMEOUT) -> bytes | None:
    """HTTP GET returning body bytes, or None on any network/HTTP error."""
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # trusted map endpoints
            return cast(bytes, resp.read())
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        logger.debug("HTTP GET failed for %s: %s", url, exc)
        return None


def _fallback_map_bytes(width: int, height: int) -> bytes:
    """Gray placeholder so composition still renders text + pin when the map fetch fails."""
    img = Image.new("RGB", (max(1, width), max(1, height)), (215, 215, 215))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _lonlat_to_webmercator_pixel(lon: float, lat: float, zoom: int) -> tuple[float, float]:
    """Web Mercator pixel (x, y) in the global tile pixel space at ``zoom``."""
    n = 2 ** zoom
    x = (lon + 180.0) / 360.0 * n * _OSM_TILE_SIZE
    lat_rad = math.radians(lat)
    y = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n * _OSM_TILE_SIZE
    return x, y


def _fetch_osm_tile(job: tuple[int, int, str]) -> tuple[int, int, bytes | None]:
    """perf-03: per-tile fetch worker for the parallel pool.

    Resuelve ``_http_get`` vía el shim para que los monkeypatch de tests atrapen.
    """
    tx, ty, url = job
    ub = patch_module()
    return tx, ty, ub._http_get(url, {"User-Agent": _HTTP_USER_AGENT})


def _fetch_osm_tiles_map(lat: float, lon: float, width: int, height: int, zoom: int) -> Image.Image:
    """Compose OSM raster tiles centered on (lat, lon) into an RGB image of (width, height)."""
    cx, cy = _lonlat_to_webmercator_pixel(lon, lat, zoom)
    left = cx - width / 2
    top = cy - height / 2
    n = 2 ** zoom
    tile_x0 = int(left // _OSM_TILE_SIZE)
    tile_y0 = int(top // _OSM_TILE_SIZE)
    tile_x1 = int((left + width) // _OSM_TILE_SIZE)
    tile_y1 = int((top + height) // _OSM_TILE_SIZE)
    cols = tile_x1 - tile_x0 + 1
    rows = tile_y1 - tile_y0 + 1
    canvas = Image.new("RGB", (cols * _OSM_TILE_SIZE, rows * _OSM_TILE_SIZE), (218, 218, 218))
    # ponytail: fetch tiles in parallel (I/O-bound; urlopen releases the GIL) via a
    # bounded ThreadPoolExecutor, then paste in the original (tx, ty) order. The
    # composed+cropped output is pixel-identical to the serial version — only the
    # fetch order changed. Ceiling: max_workers is capped at _OSM_TILE_FETCH_WORKERS
    # (8) to stay within OSM's reasonable-use policy; a larger pool would abuse the
    # tile servers. Upgrade path: an async/await HTTP pool if we move to non-blocking I/O.
    jobs: list[tuple[int, int, str]] = []
    for ty in range(tile_y0, tile_y1 + 1):
        if ty < 0 or ty >= n:  # out of range near the poles
            continue
        for tx in range(tile_x0, tile_x1 + 1):
            jobs.append((tx, ty, _OSM_TILE_URL.format(z=zoom, x=tx % n, y=ty)))
    tile_bytes_by_pos: dict[tuple[int, int], bytes | None] = {}
    if jobs:
        ub = patch_module()
        with ub.ThreadPoolExecutor(max_workers=_OSM_TILE_FETCH_WORKERS) as ex:
            for tx, ty, tile_bytes in ex.map(_fetch_osm_tile, jobs):
                tile_bytes_by_pos[(tx, ty)] = tile_bytes
    for ty in range(tile_y0, tile_y1 + 1):
        if ty < 0 or ty >= n:
            continue
        for tx in range(tile_x0, tile_x1 + 1):
            tile_bytes = tile_bytes_by_pos.get((tx, ty))
            if not tile_bytes:
                continue
            try:
                tile = Image.open(BytesIO(tile_bytes)).convert("RGB")
                canvas.paste(tile, ((tx - tile_x0) * _OSM_TILE_SIZE, (ty - tile_y0) * _OSM_TILE_SIZE))
            except Exception:
                logger.debug("Tile decode failed for (%s, %s)", tx, ty, exc_info=True)
    offset_x = round(left - tile_x0 * _OSM_TILE_SIZE)
    offset_y = round(top - tile_y0 * _OSM_TILE_SIZE)
    return canvas.crop((offset_x, offset_y, offset_x + width, offset_y + height))


def _fetch_google_static_map(lat: float, lon: float, width: int, height: int, zoom: int, key: str) -> Image.Image:
    """Fetch a Google Static Maps image centered on (lat, lon). Uses scale=2 for detail."""
    # Google caps a single tile at 640x640; scale=2 yields up to 1280x1280 pixels.
    req_w = min(width, 640)
    req_h = min(height, 640)
    params = (
        f"?center={lat},{lon}&zoom={zoom}&size={req_w}x{req_h}&scale=2"
        f"&maptype=roadmap&format=png&key={urllib.parse.quote(key)}"
    )
    url = _GOOGLE_STATIC_URL + params
    ub = patch_module()
    data = ub._http_get(url, {"User-Agent": _HTTP_USER_AGENT})
    if not data:
        return Image.new("RGB", (width, height), (215, 215, 215))
    try:
        return Image.open(BytesIO(data)).convert("RGB")
    except Exception:
        logger.debug("Google Static Maps decode failed", exc_info=True)
        return Image.new("RGB", (width, height), (215, 215, 215))


def fetch_static_map(
    lat: float,
    lon: float,
    width: int,
    height: int,
    zoom: int = _MAP_ZOOM,
    *,
    provider: str = _MAP_PROVIDER_DEFAULT,
    google_key: str | None = None,
) -> bytes:
    """Return a PNG map image (capped fetch size) for (lat, lon) using the chosen provider.

    On any failure, returns a gray placeholder so downstream composition still renders.
    """
    fetch_w, fetch_h = _cap_fetch_size(width, height)
    try:
        if provider == "google":
            if not google_key:
                logger.warning("Google Static Maps seleccionado pero falta ANTARES_GOOGLE_MAPS_KEY; usando fallback.")
                return _fallback_map_bytes(fetch_w, fetch_h)
            img = _fetch_google_static_map(lat, lon, fetch_w, fetch_h, zoom, google_key)
        else:
            img = _fetch_osm_tiles_map(lat, lon, fetch_w, fetch_h, zoom)
        img = img.resize((fetch_w, fetch_h), Image.Resampling.LANCZOS) if img.size != (fetch_w, fetch_h) else img
        buf = BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        logger.exception("fetch_static_map falló para %s,%s; usando placeholder", lat, lon)
        return _fallback_map_bytes(fetch_w, fetch_h)


def _get_cached_map_screenshot(
    lat: float,
    lon: float,
    formato: str,
    *,
    preview: bool = False,
    map_opts: dict[str, Any] | None = None,
) -> bytes:
    """Fetch (or reuse) a static map image for (lat, lon). No browser process needed."""
    key = _map_cache_key(lat, lon, formato, preview=preview)
    cached = _map_screenshot_cache.get(key)
    if cached is not None and _screenshot_has_map_tiles(cached):
        return cached
    cap_w, cap_h = _map_capture_size(formato, preview=preview)
    provider = _resolve_provider(map_opts)
    screenshot = fetch_static_map(
        lat, lon, cap_w, cap_h, _MAP_ZOOM,
        provider=provider, google_key=_resolve_google_key(map_opts),
    )
    if _screenshot_has_map_tiles(screenshot):
        with _cache_lock:
            _map_screenshot_cache[key] = screenshot
            _trim_cache(_map_screenshot_cache, _MAX_MAP_CACHE)
    return screenshot
