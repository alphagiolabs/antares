import os
import math
import logging
import time
import pandas as pd
from typing import Any
from PIL import Image, ImageDraw, ImageFont
from backend.utils.paths import resource_path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

logger = logging.getLogger(__name__)

def capture_google_maps(page, lat: float, lon: float, width: int, height: int, zoom: int = 18):
    """
    Navega a Google Maps y toma una captura de pantalla del mapa en las coordenadas dadas.
    """
    url = f"https://www.google.com/maps/@{lat},{lon},{zoom}z"
    page.set_viewport_size({"width": width, "height": height})
    
    try:
        page.goto(url, wait_until="networkidle", timeout=15000)
    except PlaywrightTimeoutError:
        logger.warning(f"Timeout al cargar el mapa para {lat},{lon}, procediendo con lo que cargó.")
        
    # Ocultar elementos de UI de Google Maps para tener el mapa limpio
    try:
        # Esperar un poco para que los elementos del DOM termined de aparecer
        page.wait_for_timeout(2000)
        page.evaluate("""
            () => {
                const elementsToHide = [
                    '#omnibox-container',
                    '#vasbox',
                    '#titlecard',
                    '.app-viewcard-strip',
                    '.scene-footer-container',
                    '#watermark',
                    '.watermark',
                    '.gmnoprint',
                    'div[role="menubar"]',
                    'div[role="button"]'
                ];
                elementsToHide.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => {
                        if (el) el.style.display = 'none';
                    });
                });
            }
        """)
        # Esperar que se apliquen los estilos
        page.wait_for_timeout(500)
    except Exception as e:
        logger.warning(f"Error ocultando UI de Google Maps: {e}")

    screenshot_bytes = page.screenshot(type="png")
    return screenshot_bytes

def generar_imagen_ubicacion(datos: dict, output_path: str, formato: str, page):
    lat = float(datos['lat'])
    lon = float(datos['lon'])
    
    if formato == "vertical":
        out_w, out_h = 600, 800
    else:
        out_w, out_h = 800, 600
        
    # Obtener el screenshot limpio
    screenshot_bytes = capture_google_maps(page, lat, lon, out_w, out_h, zoom=18)
    
    # Escribir el bytes temporalmente o usar BytesIO
    from io import BytesIO
    mapa = Image.open(BytesIO(screenshot_bytes)).convert("RGBA")
    
    final_img = Image.new('RGBA', (out_w, out_h), (255, 255, 255, 255))
    final_img.paste(mapa, (0, 0))
    
    overlay = Image.new('RGBA', (out_w, out_h), (255, 255, 255, 120))
    final_img = Image.alpha_composite(final_img, overlay)
    
    draw = ImageDraw.Draw(final_img)
    
    try:
        font_large = ImageFont.truetype("arial.ttf", 60)
        font_medium = ImageFont.truetype("arial.ttf", 24)
        font_small = ImageFont.truetype("arial.ttf", 20)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()
        
    cod = str(datos.get('cod_componente', ''))
    dir_str = str(datos.get('direccion', ''))
    loc = str(datos.get('localidad', ''))
    dist = str(datos.get('distrito', ''))
    
    y_text = 40
    bbox_cod = draw.textbbox((0, 0), cod, font=font_large)
    w_cod = bbox_cod[2] - bbox_cod[0]
    draw.text(((out_w - w_cod) // 2, y_text), cod, fill=(0, 0, 0, 255), font=font_large)
    
    y_text += 80
    bbox_dir = draw.textbbox((0, 0), dir_str, font=font_medium)
    w_dir = bbox_dir[2] - bbox_dir[0]
    draw.text(((out_w - w_dir) // 2, y_text), dir_str, fill=(0, 0, 0, 255), font=font_medium)
    
    y_text += 40
    bbox_loc = draw.textbbox((0, 0), loc, font=font_medium)
    w_loc = bbox_loc[2] - bbox_loc[0]
    draw.text(((out_w - w_loc) // 2, y_text), loc, fill=(0, 0, 0, 255), font=font_medium)
    
    y_text += 40
    bbox_dist = draw.textbbox((0, 0), dist, font=font_medium)
    w_dist = bbox_dist[2] - bbox_dist[0]
    draw.text(((out_w - w_dist) // 2, y_text), dist, fill=(0, 0, 0, 255), font=font_medium)
    
    assets_dir = resource_path("assets/ubicaciones")
    pin_path = os.path.join(assets_dir, "pin_celeste.png")
    if os.path.exists(pin_path):
        pin = Image.open(pin_path).convert("RGBA")
        pin_w, pin_h = pin.size
        pin_x = (out_w - pin_w) // 2
        pin_y = (out_h - pin_h) // 2 + 50
        final_img.paste(pin, (pin_x, pin_y), mask=pin)
        
    footer_path = os.path.join(assets_dir, "footer_hidroservicios.png")
    if os.path.exists(footer_path):
        footer = Image.open(footer_path).convert("RGBA")
        f_w, f_h = footer.size
        new_f_h = int(f_h * (out_w / f_w))
        footer = footer.resize((out_w, new_f_h), Image.Resampling.LANCZOS)
        footer_y = out_h - new_f_h - 20
        final_img.paste(footer, (0, footer_y), mask=footer)
        
    draw.rectangle([0, 0, out_w-1, out_h-1], outline=(0, 0, 0, 255), width=2)
    
    # Save as PDF
    final_img.convert("RGB").save(output_path, "PDF", resolution=100.0)

def handle_generar_ubicaciones(payload: dict) -> dict:
    try:
        excel_path = payload.get("excelPath")
        output_dir = payload.get("outputDir")
        formato = payload.get("formato", "vertical")
        
        if not excel_path or not output_dir:
            return {"success": False, "error": "Faltan rutas de entrada/salida."}
            
        os.makedirs(output_dir, exist_ok=True)
        
        df = pd.read_excel(excel_path)
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
                    try: return float(str(val).split(',')[0].strip())
                    except: return 0.0
                def parse_lon(val):
                    try: return float(str(val).split(',')[1].strip())
                    except: return 0.0
                df['lat_tmp'] = df[col_coord].apply(parse_lat)
                df['lon_tmp'] = df[col_coord].apply(parse_lon)
                col_lat = 'lat_tmp'
                col_lon = 'lon_tmp'
            else:
                return {"success": False, "error": "El Excel debe tener columnas 'latitud' y 'longitud'."}
                
        generados = 0
        
        # Start Playwright for the whole batch
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 800, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            
            # Dismiss cookie banner beforehand if it appears
            try:
                page.goto("https://www.google.com/maps", wait_until="networkidle", timeout=10000)
                # Try to click the "Accept all" button for cookies
                accept_button = page.locator('button:has-text("Accept all"), button:has-text("Aceptar todo")')
                if accept_button.count() > 0:
                    accept_button.first.click()
                    page.wait_for_timeout(1000)
            except:
                pass
            
            for index, row in df.iterrows():
                datos = {
                    'cod_componente': row[col_cod] if col_cod and pd.notna(row[col_cod]) else f"ID-{index+1}",
                    'direccion': row[col_dir] if col_dir and pd.notna(row[col_dir]) else "",
                    'localidad': row[col_loc] if col_loc and pd.notna(row[col_loc]) else "",
                    'distrito': row[col_dist] if col_dist and pd.notna(row[col_dist]) else "",
                    'lat': row[col_lat],
                    'lon': row[col_lon]
                }
                
                if pd.isna(datos['lat']) or pd.isna(datos['lon']):
                    continue
                    
                out_filename = f"{datos['cod_componente']}.pdf".replace("/", "_").replace("\\", "_")
                out_path = os.path.join(output_dir, out_filename)
                
                logger.info(f"Procesando {datos['cod_componente']} en {datos['lat']}, {datos['lon']}...")
                generar_imagen_ubicacion(datos, out_path, formato, page)
                generados += 1
                
            browser.close()
            
        return {
            "success": True, 
            "data": {"generados": generados, "outputDir": output_dir}
        }
    except Exception as e:
        logger.exception("Error generando ubicaciones")
        return {"success": False, "error": str(e)}

HANDLERS: dict[str, Any] = {
    "generar_ubicaciones": handle_generar_ubicaciones,
}
