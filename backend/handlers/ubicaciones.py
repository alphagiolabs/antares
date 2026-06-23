import base64
import contextlib
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from io import BytesIO
from typing import Any

import pandas as pd
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from backend.utils.paths import resource_path

logger = logging.getLogger(__name__)

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

# ── Asset caches (fonts, footers, excel) ─────────────────────────────────────
_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont | ImageFont.ImageFont] = {}
_footer_cache: dict[tuple[str, int, int], Image.Image | None] = {}
_excel_cache: dict[str, tuple[float, pd.DataFrame, tuple[Any, ...]]] = {}
_map_screenshot_cache: dict[tuple[Any, ...], bytes] = {}
_preview_composed_cache: dict[tuple[tuple[str, float], int, str], dict[str, Any]] = {}
_preview_excel_ctx: tuple[str, float] | None = None
_MAX_MAP_CACHE = 40
_MAX_COMPOSED_CACHE = 80
_COORD_PRECISION = 5
_MAP_CAPTURE_VERSION = 4  # incrementar al cambiar heurística de captura/caché
_FOOTER_LAYOUT_VERSION = 2  # incrementar al cambiar footer_h o escalado de logo
_MAPS_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
_PREVIEW_BROWSER_ARGS = [
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-extensions",
    "--disable-sync",
    "--disable-translate",
    "--no-first-run",
    "--mute-audio",
]
_BLOCKED_PREVIEW_URL_PARTS = (
    "google-analytics.com",
    "googletagmanager.com",
    "doubleclick.net",
    "play.google.com/log",
)
_last_capture_viewport: tuple[int, int] | None = None
_preview_routes_installed = False

_MAP_TILES_READY_SCRIPT = """
() => {
    const c = document.querySelector('canvas');
    if (!c || c.width < 100) return false;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    const w = c.width;
    const h = c.height;
    let dark = 0;
    let chroma = 0;
    let lightGray = 0;
    const pts = 12;
    for (let i = 0; i < pts; i++) {
        const x = Math.floor(w * (0.12 + 0.76 * ((i % 4) / 3)));
        const y = Math.floor(h * (0.12 + 0.76 * (Math.floor(i / 4) / 2)));
        const p = ctx.getImageData(x, y, 1, 1).data;
        const r = p[0], g = p[1], b = p[2];
        const lum = r + g + b;
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        if (lum < 250) dark++;
        if (spread > 18 && lum > 180 && lum < 650) chroma++;
        if (spread < 12 && lum > 620 && lum < 760) lightGray++;
    }
    if (lightGray >= pts * 0.55) return false;
    return dark >= 1 && chroma >= 2;
}
"""

_MAPS_UI_HIDE_SCRIPT = """
    () => {
        const style = document.createElement('style');
        style.textContent = `
            #omnibox-container, #vasbox, #titlecard, .app-viewcard-strip,
            .scene-footer-container, #watermark, .watermark, .gmnoprint, .gm-style-cc,
            .gmnoscreen, .gm-style-moc, .maps-sprite-background, .maps-sprite-pane,
            div[role="menubar"], div[role="button"], div[role="search"],
            button, #gb, .app-vertical-widget-holder, .app-horizontal-widget-holder,
            .widget-settings-button-container, .widget-pane,
            div[data-tooltip], div[aria-label="Capas"], div[aria-label="Acceder"],
            a[aria-label="Acceder"],
            .Owrmqf, .F63Kk, .TorxFf, .PlF8V, .yHc72, .obhoOb, .bqcX3e, .EtdG7d
            { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
        `;
        document.head.appendChild(style);

        const elementsToHide = [
            '#omnibox-container','#vasbox','#titlecard','.app-viewcard-strip',
            '.scene-footer-container','#watermark','.watermark','.gmnoprint','.gm-style-cc',
            'div[role="menubar"]','div[role="button"]','#gb','button'
        ];
        elementsToHide.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => { if (el) el.style.display = 'none'; });
        });

        document.querySelectorAll('div').forEach(el => {
            const s = window.getComputedStyle(el);
            if (s.position === 'absolute' || s.position === 'fixed') {
                const z = parseInt(s.zIndex);
                if (z > 10) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.width < window.innerWidth - 50) {
                        el.style.setProperty('display', 'none', 'important');
                        el.style.setProperty('visibility', 'hidden', 'important');
                        el.style.setProperty('opacity', '0', 'important');
                    }
                }
            }
            if (el.innerText && (el.innerText.includes('Buscar en Google') || el.innerText.includes('Capas') || el.innerText.includes('tráfico') || el.innerText.includes('Acceder') || el.innerText.trim() === 'Google Maps' || el.innerText.includes('Google Maps'))) {
                el.style.setProperty('display', 'none', 'important');
            }
        });
    }
"""

_MAPS_EXPAND_SCRIPT = """
    () => {
        const style = document.createElement('style');
        style.textContent = [
            '.scene-container, .widget-scene, .widget-scene-canvas,',
            '.app-view-root, .maps-responsive, .widget-scene-canvas-wrap {',
            '  left: 0 !important; width: 100% !important;',
            '  margin: 0 !important; padding: 0 !important;',
            '}',
            'canvas { position: absolute !important; left: 0 !important; top: 0 !important; }',
        ].join(' ');
        document.head.appendChild(style);
    }
"""


def _get_font(bold: bool, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    key = ("arialbd" if bold else "arial", size)
    if key not in _font_cache:
        try:
            _font_cache[key] = ImageFont.truetype(f"{key[0]}.ttf", size)
        except Exception:
            try:
                _font_cache[key] = ImageFont.truetype("arial.ttf", size)
            except Exception:
                _font_cache[key] = ImageFont.load_default()
    return _font_cache[key]


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
            total += sum(rgb.getpixel((x, y)))
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
        total = sum(sum(img.getpixel((x, y))) for x in range(0, w, step))
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


def _get_footer_image(width: int, height: int) -> Image.Image | None:
    """Pega logo_footer.png en barra negra; escala por ancho (como plantillas JPG)."""
    key = (_FOOTER_LAYOUT_VERSION, width, height)
    if key not in _footer_cache:
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
            _footer_cache[key] = footer
        else:
            _footer_cache[key] = None
    return _footer_cache[key]


def _map_cache_key(lat: float, lon: float, formato: str, *, preview: bool) -> tuple[Any, ...]:
    cap_w, cap_h = _map_capture_size(formato, preview=preview)
    return (_MAP_CAPTURE_VERSION, *_coord_key(lat, lon), formato, cap_w, cap_h)


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
        r, g, b = img.getpixel((x, y))
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
    return all(_is_gutter_pixel(*img.getpixel((x, y))) for y in range(0, h, step))


def _row_is_gutter(img: Image.Image, y: int) -> bool:
    w, _h = img.size
    step = max(1, w // 80)
    return all(_is_gutter_pixel(*img.getpixel((x, y))) for x in range(0, w, step))


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


def _capture_map_canvas_bytes(page) -> bytes | None:
    """Captura el canvas de tiles (sin márgenes del viewport)."""
    try:
        locator = page.locator("canvas")
        if locator.count() == 0:
            return None
        return locator.first.screenshot(type="png")
    except Exception:
        logger.debug("Fallo captura de canvas de mapa", exc_info=True)
        return None


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


def _sync_excel_context(excel_path: str) -> tuple[str, float]:
    """Invalida caché de previews compuestos cuando cambia el Excel."""
    global _preview_excel_ctx
    ctx = (excel_path, os.path.getmtime(excel_path))
    if _preview_excel_ctx != ctx:
        _preview_composed_cache.clear()
        _preview_excel_ctx = ctx
    return ctx


def _trim_cache(cache: dict, max_size: int) -> None:
    while len(cache) > max_size:
        del cache[next(iter(cache))]


def _capture_map_on_pw_thread(lat: float, lon: float, formato: str, *, preview: bool) -> bytes:
    page = _get_preview_page()
    return capture_map_for_ubicacion(page, lat, lon, formato, preview=preview)


def _get_cached_map_screenshot(lat: float, lon: float, formato: str, *, preview: bool = False) -> bytes:
    key = _map_cache_key(lat, lon, formato, preview=preview)
    cached = _map_screenshot_cache.get(key)
    if cached is not None and _screenshot_has_map_tiles(cached):
        return cached
    screenshot = _pw_executor.submit(
        _capture_map_on_pw_thread, lat, lon, formato, preview=preview,
    ).result()
    if not _screenshot_has_map_tiles(screenshot):
        logger.warning("Captura sin tiles; reiniciando browser y reintentando")
        _pw_executor.submit(_do_cleanup_preview_browser).result()
        screenshot = _pw_executor.submit(
            _capture_map_on_pw_thread, lat, lon, formato, preview=preview,
        ).result()
    if _screenshot_has_map_tiles(screenshot):
        _map_screenshot_cache[key] = screenshot
        _trim_cache(_map_screenshot_cache, _MAX_MAP_CACHE)
    return screenshot


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
    preview_img = _compose_ubicacion_image(datos, formato, screenshot_bytes, preview=True)
    data = _encode_preview_data(
        preview_img,
        datos,
        row_index=row_index,
        total_filas=total_filas,
        formato=formato,
    )
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

# pin.png is a static asset; cache the decoded RGBA image to avoid re-reading
# and re-decoding on every Excel row during batch export.
_pin_cache: Image.Image | None = None


def _get_pin_rgba() -> Image.Image | None:
    """Return the cached pin.png as RGBA, loading it once on first access."""
    global _pin_cache
    if _pin_cache is None:
        pin_path = os.path.join(resource_path("assets/ubicaciones"), "pin.png")
        if os.path.exists(pin_path):
            _pin_cache = Image.open(pin_path).convert("RGBA")
    return _pin_cache


# ── Persistent preview browser ──────────────────────────────────────────────
# Keeps a single Playwright browser+page alive across preview calls so we
# don't pay the ~3s browser launch cost on every row navigation.
#
# IMPORTANT: Playwright sync_api greenlets are bound to the thread that created
# them.  The light scheduler lane (ThreadPoolExecutor with light_workers=4)
# can dispatch preview_ubicacion calls on different worker threads.  If the
# Page is created on one thread and used on another, Playwright raises:
#   "Cannot switch to a different thread"
# and leaves the backend in an unrecoverable state.
#
# Solution (Option C — single-thread executor): ``_pw_executor`` is a
# ThreadPoolExecutor(max_workers=1) that guarantees ALL Playwright operations
# (browser launch, page creation, navigation, screenshot) run on the SAME
# thread.  The main thread submits tasks to this executor and waits for the
# result; Pillow rendering stays on the caller thread (PIL has no thread
# affinity).
_preview_browser = None
_preview_page = None
_preview_pw = None
_pw_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="playwright-pw")


def _install_preview_routes(context) -> None:
    """Bloquea analytics/fuentes innecesarias en el browser de preview."""
    global _preview_routes_installed
    if _preview_routes_installed:
        return

    def _route_handler(route) -> None:
        req = route.request
        url = req.url
        if req.resource_type == "font" or any(part in url for part in _BLOCKED_PREVIEW_URL_PARTS):
            route.abort()
        else:
            route.continue_()

    context.route("**/*", _route_handler)
    _preview_routes_installed = True


def _get_preview_page():
    """Returns a persistent page for fast previews. Initializes on first call.

    Must be called on the ``_pw_executor`` thread so the Playwright sync_api
    greenlet is always bound to the same thread.
    """
    global _preview_browser, _preview_page, _preview_pw, _last_capture_viewport, _preview_routes_installed
    if _preview_page and _preview_browser and _preview_browser.is_connected():
        return _preview_page
    # Cleanup stale references
    if _preview_browser:
        with contextlib.suppress(Exception):
            _preview_browser.close()
    if _preview_pw:
        with contextlib.suppress(Exception):
            _preview_pw.stop()
    _last_capture_viewport = None
    _preview_routes_installed = False
    _preview_pw = sync_playwright().start()
    _preview_browser = _preview_pw.chromium.launch(headless=True, args=_PREVIEW_BROWSER_ARGS)
    context = _preview_browser.new_context(
        viewport={"width": 800, "height": 800},
        user_agent=_MAPS_USER_AGENT,
    )
    _install_preview_routes(context)
    _preview_page = context.new_page()
    # Accept cookies once and prime map tile loading
    with contextlib.suppress(Exception):
        _preview_page.goto("https://www.google.com/maps", wait_until="domcontentloaded", timeout=6000)
        _preview_page.wait_for_timeout(600)
        accept = _preview_page.locator('button:has-text("Accept all"), button:has-text("Aceptar todo")')
        if accept.count() > 0:
            accept.first.click()
            _preview_page.wait_for_timeout(300)
        _preview_page.goto(
            "https://www.google.com/maps/@-12.046,-77.042,18z",
            wait_until="commit",
            timeout=6000,
        )
        _preview_page.wait_for_timeout(400)
    return _preview_page


def _do_cleanup_preview_browser() -> None:
    """Actual cleanup — must run on the ``_pw_executor`` thread.

    Closes the persistent preview browser and resets all module-level
    references so the next ``_get_preview_page()`` call re-initializes.
    """
    global _preview_browser, _preview_page, _preview_pw, _last_capture_viewport, _preview_routes_installed
    if _preview_browser:
        with contextlib.suppress(Exception):
            _preview_browser.close()
    if _preview_pw:
        with contextlib.suppress(Exception):
            _preview_pw.stop()
    _preview_browser = None
    _preview_page = None
    _preview_pw = None
    _last_capture_viewport = None
    _preview_routes_installed = False


def _cleanup_preview_browser() -> None:
    """Closes the persistent preview browser. Call on app shutdown.

    Submits the actual cleanup to ``_pw_executor`` (so it runs on the
    Playwright thread) with a 5s timeout.  If the executor is stuck (e.g. a
    Playwright call hung), recreate the executor so the backend can recover.
    """
    global _pw_executor
    try:
        future = _pw_executor.submit(_do_cleanup_preview_browser)
        future.result(timeout=5)
    except FutureTimeoutError:
        logger.warning("Playwright cleanup timed out, recreating _pw_executor")
        with contextlib.suppress(Exception):
            _pw_executor.shutdown(wait=False)
        _pw_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="playwright-pw")
    except Exception:
        logger.exception("Error during Playwright cleanup")


def warmup_preview_browser() -> None:
    """Pre-warm the persistent Playwright browser at app startup.

    Submits ``_get_preview_page()`` to ``_pw_executor`` so the browser is
    created on the executor thread — the same thread that all future
    preview calls will use.  This pays the ~3s browser launch cost during
    backend initialization rather than on the first user preview request.
    Safe to call multiple times — if the browser is already alive it returns
    immediately. If this raises, callers should catch and continue; the lazy
    init path in ``_get_preview_page()`` remains as a fallback.
    """
    _pw_executor.submit(_get_preview_page).result()
    logger.info("Ubicaciones preview browser pre-warmed")


def _wait_for_map_ready(page, *, preview: bool = False) -> bool:
    """Espera a que el canvas del mapa tenga tiles renderizados (preview y export)."""
    total_ms = 22000 if preview else 16000
    step_ms = 1500 if preview else 800
    elapsed = 0
    while elapsed < total_ms:
        with contextlib.suppress(PlaywrightTimeoutError):
            page.wait_for_function(
                "() => { const c = document.querySelector('canvas'); return c && c.width > 100; }",
                timeout=4000,
            )
        with contextlib.suppress(PlaywrightTimeoutError):
            page.wait_for_function(_MAP_TILES_READY_SCRIPT, timeout=5000)
            page.wait_for_timeout(500)
            return True
        page.wait_for_timeout(step_ms)
        elapsed += step_ms + 4000
    return False


def capture_google_maps(
    page,
    lat: float,
    lon: float,
    width: int,
    height: int,
    zoom: int = 18,
    *,
    preview: bool = False,
):
    """Navega a Google Maps y captura el canvas del mapa sin márgenes laterales."""
    global _last_capture_viewport
    url = f"https://www.google.com/maps/@{lat},{lon},{zoom}z"
    target_viewport = (width, height)
    if _last_capture_viewport != target_viewport:
        page.set_viewport_size({"width": width, "height": height})
        _last_capture_viewport = target_viewport

    nav_timeout = 12000
    screenshot: bytes | None = None
    for attempt in range(2):
        try:
            page.goto(url, wait_until="commit", timeout=nav_timeout)
        except PlaywrightTimeoutError:
            logger.warning(f"Timeout al cargar el mapa para {lat},{lon}, procediendo con lo que cargo.")
        if preview:
            with contextlib.suppress(Exception):
                page.wait_for_load_state("load", timeout=10000)
        _wait_for_map_ready(page, preview=preview)
        try:
            page.evaluate(_MAPS_UI_HIDE_SCRIPT)
            page.evaluate(_MAPS_EXPAND_SCRIPT)
            page.wait_for_timeout(400 if preview else 300)
        except Exception as e:
            logger.warning(f"Error ocultando UI de Google Maps: {e}")
        raw = _capture_map_canvas_bytes(page)
        if raw is None:
            raw = page.screenshot(type="png")
        screenshot = _normalize_map_screenshot(raw, width, height)
        if _screenshot_has_map_tiles(screenshot):
            return screenshot
        if attempt == 0:
            logger.info("Mapa sin tiles detectado, reintentando captura para %s,%s", lat, lon)
            page.wait_for_timeout(1200)
    if screenshot is not None:
        return screenshot
    raw = _capture_map_canvas_bytes(page) or page.screenshot(type="png")
    return _normalize_map_screenshot(raw, width, height)


def capture_map_for_ubicacion(
    page,
    lat: float,
    lon: float,
    formato: str,
    *,
    preview: bool = False,
) -> bytes:
    """Captura el área de mapa para preview o export usando el mismo pipeline."""
    cap_w, cap_h = _map_capture_size(formato, preview=preview)
    return capture_google_maps(page, lat, lon, cap_w, cap_h, zoom=18, preview=preview)

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
        mapa = mapa.resize(target_map_size, resample)

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


def render_ubicacion(datos: dict, formato: str, *, preview: bool = False) -> Image.Image:
    """Pipeline único: captura mapa + composición WYSIWYG (preview o export)."""
    lat = float(datos["lat"])
    lon = float(datos["lon"])
    screenshot_bytes = _get_cached_map_screenshot(lat, lon, formato, preview=preview)
    return _compose_ubicacion_image(datos, formato, screenshot_bytes, preview=preview)


def render_imagen_ubicacion(datos: dict, formato: str) -> Image.Image:
    """Renderiza la imagen final A4 con mapa, textos, pin y footer."""
    return render_ubicacion(datos, formato, preview=False)


def generar_imagen_ubicacion(datos: dict, output_path: str, formato: str) -> None:
    """Genera la imagen y la guarda como PDF."""
    final_img = render_imagen_ubicacion(datos, formato)
    final_img.convert("RGB").save(output_path, "PDF", resolution=300.0)


def _parse_excel_columns(df):
    """Detecta las columnas del Excel normalizando nombres."""
    df.columns = [str(c).strip().lower() for c in df.columns]

    col_cod = next((c for c in df.columns if 'cod' in c or 'componente' in c), None)
    col_dir = next((c for c in df.columns if 'direcci' in c), None)
    col_loc = next((c for c in df.columns if 'localidad' in c or 'urb' in c), None)
    col_dist = next((c for c in df.columns if 'distrito' in c), None)
    col_lat = next((c for c in df.columns if 'lat' in c), None)
    col_lon = next((c for c in df.columns if 'lon' in c), None)

    if not col_lat or not col_lon:
        col_coord = next((c for c in df.columns if 'coord' in c or 'link' in c), None)
        if col_coord:
            def parse_lat(val):
                try:
                    return float(str(val).split(',')[0].strip())
                except Exception:
                    return 0.0
            def parse_lon(val):
                try:
                    return float(str(val).split(',')[1].strip())
                except Exception:
                    return 0.0
            df['lat_tmp'] = df[col_coord].apply(parse_lat)
            df['lon_tmp'] = df[col_coord].apply(parse_lon)
            col_lat = 'lat_tmp'
            col_lon = 'lon_tmp'
        else:
            return None, None, None, None, None, None

    return col_cod, col_dir, col_loc, col_dist, col_lat, col_lon

def _extract_row_data(row, index, col_cod, col_dir, col_loc, col_dist, col_lat, col_lon):
    """Extrae los datos de una fila del DataFrame."""
    return {
        'cod_componente': row[col_cod] if col_cod and pd.notna(row[col_cod]) else f"ID-{index+1}",
        'direccion': row[col_dir] if col_dir and pd.notna(row[col_dir]) else "",
        'localidad': row[col_loc] if col_loc and pd.notna(row[col_loc]) else "",
        'distrito': row[col_dist] if col_dist and pd.notna(row[col_dist]) else "",
        'lat': row[col_lat],
        'lon': row[col_lon]
    }

def handle_preview_ubicacion(payload: dict) -> dict:
    """Genera vista previa WYSIWYG: compone igual que el PDF y reduce para pantalla."""
    try:
        excel_path = payload.get("excelPath")
        formato = payload.get("formato", "vertical")
        row_index = payload.get("rowIndex", 0)
        recompose_only = bool(payload.get("recomposeOnly", False))

        if not excel_path:
            return {"success": False, "error": "Falta la ruta del Excel."}

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
        excel_ctx = _sync_excel_context(excel_path)
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

        screenshot_bytes = _get_cached_map_screenshot(lat, lon, formato, preview=True)
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
        # Si algo fallo, reiniciar el browser persistente
        _cleanup_preview_browser()
        return {"success": False, "error": str(e)}

def handle_generar_ubicaciones(payload: dict) -> dict:
    try:
        excel_path = payload.get("excelPath")
        output_dir = payload.get("outputDir")
        formato = payload.get("formato", "vertical")
        consolidado = payload.get("consolidado", False)

        if not excel_path or not output_dir:
            return {"success": False, "error": "Faltan rutas de entrada/salida."}

        os.makedirs(output_dir, exist_ok=True)

        df = pd.read_excel(excel_path, engine="openpyxl")
        col_cod, col_dir, col_loc, col_dist, col_lat, col_lon = _parse_excel_columns(df)

        if col_lat is None:
            return {"success": False, "error": "El Excel debe tener columnas 'latitud' y 'longitud'."}

        generados = 0
        consolidated_images: list[Image.Image] = []

        for index, row in df.iterrows():
            datos = _extract_row_data(row, index, col_cod, col_dir, col_loc, col_dist, col_lat, col_lon)

            if pd.isna(datos['lat']) or pd.isna(datos['lon']):
                continue

            logger.info(f"Procesando {datos['cod_componente']} en {datos['lat']}, {datos['lon']}...")
            t0 = time.perf_counter()

            if consolidado:
                final_img = render_imagen_ubicacion(datos, formato)
                consolidated_images.append(final_img.convert("RGB"))
            else:
                out_filename = f"{datos['cod_componente']}.pdf".replace("/", "_").replace("\\", "_")
                out_path = os.path.join(output_dir, out_filename)
                generar_imagen_ubicacion(datos, out_path, formato)

            logger.info(
                "Ubicacion %s renderizada en %.1fs",
                datos["cod_componente"],
                time.perf_counter() - t0,
            )
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

HANDLERS: dict[str, Any] = {
    "generar_ubicaciones": handle_generar_ubicaciones,
    "preview_ubicacion": handle_preview_ubicacion,
}
