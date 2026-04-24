"""Módulo de conversión de imágenes usando Pillow."""

from PIL import Image
from pathlib import Path


FORMATOS_SOPORTADOS = {
    "JPEG": {"ext": ".jpg", "modes": ("RGB", "L", "CMYK")},
    "PNG": {"ext": ".png", "modes": ("RGB", "RGBA", "L", "LA", "P")},
    "WEBP": {"ext": ".webp", "modes": ("RGB", "RGBA", "L")},
    "BMP": {"ext": ".bmp", "modes": ("RGB", "RGBA", "L")},
    "TIFF": {"ext": ".tiff", "modes": ("RGB", "RGBA", "L", "CMYK")},
    "GIF": {"ext": ".gif", "modes": ("P", "RGB", "L")},
}


def obtener_formatos():
    """Retorna lista de formatos soportados."""
    return list(FORMATOS_SOPORTADOS.keys())


def convertir_imagen(ruta_origen, ruta_destino, formato_salida, calidad=95, resize=None, keep_exif=False):
    """
    Convierte una imagen a otro formato.

    Args:
        ruta_origen: str o Path de la imagen origen.
        ruta_destino: str o Path de salida.
        formato_salida: str como 'JPEG', 'PNG', 'WEBP', etc.
        calidad: int 1-100 para formatos con compresión (JPEG, WEBP).
        resize: tuple (ancho, alto) opcional para redimensionar.
        keep_exif: bool para preservar metadatos EXIF.

    Returns:
        Path del archivo generado.
    """
    ruta_origen = Path(ruta_origen)
    ruta_destino = Path(ruta_destino)

    if not ruta_origen.exists():
        raise FileNotFoundError(f"No se encontró la imagen: {ruta_origen}")

    formato = formato_salida.upper()
    if formato not in FORMATOS_SOPORTADOS:
        raise ValueError(f"Formato no soportado: {formato_salida}")

    with Image.open(ruta_origen) as img:
        # Modo de color compatible
        info = FORMATOS_SOPORTADOS[formato]
        if img.mode not in info["modes"]:
            if img.mode in ("RGBA", "LA", "P") and "RGBA" not in info["modes"]:
                # Convertir a RGB con fondo blanco si el formato no soporta transparencia
                fondo = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                if img.mode in ("RGBA", "LA"):
                    fondo.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
                    img = fondo
                else:
                    img = img.convert("RGB")
            else:
                target_mode = "RGB" if "RGB" in info["modes"] else info["modes"][0]
                img = img.convert(target_mode)

        # Redimensionar si se solicita
        if resize and isinstance(resize, (tuple, list)) and len(resize) == 2:
            img = img.resize((int(resize[0]), int(resize[1])), Image.LANCZOS)

        # Guardar
        ruta_destino.parent.mkdir(parents=True, exist_ok=True)
        save_kwargs = {}
        if formato in ("JPEG", "WEBP"):
            save_kwargs["quality"] = max(1, min(100, int(calidad)))
            save_kwargs["optimize"] = True
        if keep_exif and "exif" in img.info:
            save_kwargs["exif"] = img.info["exif"]

        img.save(ruta_destino, format=formato, **save_kwargs)

    return ruta_destino


def procesar_lote(origenes, carpeta_destino, formato, calidad=95, resize=None, keep_exif=False, progreso_callback=None):
    """
    Procesa un lote de imágenes.

    Args:
        origenes: lista de rutas de imágenes.
        carpeta_destino: carpeta de salida.
        formato: formato destino.
        calidad: calidad de salida.
        resize: tuple opcional.
        keep_exif: bool.
        progreso_callback: función(i, total, ruta) opcional para reportar progreso.

    Returns:
        Lista de rutas generadas.
    """
    carpeta_destino = Path(carpeta_destino)
    carpeta_destino.mkdir(parents=True, exist_ok=True)
    ext = FORMATOS_SOPORTADOS[formato.upper()]["ext"]
    resultados = []

    for i, ruta in enumerate(origenes, 1):
        ruta = Path(ruta)
        nombre_salida = ruta.stem + ext
        ruta_salida = carpeta_destino / nombre_salida
        try:
            convertir_imagen(ruta, ruta_salida, formato, calidad, resize, keep_exif)
            resultados.append(ruta_salida)
        except Exception as e:
            resultados.append(f"ERROR: {ruta.name} -> {e}")

        if progreso_callback:
            progreso_callback(i, len(origenes), ruta)

    return resultados
