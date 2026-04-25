"""Utilidades de validación para rutas y nombres de archivo."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Union

_EXTENSIONES_IMAGEN: set[str] = {
    ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif", ".gif", ".ico", ".pdf"
}


def es_imagen(ruta: Union[str, Path]) -> bool:
    """Verifica si la ruta corresponde a una imagen soportada.

    Args:
        ruta: Ruta del archivo a validar.

    Returns:
        True si la extensión está en el conjunto de formatos soportados.
    """
    return Path(ruta).suffix.lower() in _EXTENSIONES_IMAGEN


def sanitizar_nombre(nombre: Union[str, Path]) -> str:
    """Elimina caracteres no válidos para nombres de archivo en Windows/Linux.

    Args:
        nombre: Nombre de archivo a sanitizar.

    Returns:
        Nombre limpio con caracteres inválidos reemplazados por guiones bajos.
    """
    nombre_limpio = str(nombre).strip()
    # Caracteres no permitidos en Windows: < > : " / \ | ? *
    nombre_limpio = re.sub(r'[<>\:"/\\|?*]', "_", nombre_limpio)
    # Eliminar espacios múltiples
    nombre_limpio = re.sub(r'\s+', " ", nombre_limpio)
    return nombre_limpio.strip()


def obtener_codigo_desde_nombre(nombre_archivo: Union[str, Path]) -> str:
    """Extrae el código base del nombre del archivo (stem sin extensión).

    Args:
        nombre_archivo: Nombre o ruta del archivo.

    Returns:
        Stem del archivo como cadena de texto.
    """
    return Path(nombre_archivo).stem


def parse_filename_parts(nombre_archivo: Union[str, Path]) -> tuple[str, str]:
    """Extrae (grupo, secuencia) del nombre de archivo.

    Formato esperado: '{grupo}_{secuencia}.ext'
    Ejemplos:
        '1_1.jpg'  -> ('1', '1')
        '1_2.jpg'  -> ('1', '2')
        '2_1.jpg'  -> ('2', '1')
        'abc.jpg'  -> ('abc', '1')  # fallback sin secuencia

    Args:
        nombre_archivo: Nombre o ruta del archivo.

    Returns:
        Tupla (grupo, secuencia). Si no se encuentra separador, secuencia='1'.
    """
    stem = Path(nombre_archivo).stem
    idx = stem.rfind("_")
    if idx > 0 and stem[idx + 1:].isdigit():
        return stem[:idx], stem[idx + 1:]
    return stem, "1"
