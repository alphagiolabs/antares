"""Constantes de layout y helpers de dimensiones para ubicaciones.

Sin dependencias internas del paquete (base de la cadena de imports).
"""
from __future__ import annotations

from typing import Any

# Layout medido desde assets/ubicaciones/vertical.jpg y Horizontal.jpg (300 DPI).
# vertical.jpg es referencia visual a escala reducida; footer_h = altura de la banda negra.
_REF_LAYOUT: dict[str, dict[str, int | float]] = {
    "vertical": {
        "out_w": 2480,
        "out_h": 3508,
        "footer_h": 122,
        "preview_w": 600,
        "y_start": 120,
        "line_spacing": 180,
        "line_gap": 0.7,
        "pin_scale": 0.15,
        "font_large": 120,
        "font_medium": 60,
        "stroke_large": 12,
        "stroke_medium": 8,
        "border": 4,
    },
    "horizontal": {
        "out_w": 3508,
        "out_h": 2480,
        "footer_h": 135,
        "preview_w": 850,
        "y_start": 180,
        "line_spacing": 260,
        "line_gap": 0.7,
        "pin_scale": 0.12,
        "font_large": 120,
        "font_medium": 60,
        "stroke_large": 12,
        "stroke_medium": 8,
        "border": 4,
    },
}
_PIN_TIP_RATIO = 0.884  # punta del pin.png medida en assets/ubicaciones/pin.png
_MAP_OVERLAY_ALPHA = 120
_BG_RGB = (246, 246, 246)

_COORD_PRECISION = 5
_MAP_CAPTURE_VERSION = 5  # incrementar al cambiar heurística de captura/caché
_FOOTER_LAYOUT_VERSION = 2  # incrementar al cambiar footer_h o escalado de logo


def _coord_key(lat: float, lon: float) -> tuple[float, float]:
    return (round(lat, _COORD_PRECISION), round(lon, _COORD_PRECISION))


def _dimensions_for(formato: str, *, preview: bool = False) -> tuple[int, int, int]:
    """Retorna (out_w, out_h, footer_height). Preview escala proporcionalmente desde export."""
    spec = _REF_LAYOUT[formato]
    out_w = int(spec["out_w"])
    out_h = int(spec["out_h"])
    footer_h = int(spec["footer_h"])
    if not preview:
        return out_w, out_h, footer_h
    scale = int(spec["preview_w"]) / out_w
    prev_w = round(out_w * scale)
    prev_h = round(out_h * scale)
    map_h = round((out_h - footer_h) * scale)
    prev_footer = max(1, prev_h - map_h)
    return prev_w, prev_h, prev_footer


def _map_capture_size(formato: str, *, preview: bool = False) -> tuple[int, int]:
    """Viewport = área del mapa. Preview usa tamaño pantalla; export usa A4."""
    out_w, out_h, footer_h = _dimensions_for(formato, preview=preview)
    return out_w, out_h - footer_h


def _map_cache_key(lat: float, lon: float, formato: str, *, preview: bool) -> tuple[Any, ...]:
    cap_w, cap_h = _map_capture_size(formato, preview=preview)
    return (_MAP_CAPTURE_VERSION, *_coord_key(lat, lon), formato, cap_w, cap_h)
