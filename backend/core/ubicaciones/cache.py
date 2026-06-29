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
_preview_composed_cache: dict[tuple[int, int, tuple[str, float], int, str], dict[str, Any]] = {}
# Guarda las caches mutadas desde el thread daemon de prefetch (B1): sin lock,
# _trim_cache + __setitem__ concurrentes pueden lanzar RuntimeError o corromper
# el orden LRU.
_cache_lock = threading.Lock()
_MAX_COMPOSED_CACHE = 80


def _trim_cache(cache: dict, max_size: int) -> None:
    while len(cache) > max_size:
        del cache[next(iter(cache))]


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


def _compose_and_cache_preview(
    excel_ctx: tuple[str, float],
    row_index: int,
    formato: str,
    datos: dict,
    screenshot_bytes: bytes,
    total_filas: int,
) -> dict[str, Any]:
    from backend.core.ubicaciones.composer import _compose_ubicacion_image  # lazy: anti-ciclo

    preview_img = _compose_ubicacion_image(datos, formato, screenshot_bytes, preview=True)
    data = _encode_preview_data(
        preview_img,
        datos,
        row_index=row_index,
        total_filas=total_filas,
        formato=formato,
    )
    with _cache_lock:
        _preview_composed_cache[(_FOOTER_LAYOUT_VERSION, _MAP_CAPTURE_VERSION, excel_ctx, row_index, formato)] = data
        _trim_cache(_preview_composed_cache, _MAX_COMPOSED_CACHE)
    return data


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
        cache_key = (_FOOTER_LAYOUT_VERSION, _MAP_CAPTURE_VERSION, excel_ctx, row_index, alt)
        if cache_key in _preview_composed_cache:
            return
        map_bytes = _map_screenshot_cache.get(_map_cache_key(lat, lon, alt, preview=True))
        if map_bytes is None:
            return
        _compose_and_cache_preview(excel_ctx, row_index, alt, datos, map_bytes, total_filas)
    except Exception:
        logger.debug("Prefetch orientación alterna falló", exc_info=True)
