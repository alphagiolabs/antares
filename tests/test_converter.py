"""Tests para el módulo de conversión de imágenes.

Crea imágenes reales con Pillow para verificar conversiones,
redimensiones y manejo de errores.
"""

import base64
import io
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import backend.core.converter  # noqa: F401  (SEC-008b: triggers MAX_IMAGE_PIXELS cap)
from backend.core.converter import convertir_a_preview, convertir_imagen
from backend.core.format_registry import get_registry


def test_pillow_decompression_bomb_cap_is_set() -> None:
    """SEC-008b: converter setea Image.MAX_IMAGE_PIXELS para frenar bombas."""
    assert Image.MAX_IMAGE_PIXELS == 50_000_000


@pytest.fixture
def imagen_rgb(tmp_path):
    """Crea una imagen RGB de 100x100 píxeles."""
    ruta = tmp_path / "origen_rgb.png"
    img = Image.new("RGB", (100, 100), color=(255, 0, 0))
    img.save(ruta)
    return ruta


@pytest.fixture
def imagen_rgba(tmp_path):
    """Crea una imagen RGBA con transparencia."""
    ruta = tmp_path / "origen_rgba.png"
    img = Image.new("RGBA", (100, 100), color=(0, 255, 0, 128))
    img.save(ruta)
    return ruta


class TestObtenerFormatos:
    def test_retorna_lista_no_vacia(self) -> None:
        formatos = get_registry().list_formats()
        assert isinstance(formatos, list)
        assert "JPEG" in formatos
        assert "PNG" in formatos


class TestConvertirImagen:
    def test_convierte_png_a_jpeg(self, imagen_rgb, tmp_path) -> None:
        salida = tmp_path / "salida.jpg"
        resultado = convertir_imagen(imagen_rgb, salida, "JPEG", calidad=90)
        assert resultado == salida
        assert salida.exists()
        with Image.open(salida) as img:
            assert img.format == "JPEG"

    def test_convierte_rgba_a_jpeg_con_fondo_blanco(self, imagen_rgba, tmp_path) -> None:
        salida = tmp_path / "salida.jpg"
        convertir_imagen(imagen_rgba, salida, "JPEG")
        with Image.open(salida) as img:
            assert img.mode == "RGB"

    def test_redimensiona(self, imagen_rgb, tmp_path) -> None:
        salida = tmp_path / "salida.jpg"
        convertir_imagen(imagen_rgb, salida, "JPEG", resize=(50, 50))
        with Image.open(salida) as img:
            assert img.size == (50, 50)

    def test_mantiene_exif(self, tmp_path) -> None:
        # Crear imagen JPEG con EXIF real mínimo válido
        origen = tmp_path / "con_exif.jpg"
        img = Image.new("RGB", (10, 10))
        exif_bytes = b"Exif\x00\x00II\x2a\x00\x08\x00\x00\x00\x00\x00\x00\x00\x00\x00"
        img.save(origen, exif=exif_bytes)

        salida = tmp_path / "salida_exif.jpg"
        convertir_imagen(origen, salida, "JPEG", keep_exif=True)
        with Image.open(salida) as img:
            assert "exif" in img.info

    def test_calidad_limitada_rango(self, imagen_rgb, tmp_path) -> None:
        salida = tmp_path / "salida.jpg"
        convertir_imagen(imagen_rgb, salida, "JPEG", calidad=150)
        assert salida.exists()

    def test_archivo_no_existe(self, tmp_path) -> None:
        with pytest.raises(FileNotFoundError):
            convertir_imagen(tmp_path / "no_existe.jpg", tmp_path / "out.jpg", "JPEG")

    def test_formato_no_soportado(self, imagen_rgb, tmp_path) -> None:
        with pytest.raises(ValueError, match="Formato no soportado"):
            convertir_imagen(imagen_rgb, tmp_path / "out.xyz", "XYZ")

    def test_usa_encoder_registrado_por_plugin(self, imagen_rgb, tmp_path, monkeypatch) -> None:
        from backend.core import converter
        from backend.core.format_registry import FormatRegistry

        registry = FormatRegistry()

        def encoder(img, destino, formato, save_kwargs) -> None:
            Path(destino).write_text(
                f"{formato}:{img.mode}:{img.size[0]}x{img.size[1]}:{save_kwargs['quality']}",
                encoding="utf-8",
            )

        registry.add_format("TXTIMG", ".txt", ("RGB",), encoder=encoder)
        monkeypatch.setattr(converter, "_registry", registry)
        monkeypatch.setattr(converter, "FORMATOS_SOPORTADOS", registry)

        salida = tmp_path / "salida.txt"
        resultado = convertir_imagen(imagen_rgb, salida, "TXTIMG", calidad=77)

        assert resultado == salida
        assert salida.read_text(encoding="utf-8") == "TXTIMG:RGB:100x100:77"


# ─── perf-12: convertir_a_preview single resize ─────────────────────────────


def _decode_preview_uri(uri: str) -> Image.Image:
    raw = uri.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(raw)))


def _make_image(path: Path, size: tuple[int, int], stripes: bool = False) -> Path:
    if stripes:
        arr = np.zeros((size[1], size[0], 3), dtype=np.uint8)
        for x in range(size[0]):
            arr[:, x, :] = 255 if (x // 4) % 2 == 0 else 0
        Image.fromarray(arr, "RGB").save(path)
    else:
        Image.new("RGB", size, (200, 50, 80)).save(path)
    return path


def test_convertir_a_preview_resizes_once_when_resize_given(tmp_path, monkeypatch) -> None:
    """perf-12: when `resize` is provided, the preview must be produced with a
    single LANCZOS resize. The old code resized to 400px first and then resized
    again to `resize` — a double resample."""
    path = _make_image(tmp_path / "big.png", (1200, 800))
    calls: list[int] = []
    orig_resize = Image.Image.resize

    def counting_resize(self, *a, **kw):
        calls.append(1)
        return orig_resize(self, *a, **kw)

    monkeypatch.setattr(Image.Image, "resize", counting_resize)
    result = convertir_a_preview(path, "PNG", 85, resize=(800, 533))
    assert len(calls) == 1, f"expected a single resize, got {len(calls)}"
    with _decode_preview_uri(result["preview"]) as img:
        assert img.size == (800, 533)


def test_convertir_a_preview_without_resize_caps_at_400(tmp_path) -> None:
    """perf-12 regression guard: without `resize`, the 400px preview cap holds."""
    path = _make_image(tmp_path / "big.png", (1200, 800))
    result = convertir_a_preview(path, "PNG", 85)
    with _decode_preview_uri(result["preview"]) as img:
        assert img.size == (400, int(800 * 400 / 1200))
        assert max(img.size) <= 400


def test_convertir_a_preview_large_resize_is_sharper_than_double_resample(tmp_path) -> None:
    """perf-12: with resize > 400px, a single resize from the source is sharper
    than the old 400px-cap-then-upscale double resample (the issue's acceptance
    test). Verifies the fix removes the blurry upsampling path."""
    path = _make_image(tmp_path / "stripes.png", (1600, 1067), stripes=True)

    new_result = convertir_a_preview(path, "PNG", 85, resize=(800, 533))
    with _decode_preview_uri(new_result["preview"]) as nimg:
        new_arr = np.asarray(nimg.convert("L"), dtype=np.int32)

    with Image.open(path) as src:
        longest = max(src.size)
        ratio = min(400 / longest, 1.0)
        mid = src.resize((int(src.width * ratio), int(src.height * ratio)), Image.Resampling.LANCZOS)
        old = mid.resize((800, 533), Image.Resampling.LANCZOS)
    old_arr = np.asarray(old.convert("L"), dtype=np.int32)

    def sharpness(arr: np.ndarray) -> float:
        return float(np.abs(np.diff(arr, axis=1)).sum())

    assert sharpness(new_arr) > sharpness(old_arr), (
        "single resize from source should be sharper than 400px-then-upscale"
    )
