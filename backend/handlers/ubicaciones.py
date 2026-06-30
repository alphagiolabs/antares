"""Shim de compatibilidad para tests que importan desde ``backend.handlers.ubicaciones``.

Este módulo re-exporta las funciones puras de layout, map_provider, parsers,
composer y cache que los tests siguen importando directamente desde aquí.
Los re-exports se mantienen mientras los tests sigan importando desde este shim.

Los puntos parcheables de I/O (``_http_get``, ``ThreadPoolExecutor``) se
resuelven en runtime via ``patch_module()`` o ``monkeypatch.setattr`` de modo
que un patch sobre este shim sigue atrapando.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from backend.core.ubicaciones.layout import (
    _BG_RGB,
    _PIN_TIP_RATIO,
    _REF_LAYOUT,
    _dimensions_for,
    _map_capture_size,
    _map_cache_key,
)
from backend.core.ubicaciones.map_provider import (
    _fetch_osm_tiles_map,
    _http_get,
    _is_gutter_pixel,
    _normalize_map_screenshot,
    _OSM_TILE_SIZE,
    _HTTP_TIMEOUT,
    _MAP_FETCH_MAX_DIM,
    fetch_static_map,
    _resolve_provider,
    _resolve_google_key,
    _cap_fetch_size,
    _lonlat_to_webmercator_pixel,
    _screenshot_has_map_tiles,
)
from backend.core.ubicaciones.parsers import _extract_row_data, _parse_excel_columns  # noqa: F401
from backend.core.ubicaciones.composer import (
    _compose_ubicacion_image,
    _crop_footer_bar,
    _measure_footer_band_height,
    render_imagen_ubicacion,
    generar_imagen_ubicacion,
)
from backend.core.ubicaciones.handlers import handle_generar_ubicaciones, handle_preview_ubicacion
from backend.core.scheduler import get_scheduler

logger = logging.getLogger(__name__)

HANDLERS: dict[str, Any] = {
    "generar_ubicaciones": handle_generar_ubicaciones,
    "preview_ubicacion": handle_preview_ubicacion,
}

__all__ = [
    "HANDLERS",
    "handle_generar_ubicaciones",
    "handle_preview_ubicacion",
    # layout
    "_BG_RGB",
    "_PIN_TIP_RATIO",
    "_REF_LAYOUT",
    "_dimensions_for",
    "_map_capture_size",
    "_map_cache_key",
    # map_provider
    "_fetch_osm_tiles_map",
    "_http_get",
    "_is_gutter_pixel",
    "_normalize_map_screenshot",
    "_OSM_TILE_SIZE",
    "_HTTP_TIMEOUT",
    "_MAP_FETCH_MAX_DIM",
    "fetch_static_map",
    "_resolve_provider",
    "_resolve_google_key",
    "_cap_fetch_size",
    "_lonlat_to_webmercator_pixel",
    "_screenshot_has_map_tiles",
    # composer
    "_compose_ubicacion_image",
    "_crop_footer_bar",
    "_measure_footer_band_height",
    "render_imagen_ubicacion",
    "generar_imagen_ubicacion",
    # compat: patcheable
    "ThreadPoolExecutor",
    "get_scheduler",
]