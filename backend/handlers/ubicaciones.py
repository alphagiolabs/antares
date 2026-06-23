import base64
import contextlib
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from typing import Any

import pandas as pd
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from backend.utils.paths import resource_path

logger = logging.getLogger(__name__)

# ── Pin image cache ──────────────────────────────────────────────────────────
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


def _get_preview_page():
    """Returns a persistent page for fast previews. Initializes on first call.

    Must be called on the ``_pw_executor`` thread so the Playwright sync_api
    greenlet is always bound to the same thread.
    """
    global _preview_browser, _preview_page, _preview_pw
    if _preview_page and _preview_browser and _preview_browser.is_connected():
        return _preview_page
    # Cleanup stale references
    if _preview_browser:
        with contextlib.suppress(Exception):
            _preview_browser.close()
    if _preview_pw:
        with contextlib.suppress(Exception):
            _preview_pw.stop()
    _preview_pw = sync_playwright().start()
    _preview_browser = _preview_pw.chromium.launch(headless=True)
    context = _preview_browser.new_context(
        viewport={"width": 800, "height": 800},
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    _preview_page = context.new_page()
    # Accept cookies once
    with contextlib.suppress(Exception):
        _preview_page.goto("https://www.google.com/maps", wait_until="domcontentloaded", timeout=8000)
        _preview_page.wait_for_timeout(1500)
        accept = _preview_page.locator('button:has-text("Accept all"), button:has-text("Aceptar todo")')
        if accept.count() > 0:
            accept.first.click()
            _preview_page.wait_for_timeout(500)
    return _preview_page


def _do_cleanup_preview_browser() -> None:
    """Actual cleanup — must run on the ``_pw_executor`` thread.

    Closes the persistent preview browser and resets all module-level
    references so the next ``_get_preview_page()`` call re-initializes.
    """
    global _preview_browser, _preview_page, _preview_pw
    if _preview_browser:
        with contextlib.suppress(Exception):
            _preview_browser.close()
    if _preview_pw:
        with contextlib.suppress(Exception):
            _preview_pw.stop()
    _preview_browser = None
    _preview_page = None
    _preview_pw = None


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


def _capture_on_pw_thread(lat: float, lon: float, width: int, height: int, zoom: int):
    """Get the preview page and capture a Google Maps screenshot.

    Runs entirely on the ``_pw_executor`` thread so all Playwright sync_api
    operations stay on the same thread that created the greenlet.
    Returns PNG screenshot bytes.
    """
    page = _get_preview_page()
    return capture_google_maps_fast(page, lat, lon, width, height, zoom)


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


def capture_google_maps_fast(page, lat: float, lon: float, width: int, height: int, zoom: int = 18):
    """Captura un mapa de Google Maps con waits optimizados para preview rapido.

    Must be called on the ``_pw_executor`` thread (same thread that created
    the Playwright sync_api page) to avoid greenlet thread-affinity errors.
    """
    url = f"https://www.google.com/maps/@{lat},{lon},{zoom}z"
    page.set_viewport_size({"width": width, "height": height})
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=10000)
    except PlaywrightTimeoutError:
        logger.warning(f"Timeout al cargar el mapa para {lat},{lon}, procediendo con lo que cargo.")
    # Espera minima para que el mapa renderice
    # El browser pre-warmed ya tiene Google Maps cacheado y renderiza mas rapido.
    page.wait_for_timeout(800)
    try:
        page.evaluate("""
            () => {
                const sels = ['#omnibox-container','#vasbox','#titlecard','.app-viewcard-strip','.scene-footer-container','#watermark','.watermark','.gmnoprint','div[role="menubar"]','div[role="button"]'];
                sels.forEach(s => document.querySelectorAll(s).forEach(el => { if(el) el.style.display='none'; })));
            }
        """)
        page.wait_for_timeout(200)
    except Exception:
        pass
    return page.screenshot(type="png")

def capture_google_maps(page, lat: float, lon: float, width: int, height: int, zoom: int = 18):
    """
    Navega a Google Maps y toma una captura de pantalla del mapa en las coordenadas dadas.
    """
    url = f"https://www.google.com/maps/@{lat},{lon},{zoom}z"
    page.set_viewport_size({"width": width, "height": height})
    try:
        page.goto(url, wait_until="networkidle", timeout=15000)
    except PlaywrightTimeoutError:
        logger.warning(f"Timeout al cargar el mapa para {lat},{lon}, procediendo con lo que cargo.")
    try:
        page.wait_for_timeout(2000)
        page.evaluate("""
            () => {
                const elementsToHide = [
                    '#omnibox-container','#vasbox','#titlecard','.app-viewcard-strip',
                    '.scene-footer-container','#watermark','.watermark','.gmnoprint',
                    'div[role="menubar"]','div[role="button"]'
                ];
                elementsToHide.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => { if (el) el.style.display = 'none'; });
                });
            }
        """)
        page.wait_for_timeout(500)
    except Exception as e:
        logger.warning(f"Error ocultando UI de Google Maps: {e}")
    return page.screenshot(type="png")

def render_imagen_ubicacion(datos: dict, formato: str, page) -> Image.Image:
    """Renderiza la imagen final con mapa, textos, pin y footer. Retorna PIL Image.
    Diseño basado en las imágenes de referencia:
    - Dimensiones A4: 2480x3508 px (vertical) o 3508x2480 px (horizontal) a 300 DPI
    - Fondo gris claro (246, 246, 246)
    - Footer negro en la parte inferior (~14% vertical, ~10.5% horizontal)
    - Mapa de Google Maps con overlay semitransparente
    - Texto centrado en la parte superior
    - Pin celeste centrado en el mapa
    - Borde negro fino alrededor
    """
    lat = float(datos['lat'])
    lon = float(datos['lon'])

    # Dimensiones A4 a 300 DPI: 210mm x 297mm = 2480 x 3508 px
    if formato == "vertical":
        out_w, out_h = 2480, 3508
        footer_height = 491  # ~14% de 3508
    else:
        out_w, out_h = 3508, 2480
        footer_height = 260  # ~10.5% de 2480

    # Crear fondo gris claro
    final_img = Image.new('RGB', (out_w, out_h), (246, 246, 246))

    # Obtener el screenshot del mapa (área disponible = altura total - footer)
    map_height = out_h - footer_height
    screenshot_bytes = capture_google_maps(page, lat, lon, out_w, map_height, zoom=18)

    from io import BytesIO
    mapa = Image.open(BytesIO(screenshot_bytes)).convert("RGBA")

    # Redimensionar el mapa para que llene el área disponible
    mapa = mapa.resize((out_w, map_height), Image.Resampling.LANCZOS)

    # Crear overlay semitransparente (como en las imágenes de referencia)
    overlay = Image.new('RGBA', (out_w, map_height), (246, 246, 246, 120))
    mapa_con_overlay = Image.alpha_composite(mapa, overlay)

    # Pegar el mapa en la parte superior (dejando espacio para footer)
    final_img.paste(mapa_con_overlay.convert('RGB'), (0, 0))

    # Dibujar footer negro
    draw = ImageDraw.Draw(final_img)
    draw.rectangle([0, out_h - footer_height, out_w, out_h], fill=(0, 0, 0))

    # Dibujar borde negro fino
    draw.rectangle([0, 0, out_w-1, out_h-1], outline=(0, 0, 0), width=4)

    # Cargar fuentes (escaladas para A4)
    try:
        font_large = ImageFont.truetype("arial.ttf", 120)
        font_medium = ImageFont.truetype("arial.ttf", 60)
    except Exception:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()

    # Textos
    cod = str(datos.get('cod_componente', ''))
    dir_str = str(datos.get('direccion', ''))
    loc = str(datos.get('localidad', ''))
    dist = str(datos.get('distrito', ''))

    # Posiciones relativas al tamaño de imagen
    y_start = 120 if formato == "vertical" else 180
    line_spacing = 180 if formato == "vertical" else 260

    # COD COMPONENTE (grande, centrado)
    y_text = y_start
    bbox_cod = draw.textbbox((0, 0), cod, font=font_large)
    w_cod = bbox_cod[2] - bbox_cod[0]
    draw.text(((out_w - w_cod) // 2, y_text), cod, fill=(0, 0, 0), font=font_large)

    # Dirección
    y_text += line_spacing
    bbox_dir = draw.textbbox((0, 0), dir_str, font=font_medium)
    w_dir = bbox_dir[2] - bbox_dir[0]
    # Si es muy ancha, ajustar posición
    if w_dir > out_w * 0.8:
        draw.text((out_w * 0.1, y_text), dir_str, fill=(0, 0, 0), font=font_medium)
    else:
        draw.text(((out_w - w_dir) // 2, y_text), dir_str, fill=(0, 0, 0), font=font_medium)

    # Localidad
    y_text += line_spacing * 0.7
    bbox_loc = draw.textbbox((0, 0), loc, font=font_medium)
    w_loc = bbox_loc[2] - bbox_loc[0]
    draw.text(((out_w - w_loc) // 2, y_text), loc, fill=(0, 0, 0), font=font_medium)

    # Distrito
    y_text += line_spacing * 0.7
    bbox_dist = draw.textbbox((0, 0), dist, font=font_medium)
    w_dist = bbox_dist[2] - bbox_dist[0]
    draw.text(((out_w - w_dist) // 2, y_text), dist, fill=(0, 0, 0), font=font_medium)

    # Pin celeste
    pin = _get_pin_rgba()
    if pin is not None:
        # Escalar el pin proporcionalmente
        pin_scale = 0.15 if formato == "vertical" else 0.12
        new_pin_w = int(out_w * pin_scale)
        new_pin_h = int(pin.height * (new_pin_w / pin.width))
        pin = pin.resize((new_pin_w, new_pin_h), Image.Resampling.LANCZOS)
        pin_x = (out_w - new_pin_w) // 2
        pin_y = map_height // 2 - new_pin_h // 2
        final_img.paste(pin, (pin_x, pin_y), mask=pin)

    return final_img

def generar_imagen_ubicacion(datos: dict, output_path: str, formato: str, page):
    """Genera la imagen y la guarda como PDF."""
    final_img = render_imagen_ubicacion(datos, formato, page)
    final_img.convert("RGB").save(output_path, "PDF", resolution=100.0)

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

def _start_browser():
    """Inicia Playwright y retorna (browser, page). Llamar browser.close() al terminar."""
    p = sync_playwright().start()
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 800, "height": 800},
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    page = context.new_page()

    # Dismiss cookie banner beforehand if it appears
    try:
        page.goto("https://www.google.com/maps", wait_until="networkidle", timeout=10000)
        accept_button = page.locator('button:has-text("Accept all"), button:has-text("Aceptar todo")')
        if accept_button.count() > 0:
            accept_button.first.click()
            page.wait_for_timeout(1000)
    except Exception:
        pass

    return browser, page, p

def handle_preview_ubicacion(payload: dict) -> dict:
    """Genera una vista previa rapida usando el browser persistente.
    Usa JPEG para reducir el tiempo de transferencia por IPC."""
    try:
        excel_path = payload.get("excelPath")
        formato = payload.get("formato", "vertical")
        row_index = payload.get("rowIndex", 0)

        if not excel_path:
            return {"success": False, "error": "Falta la ruta del Excel."}

        df = pd.read_excel(excel_path)
        col_cod, col_dir, col_loc, col_dist, col_lat, col_lon = _parse_excel_columns(df)

        if col_lat is None:
            return {"success": False, "error": "El Excel debe tener columnas 'latitud' y 'longitud'."}

        if row_index >= len(df):
            return {"success": False, "error": "No hay mas filas para previsualizar."}

        row = df.iloc[row_index]
        datos = _extract_row_data(row, row_index, col_cod, col_dir, col_loc, col_dist, col_lat, col_lon)

        if pd.isna(datos['lat']) or pd.isna(datos['lon']):
            return {"success": False, "error": "La fila no tiene coordenadas validas."}

        from io import BytesIO

        # Calculate preview dimensions on the caller thread (no Playwright
        # access needed here).
        if formato == "vertical":
            preview_w, preview_h = 600, 850
        else:
            preview_w, preview_h = 850, 600

        footer_height = int(preview_h * 0.14) if formato == "vertical" else int(preview_h * 0.105)
        map_height = preview_h - footer_height

        # Submit ONLY the Playwright capture to the single-thread executor.
        # This guarantees the page operations run on the same thread that
        # created the Playwright sync_api greenlet, avoiding
        # "Cannot switch to a different thread" errors.
        screenshot_bytes = _pw_executor.submit(
            _capture_on_pw_thread, datos['lat'], datos['lon'],
            preview_w, map_height, 18,
        ).result()

        # Pillow rendering stays on the caller thread — PIL has no thread
        # affinity, so it is safe to run outside the executor.
        mapa = Image.open(BytesIO(screenshot_bytes)).convert("RGBA")
        preview_img = Image.new('RGB', (preview_w, preview_h), (246, 246, 246))
        mapa = mapa.resize((preview_w, map_height), Image.Resampling.LANCZOS)
        overlay = Image.new('RGBA', (preview_w, map_height), (246, 246, 246, 120))
        mapa_con_overlay = Image.alpha_composite(mapa, overlay)
        preview_img.paste(mapa_con_overlay.convert('RGB'), (0, 0))

        draw = ImageDraw.Draw(preview_img)
        draw.rectangle([0, preview_h - footer_height, preview_w, preview_h], fill=(0, 0, 0))
        draw.rectangle([0, 0, preview_w-1, preview_h-1], outline=(0, 0, 0), width=3)

        try:
            font_large = ImageFont.truetype("arial.ttf", 48)
            font_medium = ImageFont.truetype("arial.ttf", 24)
        except Exception:
            font_large = ImageFont.load_default()
            font_medium = ImageFont.load_default()

        cod = str(datos.get('cod_componente', ''))
        dir_str = str(datos.get('direccion', ''))
        loc = str(datos.get('localidad', ''))
        dist = str(datos.get('distrito', ''))

        y_start = 40 if formato == "vertical" else 60
        line_spacing = 60 if formato == "vertical" else 80

        y_text = y_start
        bbox_cod = draw.textbbox((0, 0), cod, font=font_large)
        w_cod = bbox_cod[2] - bbox_cod[0]
        draw.text(((preview_w - w_cod) // 2, y_text), cod, fill=(0, 0, 0), font=font_large)

        y_text += line_spacing
        bbox_dir = draw.textbbox((0, 0), dir_str, font=font_medium)
        w_dir = bbox_dir[2] - bbox_dir[0]
        if w_dir > preview_w * 0.8:
            draw.text((int(preview_w * 0.1), y_text), dir_str, fill=(0, 0, 0), font=font_medium)
        else:
            draw.text(((preview_w - w_dir) // 2, y_text), dir_str, fill=(0, 0, 0), font=font_medium)

        y_text += int(line_spacing * 0.7)
        bbox_loc = draw.textbbox((0, 0), loc, font=font_medium)
        w_loc = bbox_loc[2] - bbox_loc[0]
        draw.text(((preview_w - w_loc) // 2, y_text), loc, fill=(0, 0, 0), font=font_medium)

        y_text += int(line_spacing * 0.7)
        bbox_dist = draw.textbbox((0, 0), dist, font=font_medium)
        w_dist = bbox_dist[2] - bbox_dist[0]
        draw.text(((preview_w - w_dist) // 2, y_text), dist, fill=(0, 0, 0), font=font_medium)

        pin = _get_pin_rgba()
        if pin is not None:
            pin_scale = 0.10
            new_pin_w = int(preview_w * pin_scale)
            new_pin_h = int(pin.height * (new_pin_w / pin.width))
            pin = pin.resize((new_pin_w, new_pin_h), Image.Resampling.LANCZOS)
            pin_x = (preview_w - new_pin_w) // 2
            pin_y = map_height // 2 - new_pin_h // 2
            preview_img.paste(pin, (pin_x, pin_y), mask=pin)

        # JPEG encoding does not touch the Playwright page.
        buf = BytesIO()
        preview_img.save(buf, format="JPEG", quality=85)
        img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        return {
            "success": True,
            "data": {
                "image": f"data:image/jpeg;base64,{img_b64}",
                "cod_componente": str(datos['cod_componente']),
                "direccion": str(datos['direccion']),
                "localidad": str(datos['localidad']),
                "distrito": str(datos['distrito']),
                "total_filas": len(df),
                "row_index": row_index,
                "formato": formato,
            }
        }
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

        if not excel_path or not output_dir:
            return {"success": False, "error": "Faltan rutas de entrada/salida."}

        os.makedirs(output_dir, exist_ok=True)

        df = pd.read_excel(excel_path)
        col_cod, col_dir, col_loc, col_dist, col_lat, col_lon = _parse_excel_columns(df)

        if col_lat is None:
            return {"success": False, "error": "El Excel debe tener columnas 'latitud' y 'longitud'."}

        generados = 0

        browser, page, p = _start_browser()
        try:
            for index, row in df.iterrows():
                datos = _extract_row_data(row, index, col_cod, col_dir, col_loc, col_dist, col_lat, col_lon)

                if pd.isna(datos['lat']) or pd.isna(datos['lon']):
                    continue

                out_filename = f"{datos['cod_componente']}.pdf".replace("/", "_").replace("\\", "_")
                out_path = os.path.join(output_dir, out_filename)

                logger.info(f"Procesando {datos['cod_componente']} en {datos['lat']}, {datos['lon']}...")
                generar_imagen_ubicacion(datos, out_path, formato, page)
                generados += 1
        finally:
            browser.close()
            p.stop()

        return {
            "success": True,
            "data": {"generados": generados, "outputDir": output_dir}
        }
    except Exception as e:
        logger.exception("Error generando ubicaciones")
        return {"success": False, "error": str(e)}

HANDLERS: dict[str, Any] = {
    "generar_ubicaciones": handle_generar_ubicaciones,
    "preview_ubicacion": handle_preview_ubicacion,
}
