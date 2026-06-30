"""Composición Pillow de la imagen de ubicación (mapa + textos + pin + footer).

Puro respecto a estado de caches: los loaders de assets usan weakref cache
para evitar fugas de memoria por referencias fuertes a ImageFont.FreeTypeFont
(que retienen recursos nativos FreeType hasta que el GC recolecta el objeto).
"""
from __future__ import annotations

import os
import weakref
from io import BytesIO
from typing import Any, cast

from PIL import Image, ImageDraw, ImageFont

from backend.core.ubicaciones.layout import (
    _BG_RGB,
    _MAP_OVERLAY_ALPHA,
    _PIN_TIP_RATIO,
    _REF_LAYOUT,
    _dimensions_for,
)
from backend.core.ubicaciones.map_provider import _get_cached_map_screenshot
from backend.utils.paths import resource_path


# Weakref-based font cache to avoid memory leaks from lru_cache holding
# strong references to ImageFont.FreeTypeFont objects (which hold native
# FreeType resources that aren't released until GC collects the Python object).
class _WeakFontCache:
    def __init__(self):
        self._cache: weakref.WeakValueDictionary[tuple[bool, int], ImageFont.FreeTypeFont | ImageFont.ImageFont] = (
            weakref.WeakValueDictionary()
        )

    def get(self, bold: bool, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont | None:
        return self._cache.get((bold, size))

    def set(self, bold: bool, size: int, font: ImageFont.FreeTypeFont | ImageFont.ImageFont) -> None:
        self._cache[(bold, size)] = font


_font_cache = _WeakFontCache()


def _get_font(bold: bool, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    cached = _font_cache.get(bold, size)
    if cached is not None:
        return cached

    key = ("arialbd" if bold else "arial", size)
    try:
        font = ImageFont.truetype(f"{key[0]}.ttf", size)
    except Exception:
        try:
            font = ImageFont.truetype("arial.ttf", size)
        except Exception:
            font = ImageFont.load_default()

    _font_cache.set(bold, size, font)
    return font


def _crop_footer_bar(img: Image.Image) -> Image.Image:
    """Los PNG de footer incluyen una vista previa del mapa debajo; conservar solo la barra."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    step = max(1, w // 30)
    last_black = 0
    for y in range(h):
        total = 0.0
        count = 0
        for x in range(0, w, step):
            total += sum(cast(tuple[int, ...], rgb.getpixel((x, y))))
            count += 1
        if count and (total / count) < 120:
            last_black = y
    bar_h = max(1, last_black + 1)
    return rgb.crop((0, 0, w, bar_h))


def _measure_footer_band_height(jpg_path: str) -> int:
    """Mide la altura (px) de la banda negra principal en una plantilla JPG."""
    img = Image.open(jpg_path).convert("RGB")
    w, h = img.size
    black_rows: list[int] = []
    step = max(1, w // 30)
    for y in range(h):
        total = sum(sum(cast(tuple[int, ...], img.getpixel((x, y)))) for x in range(0, w, step))
        if (total / (w // step + 1)) < 100:
            black_rows.append(y)
    if not black_rows:
        return 0
    groups: list[tuple[int, int]] = []
    start = black_rows[0]
    prev = black_rows[0]
    for y in black_rows[1:]:
        if y == prev + 1:
            prev = y
        else:
            groups.append((start, prev))
            start = prev = y
    groups.append((start, prev))
    best_start, best_end = max(groups, key=lambda band: band[1] - band[0])
    return best_end - best_start + 1


# Weakref-based image cache to avoid memory leaks from lru_cache holding
# strong references to PIL Image objects (which hold pixel data in memory).
class _WeakImageCache:
    def __init__(self):
        self._cache: weakref.WeakValueDictionary[tuple[int, int], Image.Image] = (
            weakref.WeakValueDictionary()
        )

    def get(self, width: int, height: int) -> Image.Image | None:
        return self._cache.get((width, height))

    def set(self, width: int, height: int, image: Image.Image) -> None:
        self._cache[(width, height)] = image


_footer_cache = _WeakImageCache()


def _get_footer_image(width: int, height: int) -> Image.Image | None:
    """Pega logo_footer.png en barra negra; escala por ancho (como plantillas JPG)."""
    cached = _footer_cache.get(width, height)
    if cached is not None:
        return cached

    assets_dir = resource_path("assets/ubicaciones")
    logo_path = os.path.join(assets_dir, "logo_footer.png")
    if not os.path.exists(logo_path):
        logo_path = os.path.join(assets_dir, "footer_horizontal.png")
    if os.path.exists(logo_path):
        src = Image.open(logo_path).convert("RGBA")
        bar_h = _crop_footer_bar(src.convert("RGB")).height
        logo = src.crop((0, 0, src.width, bar_h))
        scale = width / logo.width
        new_w = width
        new_h = max(1, round(logo.height * scale))
        if new_h > height:
            scale = height / logo.height
            new_h = height
            new_w = max(1, round(logo.width * scale))
        logo_resized = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)
        footer = Image.new("RGB", (width, height), (0, 0, 0))
        x = (width - new_w) // 2
        y = (height - new_h) // 2
        footer.paste(logo_resized, (x, y), logo_resized)
        _footer_cache.set(width, height, footer)
        return footer
    return None


_pin_cache: Image.Image | None = None


def _get_pin_rgba() -> Image.Image | None:
    """Return the cached pin.png as RGBA, loading it once on first access."""
    global _pin_cache
    if _pin_cache is not None:
        return _pin_cache

    pin_path = os.path.join(resource_path("assets/ubicaciones"), "pin.png")
    if os.path.exists(pin_path):
        _pin_cache = Image.open(pin_path).convert("RGBA")
        return _pin_cache
    return None


# ── Map source ───────────────────────────────────────────────────────────────
# The map image is now fetched from a static-map provider (OSM tiles or Google
# Static Maps) via fetch_static_map() — see map_provider. This replaced the
# persistent Playwright/Chromium browser, which was too heavy for the installer
# and broken in production (no bundled Chromium). No browser process, warmup, or
# shutdown lifecycle is needed anymore.


def _compose_ubicacion_image(
    datos: dict,
    formato: str,
    screenshot_bytes: bytes,
    *,
    preview: bool = False,
) -> Image.Image:
    """Compone mapa + textos + pin + footer. Preview y export usan la misma lógica
    escalada proporcionalmente (preview ≈ miniatura fiel del PDF exportado)."""
    spec = _REF_LAYOUT[formato]
    out_w, out_h, footer_height = _dimensions_for(formato, preview=preview)
    scale = out_w / int(spec["out_w"])

    final_img = Image.new("RGB", (out_w, out_h), _BG_RGB)

    map_height = out_h - footer_height
    mapa = Image.open(BytesIO(screenshot_bytes)).convert("RGBA")
    resample = Image.Resampling.LANCZOS
    target_map_size = (out_w, map_height)
    if mapa.size != target_map_size:
        # perf-15: reducing_gap=2.0 — heavy-downscale speedup (measured 64%,
        # PSNR 53.6 dB), no-op for small/upscale, exact size unchanged.
        mapa = mapa.resize(target_map_size, resample, reducing_gap=2.0)

    overlay = Image.new("RGBA", (out_w, map_height), (*_BG_RGB, _MAP_OVERLAY_ALPHA))
    mapa_con_overlay = Image.alpha_composite(mapa, overlay)
    final_img.paste(mapa_con_overlay.convert("RGB"), (0, 0))

    footer_img = _get_footer_image(out_w, footer_height)
    draw = ImageDraw.Draw(final_img)
    if footer_img is not None:
        final_img.paste(footer_img, (0, out_h - footer_height))
    else:
        draw.rectangle([0, out_h - footer_height, out_w, out_h], fill=(0, 0, 0))

    border_w = max(1, round(int(spec["border"]) * scale))
    draw.rectangle([0, 0, out_w - 1, out_h - 1], outline=(0, 0, 0), width=border_w)

    font_large = _get_font(True, max(10, round(int(spec["font_large"]) * scale)))
    font_medium = _get_font(True, max(8, round(int(spec["font_medium"]) * scale)))

    cod = str(datos.get("cod_componente", ""))
    dir_str = str(datos.get("direccion", ""))
    loc = str(datos.get("localidad", ""))
    dist = str(datos.get("distrito", ""))

    y_start = round(int(spec["y_start"]) * scale)
    line_spacing = round(int(spec["line_spacing"]) * scale)
    line_gap = float(spec["line_gap"])
    stroke_w_large = max(1, round(int(spec["stroke_large"]) * scale))
    stroke_w_medium = max(1, round(int(spec["stroke_medium"]) * scale))

    y_text = y_start
    bbox_cod = draw.textbbox((0, 0), cod, font=font_large)
    w_cod = bbox_cod[2] - bbox_cod[0]
    draw.text(
        ((out_w - w_cod) // 2, y_text),
        cod,
        fill=(0, 0, 0),
        font=font_large,
        stroke_width=stroke_w_large,
        stroke_fill=(255, 255, 255),
    )

    y_text += line_spacing
    bbox_dir = draw.textbbox((0, 0), dir_str, font=font_medium)
    w_dir = bbox_dir[2] - bbox_dir[0]
    if w_dir > out_w * 0.8:
        draw.text(
            (int(out_w * 0.1), y_text),
            dir_str,
            fill=(0, 0, 0),
            font=font_medium,
            stroke_width=stroke_w_medium,
            stroke_fill=(255, 255, 255),
        )
    else:
        draw.text(
            ((out_w - w_dir) // 2, y_text),
            dir_str,
            fill=(0, 0, 0),
            font=font_medium,
            stroke_width=stroke_w_medium,
            stroke_fill=(255, 255, 255),
        )

    y_text += round(line_spacing * line_gap)
    bbox_loc = draw.textbbox((0, 0), loc, font=font_medium)
    w_loc = bbox_loc[2] - bbox_loc[0]
    draw.text(
        ((out_w - w_loc) // 2, y_text),
        loc,
        fill=(0, 0, 0),
        font=font_medium,
        stroke_width=stroke_w_medium,
        stroke_fill=(255, 255, 255),
    )

    y_text += round(line_spacing * line_gap)
    bbox_dist = draw.textbbox((0, 0), dist, font=font_medium)
    w_dist = bbox_dist[2] - bbox_dist[0]
    draw.text(
        ((out_w - w_dist) // 2, y_text),
        dist,
        fill=(0, 0, 0),
        font=font_medium,
        stroke_width=stroke_w_medium,
        stroke_fill=(255, 255, 255),
    )

    pin = _get_pin_rgba()
    if pin is not None:
        new_pin_w = int(out_w * float(spec["pin_scale"]))
        new_pin_h = int(pin.height * (new_pin_w / pin.width))
        pin_resized = pin.resize((new_pin_w, new_pin_h), resample)
        pin_x = (out_w - new_pin_w) // 2
        pin_y = (map_height // 2) - int(new_pin_h * _PIN_TIP_RATIO)
        final_img.paste(pin_resized, (pin_x, pin_y), mask=pin_resized)

    return final_img


def render_ubicacion(
    datos: dict,
    formato: str,
    *,
    preview: bool = False,
    map_opts: dict[str, Any] | None = None,
) -> Image.Image:
    """Pipeline único: captura mapa + composición WYSIWYG (preview o export)."""
    lat = float(datos["lat"])
    lon = float(datos["lon"])
    screenshot_bytes = _get_cached_map_screenshot(lat, lon, formato, preview=preview, map_opts=map_opts)
    return _compose_ubicacion_image(datos, formato, screenshot_bytes, preview=preview)


def render_imagen_ubicacion(
    datos: dict,
    formato: str,
    map_opts: dict[str, Any] | None = None,
) -> Image.Image:
    """Renderiza la imagen final A4 con mapa, textos, pin y footer."""
    return render_ubicacion(datos, formato, preview=False, map_opts=map_opts)


def generar_imagen_ubicacion(
    datos: dict,
    output_path: str,
    formato: str,
    map_opts: dict[str, Any] | None = None,
) -> None:
    """Genera la imagen y la guarda como PDF."""
    final_img = render_imagen_ubicacion(datos, formato, map_opts=map_opts)
    final_img.convert("RGB").save(output_path, "PDF", resolution=300.0)
