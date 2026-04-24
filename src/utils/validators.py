"""Utilidades de validación para rutas y nombres de archivo."""

import re
from pathlib import Path


def es_imagen(ruta):
    """Verifica si la ruta corresponde a una imagen soportada."""
    extensiones = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif", ".gif"}
    return Path(ruta).suffix.lower() in extensiones


def sanitizar_nombre(nombre):
    """Elimina caracteres no válidos para nombres de archivo en Windows/Linux."""
    nombre = str(nombre).strip()
    # Caracteres no permitidos en Windows: < > : " / \ | ? *
    nombre = re.sub(r'[<>:"/\\|?*]', "_", nombre)
    # Eliminar espacios múltiples
    nombre = re.sub(r'\s+', " ", nombre)
    return nombre.strip()


def obtener_codigo_desde_nombre(nombre_archivo):
    """
    Intenta extraer un código del nombre del archivo.
    Por defecto retorna el stem (nombre sin extensión).
    """
    return Path(nombre_archivo).stem
