"""Shim: implementación movida a backend.core.ubicaciones (simplification-016).

Este archivo existe para que los tests que hacen
``from backend.handlers import ubicaciones as ub`` y luego
``monkeypatch.setattr(ub, "_resolve_provider", ...)`` /
``monkeypatch.setattr(ub, "_http_get", ...)`` /
``monkeypatch.setattr("backend.handlers.ubicaciones.ThreadPoolExecutor", ...)``
sigan funcionando — esos re-exports deben permanecer hasta que los tests se
migren a las rutas de ``backend.core.ubicaciones.*``.

Los puntos parcheables (``_http_get``, ``ThreadPoolExecutor``, ``get_scheduler``,
``render_imagen_ubicacion``, ``generar_imagen_ubicacion``) se resuelven en runtime
vía ``backend.core.ubicaciones._patch.patch_module()`` dentro de las funciones que
los usan, de modo que un patch sobre este shim sigue atrapando.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor  # noqa: F401  (patch surface)
from typing import Any

from backend.core.scheduler import get_scheduler  # noqa: F401  (patch surface)
from backend.core.ubicaciones.cache import (  # noqa: F401
    _MAX_COMPOSED_CACHE,
    _cache_lock,
    _compose_and_cache_preview,
    _encode_preview_data,
    _excel_cache,
    _load_excel_data,
    _prefetch_alternate_formato,
    _preview_composed_cache,
    _trim_cache,
)
from backend.core.ubicaciones.composer import (  # noqa: F401
    _compose_ubicacion_image,
    _crop_footer_bar,
    _get_font,
    _get_footer_image,
    _get_pin_rgba,
    _measure_footer_band_height,
    generar_imagen_ubicacion,
    render_imagen_ubicacion,
    render_ubicacion,
)
from backend.core.ubicaciones.handlers import handle_generar_ubicaciones, handle_preview_ubicacion
from backend.core.ubicaciones.layout import (  # noqa: F401
    _BG_RGB,
    _COORD_PRECISION,
    _FOOTER_LAYOUT_VERSION,
    _MAP_CAPTURE_VERSION,
    _MAP_OVERLAY_ALPHA,
    _PIN_TIP_RATIO,
    _REF_LAYOUT,
    _coord_key,
    _dimensions_for,
    _map_cache_key,
    _map_capture_size,
)
from backend.core.ubicaciones.map_provider import (  # noqa: F401
    _GOOGLE_STATIC_URL,
    _HTTP_TIMEOUT,
    _HTTP_USER_AGENT,
    _MAP_FETCH_MAX_DIM,
    _MAP_PROVIDER_DEFAULT,
    _MAP_ZOOM,
    _MAX_MAP_CACHE,
    _OSM_TILE_FETCH_WORKERS,
    _OSM_TILE_SIZE,
    _OSM_TILE_URL,
    _cap_fetch_size,
    _center_crop_to_aspect,
    _column_is_gutter,
    _fallback_map_bytes,
    _fetch_google_static_map,
    _fetch_osm_tile,
    _fetch_osm_tiles_map,
    _get_cached_map_screenshot,
    _http_get,
    _is_gutter_pixel,
    _lonlat_to_webmercator_pixel,
    _map_screenshot_cache,
    _normalize_map_screenshot,
    _resolve_google_key,
    _resolve_provider,
    _row_is_gutter,
    _screenshot_has_map_tiles,
    _trim_map_gutters,
    fetch_static_map,
)
from backend.core.ubicaciones.parsers import _extract_row_data, _parse_excel_columns  # noqa: F401

logger = logging.getLogger(__name__)

HANDLERS: dict[str, Any] = {
    "generar_ubicaciones": handle_generar_ubicaciones,
    "preview_ubicacion": handle_preview_ubicacion,
}

__all__ = ["HANDLERS", "handle_generar_ubicaciones", "handle_preview_ubicacion"]
