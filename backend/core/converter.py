"""Módulo de conversión de imágenes usando Pillow."""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Union

from PIL import Image

FORMATOS_SOPORTADOS: dict[str, dict[str, tuple[str, ...]]] = {
    "JPEG": {"ext": ".jpg", "modes": ("RGB", "L", "CMYK")},
    "JPG": {"ext": ".jpg", "modes": ("RGB", "L", "CMYK")},
    "PNG": {"ext": ".png", "modes": ("RGB", "RGBA", "L", "LA", "P")},
    "WEBP": {"ext": ".webp", "modes": ("RGB", "RGBA", "L")},
    "BMP": {"ext": ".bmp", "modes": ("RGB", "RGBA", "L")},
    "TIFF": {"ext": ".tiff", "modes": ("RGB", "RGBA", "L", "CMYK")},
    "GIF": {"ext": ".gif", "modes": ("P", "RGB", "L")},
    "ICO": {"ext": ".ico", "modes": ("RGB", "RGBA", "L")},
    "PDF": {"ext": ".pdf", "modes": ("RGB", "RGBA", "L", "P")},
}

# Mapeo de nombres internos a formatos Pillow
PIL_FORMAT_MAP: dict[str, str] = {
    "JPG": "JPEG",
}

ProgresoCallback = Callable[[int, int, Path], None]


def obtener_formatos() -> list[str]:
    """Retorna lista de formatos soportados."""
    return list(FORMATOS_SOPORTADOS.keys())


def convertir_imagen(
    ruta_origen: Union[str, Path],
    ruta_destino: Union[str, Path],
    formato_salida: str,
    calidad: int = 95,
    resize: Union[tuple[int, int], list[int], None] = None,
    keep_exif: bool = False,
) -> Path:
    """Convierte una imagen a otro formato.

    Args:
        ruta_origen: Ruta de la imagen origen.
        ruta_destino: Ruta de salida.
        formato_salida: Formato destino, ej: 'JPEG', 'PNG', 'WEBP'.
        calidad: Calidad 1-100 para formatos con compresión (JPEG, WEBP).
        resize: Tupla (ancho, alto) opcional para redimensionar.
        keep_exif: Preservar metadatos EXIF.

    Returns:
        Path del archivo generado.

    Raises:
        FileNotFoundError: Si la imagen origen no existe.
        ValueError: Si el formato no está soportado.
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

        pil_formato = PIL_FORMAT_MAP.get(formato, formato)
        img.save(ruta_destino, format=pil_formato, **save_kwargs)

    return ruta_destino


def procesar_lote(
    origenes: list[Union[str, Path]],
    carpeta_destino: Union[str, Path],
    formato: str,
    calidad: int = 95,
    resize: Union[tuple[int, int], list[int], None] = None,
    keep_exif: bool = False,
    progreso_callback: Union[ProgresoCallback, None] = None,
) -> list[Union[Path, str]]:
    """Procesa un lote de imágenes.

    Args:
        origenes: Lista de rutas de imágenes.
        carpeta_destino: Carpeta de salida.
        formato: Formato destino.
        calidad: Calidad de salida.
        resize: Tupla (ancho, alto) opcional.
        keep_exif: Preservar metadatos EXIF.
        progreso_callback: Función(i, total, ruta) opcional para reportar progreso.

    Returns:
        Lista de Paths generados o strings de error 'ERROR: ...'.
    """
    carpeta_destino = Path(carpeta_destino)
    carpeta_destino.mkdir(parents=True, exist_ok=True)
    ext = FORMATOS_SOPORTADOS[formato.upper()]["ext"]
    resultados: list[Union[Path, str]] = []

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


import base64
import tempfile


def convertir_a_preview(
    ruta_origen: Union[str, Path],
    formato_salida: str = "PNG",
    calidad: int = 85,
    resize: Union[tuple[int, int], list[int], None] = None,
) -> str:
    """Converts image to a small preview and returns base64 PNG data URI.

    Args:
        ruta_origen: Path to the original image.
        formato_salida: Output format (used only for color mode compatibility).
        calidad: Quality (used for compatibility with convertir_imagen params).
        resize: Optional resize tuple.

    Returns:
        Base64 data URI string: "data:image/png;base64,..."
    """
    ruta_origen = Path(ruta_origen)
    if not ruta_origen.exists():
        raise FileNotFoundError(f"No se encontró: {ruta_origen}")

    with Image.open(ruta_origen) as img:
        # Max preview size 400px on longest side
        max_size = 400
        ratio = min(max_size / max(img.size), 1.0)
        preview_size = (int(img.width * ratio), int(img.height * ratio))
        img = img.resize(preview_size, Image.LANCZOS)

        # Convert to RGB for preview consistency
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")
        elif img.mode != "RGB":
            img = img.convert("RGB")

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            img.save(tmp.name, format="PNG", optimize=True)
            tmp_path = tmp.name

    with open(tmp_path, "rb") as f:
        data = base64.b64encode(f.read()).decode("ascii")
    Path(tmp_path).unlink(missing_ok=True)
    return f"data:image/png;base64,{data}"
