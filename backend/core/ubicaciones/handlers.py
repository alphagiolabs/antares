"""Handlers IPC de ubicaciones — preview WYSIWYG y export PDF (per-file / consolidado).

``handle_generar_ubicaciones`` resuelve ``get_scheduler`` / ``render_imagen_ubicacion``
/ ``generar_imagen_ubicacion`` vía ``patch_module()`` para que los monkeypatch de
tests (``ub.get_scheduler``, ``ub.render_imagen_ubicacion``, ``ub.generar_imagen_ubicacion``)
sigan atrapando tras el split. ``handle_preview_ubicacion`` no tiene dependencias
parcheadas por tests → imports top-level.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

import pandas as pd
from PIL import Image

from backend.core.ubicaciones._patch import patch_module
from backend.core.ubicaciones.cache import (
    _compose_and_cache_preview,
    _load_excel_data,
    _prefetch_alternate_formato,
    _preview_composed_cache,
)
from backend.core.ubicaciones.layout import (
    _FOOTER_LAYOUT_VERSION,
    _MAP_CAPTURE_VERSION,
    _map_cache_key,
)
from backend.core.ubicaciones.map_provider import (
    _get_cached_map_screenshot,
    _map_screenshot_cache,
)
from backend.core.ubicaciones.parsers import _extract_row_data, _parse_excel_columns
from backend.utils.paths import guard_user_path

logger = logging.getLogger(__name__)


def _confine_excel_path(payload: dict) -> str:
    """SEC-003 Capa 2: confina excelPath a raíces vouched (enforce) o piso
    system-sensitive (warn). Devuelve la ruta resuelta o lanza ValueError."""
    return str(guard_user_path(payload.get("excelPath", ""), payload, label="Excel de ubicaciones"))


def handle_preview_ubicacion(payload: dict) -> dict:
    """Genera vista previa WYSIWYG: compone igual que el PDF y reduce para pantalla."""
    try:
        excel_path = payload.get("excelPath")
        formato = payload.get("formato", "vertical")
        row_index = payload.get("rowIndex", 0)
        recompose_only = bool(payload.get("recomposeOnly", False))
        map_opts = {"provider": payload.get("provider"), "google_maps_key": payload.get("google_maps_key")}

        if not excel_path:
            return {"success": False, "error": "Falta la ruta del Excel."}

        excel_path = _confine_excel_path(payload)
        df, (col_cod, col_dir, col_loc, col_dist, col_lat, col_lon) = _load_excel_data(excel_path)

        if col_lat is None:
            return {"success": False, "error": "El Excel debe tener columnas 'latitud' y 'longitud'."}

        if row_index >= len(df):
            return {"success": False, "error": "No hay mas filas para previsualizar."}

        row = df.iloc[row_index]
        datos = _extract_row_data(row, row_index, col_cod, col_dir, col_loc, col_dist, col_lat, col_lon)

        if pd.isna(datos['lat']) or pd.isna(datos['lon']):
            return {"success": False, "error": "La fila no tiene coordenadas validas."}

        lat = float(datos['lat'])
        lon = float(datos['lon'])
        excel_ctx = (excel_path, os.path.getmtime(excel_path))
        composed_key = (_FOOTER_LAYOUT_VERSION, _MAP_CAPTURE_VERSION, excel_ctx, row_index, formato)

        cached_preview = _preview_composed_cache.get(composed_key)
        if cached_preview is not None:
            return {"success": True, "data": cached_preview}

        if recompose_only:
            map_key = _map_cache_key(lat, lon, formato, preview=True)
            cached_map = _map_screenshot_cache.get(map_key)
            if cached_map is not None:
                data = _compose_and_cache_preview(
                    excel_ctx, row_index, formato, datos, cached_map, len(df),
                )
                return {"success": True, "data": data}

        screenshot_bytes = _get_cached_map_screenshot(lat, lon, formato, preview=True, map_opts=map_opts)
        data = _compose_and_cache_preview(
            excel_ctx, row_index, formato, datos, screenshot_bytes, len(df),
        )

        threading.Thread(
            target=_prefetch_alternate_formato,
            args=(excel_ctx, row_index, formato, datos, lat, lon, len(df)),
            daemon=True,
        ).start()

        return {"success": True, "data": data}
    except Exception as e:
        logger.exception("Error generando preview de ubicacion")
        return {"success": False, "error": str(e)}


def handle_generar_ubicaciones(payload: dict) -> dict:
    try:
        excel_path = payload.get("excelPath")
        output_dir = payload.get("outputDir")
        formato = payload.get("formato", "vertical")
        consolidado = payload.get("consolidado", False)
        map_opts = {"provider": payload.get("provider"), "google_maps_key": payload.get("google_maps_key")}

        if not excel_path or not output_dir:
            return {"success": False, "error": "Faltan rutas de entrada/salida."}

        # SEC-003 Capa 2: confina excelPath (read) y outputDir (write-root) a
        # raíces vouched cuando el router las inyecta; en warn solo piso
        # system-sensitive. El handler captura ValueError → success=False.
        excel_path = _confine_excel_path(payload)
        output_dir = str(guard_user_path(output_dir, payload, label="Directorio de salida de ubicaciones"))
        os.makedirs(output_dir, exist_ok=True)

        df = pd.read_excel(excel_path, engine="openpyxl")
        col_cod, col_dir, col_loc, col_dist, col_lat, col_lon = _parse_excel_columns(df)

        if col_lat is None:
            return {"success": False, "error": "El Excel debe tener columnas 'latitud' y 'longitud'."}

        generados = 0
        consolidated_images: list[Image.Image] = []

        # Pre-extract rows with valid coords in order (consolidado page order =
        # row order); rows with NaN lat/lon are skipped, same as the serial loop.
        rows: list[dict[str, Any]] = []
        for index, row in df.iterrows():
            datos = _extract_row_data(row, index, col_cod, col_dir, col_loc, col_dist, col_lat, col_lon)
            if pd.isna(datos["lat"]) or pd.isna(datos["lon"]):
                continue
            rows.append(datos)

        # ponytail: perf-04 — render rows in parallel on the WorkScheduler heavy
        # lane (was a serial df.iterrows loop). Per-row work is I/O-bound map fetch
        # + CPU compose; the module caches (_get_cached_map_screenshot,
        # _compose_and_cache_preview) are _cache_lock-protected so concurrent rows
        # are safe and shared-cache hits still work. Futures are collected in
        # submission order so consolidado page order is identical to serial.
        # Ceiling: this handler itself runs on a heavy worker (generar_ubicaciones
        # is in HEAVY_METHODS) and holds one heavy slot, so effective per-row
        # parallelism is bounded by heavy_capacity-1 — not a deadlock, since only
        # this one orchestrator thread waits on sub-tasks while the rest of the
        # pool runs them. Error semantics are preserved: the lowest-index row that
        # raises propagates (fut.result re-raises) and aborts the batch with
        # success=False, exactly like the old serial loop; rows past it may already
        # have written their PDFs (an inherent parallel side effect — render funcs
        # return placeholders on bad coords, so row errors are rare IO failures).

        def _render_row(d: dict[str, Any]) -> Image.Image | None:
            ub = patch_module()
            logger.info("Procesando %s en %s, %s...", d["cod_componente"], d["lat"], d["lon"])
            t0 = time.perf_counter()
            img: Image.Image | None = None
            if consolidado:
                img = ub.render_imagen_ubicacion(d, formato, map_opts=map_opts).convert("RGB")
            else:
                out_filename = f"{d['cod_componente']}.pdf".replace("/", "_").replace("\\", "_")
                out_path = os.path.join(output_dir, out_filename)
                ub.generar_imagen_ubicacion(d, out_path, formato, map_opts=map_opts)
            logger.info("Ubicacion %s renderizada en %.1fs", d["cod_componente"], time.perf_counter() - t0)
            return img

        ub = patch_module()
        scheduler = ub.get_scheduler()
        futures = [scheduler.submit_heavy(_render_row, d, block=True) for d in rows]
        for fut in futures:
            result = fut.result()  # re-raises on row error → outer except → success=False
            if consolidado and result is not None:
                consolidated_images.append(result)
            generados += 1

        if consolidado and consolidated_images:
            consolidated_path = os.path.join(output_dir, "ubicaciones_consolidado.pdf")
            # Save first image, append the rest as additional pages
            first_img = consolidated_images[0]
            append_imgs = consolidated_images[1:] if len(consolidated_images) > 1 else []
            first_img.save(
                consolidated_path,
                "PDF",
                resolution=300.0,
                save_all=True,
                append_images=append_imgs,
            )
            logger.info(f"PDF consolidado generado: {consolidated_path} ({generados} paginas)")

        return {
            "success": True,
            "data": {
                "generados": generados,
                "outputDir": output_dir,
                "consolidado": consolidado,
            },
        }
    except Exception as e:
        logger.exception("Error generando ubicaciones")
        return {"success": False, "error": str(e)}
