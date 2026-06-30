"""Caches de Excel parseado y de previews compuestas.

Mantiene los dicts globales del módulo original (behavior idéntico) con su propio
lock, desacoplado del lock de screenshots en ``map_provider``. ``_compose_and_cache_preview``
resuelve ``_compose_ubicacion_image`` vía import lazy de ``composer`` para evitar el
ciclo cache → composer → map_provider (composer no importa cache, pero se mantiene
lazy por simetría con el plan y para que un futuro composer→cache no rompa).
"""
from __future__ import annotations

import base64
import logging
import os
import threading
from collections import OrderedDict
from functools import lru_cache
from io import BytesIO
from typing import Any

import pandas as pd
from PIL import Image

from backend.core.ubicaciones.layout import (
    _FOOTER_LAYOUT_VERSION,
    _MAP_CAPTURE_VERSION,
    _map_cache_key,
)
from backend.core.ubicaciones.map_provider import _map_screenshot_cache
from backend.core.ubicaciones.parsers import _parse_excel_columns

logger = logging.getLogger(__name__)

_excel_cache: dict[str, tuple[float, pd.DataFrame, tuple[Any, ...]]] = {}
# LRU cache using functools.lru_cache on the composition function (true LRU)
# Key includes mtime, so file changes naturally create new cache entries.
# Old entries are evicted by LRU when maxsize is reached.
_cache_lock = threading.Lock()
_MAX_COMPOSED_CACHE = 80


def _load_excel_data(excel_path: str) -> tuple[pd.DataFrame, tuple[Any, ...]]:
    """Load and parse Excel, reusing cache when the file has not changed."""
    mtime = os.path.getmtime(excel_path)
    cached = _excel_cache.get(excel_path)
    if cached and cached[0] == mtime:
        return cached[1], cached[2]
    df = pd.read_excel(excel_path, engine="openpyxl")
    cols = _parse_excel_columns(df)
    _excel_cache[excel_path] = (mtime, df, cols)
    return df, cols


def _encode_preview_data(
    preview_img: Image.Image,
    datos: dict,
    *,
    row_index: int,
    total_filas: int,
    formato: str,
) -> dict[str, Any]:
    buf = BytesIO()
    preview_img.save(buf, format="JPEG", quality=88, optimize=True, subsampling=0)
    img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return {
        "image": f"data:image/jpeg;base64,{img_b64}",
        "cod_componente": str(datos["cod_componente"]),
        "direccion": str(datos["direccion"]),
        "localidad": str(datos["localidad"]),
        "distrito": str(datos["distrito"]),
        "total_filas": total_filas,
        "row_index": row_index,
        "formato": formato,
    }


@lru_cache(maxsize=_MAX_COMPOSED_CACHE)
def _compose_preview_cached(
    footer_ver: int,
    map_ver: int,
    excel_path: str,
    mtime: float,
    row_index: int,
    formato: str,
    datos_tuple: tuple[tuple[str, Any], ...],
    screenshot_bytes: bytes,
    total_filas: int,
) -> dict[str, Any]:
    """Cached preview composition using functools.lru_cache (true LRU)."""
    from backend.core.ubicaciones.composer import _compose_ubicacion_image  # lazy: anti-ciclo

    datos = dict(datos_tuple)
    preview_img = _compose_ubicacion_image(datos, formato, screenshot_bytes, preview=True)
    return _encode_preview_data(
        preview_img,
        datos,
        row_index=row_index,
        total_filas=total_filas,
        formato=formato,
    )


def _compose_and_cache_preview(
    excel_ctx: tuple[str, float],
    row_index: int,
    formato: str,
    datos: dict,
    screenshot_bytes: bytes,
    total_filas: int,
) -> dict[str, Any]:
    """Compose preview using LRU-cached function (thread-safe via _cache_lock)."""
    # Convert dict to hashable tuple for lru_cache key
    datos_tuple = tuple(sorted(datos.items()))
    excel_path, mtime = excel_ctx
    with _cache_lock:
        return _compose_preview_cached(
            _FOOTER_LAYOUT_VERSION,
            _MAP_CAPTURE_VERSION,
            excel_path,
            mtime,
            row_index,
            formato,
            datos_tuple,
            screenshot_bytes,
            total_filas,
        )


def _prefetch_alternate_formato(
    excel_ctx: tuple[str, float],
    row_index: int,
    formato: str,
    datos: dict,
    lat: float,
    lon: float,
    total_filas: int,
) -> None:
    """Pre-compone la orientación opuesta en background (solo Pillow, sin Playwright)."""
    try:
        alt = "horizontal" if formato == "vertical" else "vertical"
        # Check LRU cache via the cached function's cache_info / direct call would
        # need same key; simpler: try to get from cache via a dummy call would be
        # wasteful. Instead, we just attempt to compose - lru_cache handles dedup.
        map_bytes = _map_screenshot_cache.get(_map_cache_key(lat, lon, alt, preview=True))
        if map_bytes is None:
            return
        _compose_and_cache_preview(excel_ctx, row_index, alt, datos, map_bytes, total_filas)
    except Exception:
        logger.debug("Prefetch orientación alterna falló", exc_info=True)
