"""Tests de composición UBICACIONES (sin Playwright)."""

from io import BytesIO

import pytest
from PIL import Image

from backend.handlers.ubicaciones import (
    _BG_RGB,
    _PIN_TIP_RATIO,
    _REF_LAYOUT,
    _compose_ubicacion_image,
    _crop_footer_bar,
    _dimensions_for,
    _fetch_osm_tiles_map,
    _is_gutter_pixel,
    _map_cache_key,
    _map_capture_size,
    _measure_footer_band_height,
    _normalize_map_screenshot,
)
from backend.utils.paths import resource_path


def _fake_map_png(width: int, height: int, color: tuple[int, int, int] = (80, 120, 160)) -> bytes:
    img = Image.new("RGB", (width, height), color)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


SAMPLE_DATOS = {
    "cod_componente": "RA-10",
    "direccion": "Ca Monshe Ben Maimon Mmaimonides,448",
    "localidad": "Urb Country Club",
    "distrito": "San Juan de Lurigancho",
    "lat": -12.0,
    "lon": -77.0,
}


@pytest.mark.parametrize("formato", ["vertical", "horizontal"])
def test_dimensions_preview_matches_export_proportions(formato: str) -> None:
    export = _dimensions_for(formato, preview=False)
    preview = _dimensions_for(formato, preview=True)
    assert export[2] / export[1] == pytest.approx(preview[2] / preview[1], abs=0.002)


@pytest.mark.parametrize("formato", ["vertical", "horizontal"])
def test_map_capture_size_matches_compose_map_area(formato: str) -> None:
    for preview in (False, True):
        out_w, out_h, footer_h = _dimensions_for(formato, preview=preview)
        cap = _map_capture_size(formato, preview=preview)
        assert cap == (out_w, out_h - footer_h)


@pytest.mark.parametrize("formato", ["vertical", "horizontal"])
def test_compose_output_dimensions(formato: str) -> None:
    cap_w, cap_h = _map_capture_size(formato, preview=False)
    img = _compose_ubicacion_image(
        SAMPLE_DATOS,
        formato,
        _fake_map_png(cap_w, cap_h),
        preview=False,
    )
    expected = _dimensions_for(formato, preview=False)
    assert img.size == (expected[0], expected[1])


@pytest.mark.parametrize("formato", ["vertical", "horizontal"])
def test_compose_preview_dimensions(formato: str) -> None:
    cap_w, cap_h = _map_capture_size(formato, preview=True)
    img = _compose_ubicacion_image(
        SAMPLE_DATOS,
        formato,
        _fake_map_png(cap_w, cap_h),
        preview=True,
    )
    expected = _dimensions_for(formato, preview=True)
    assert img.size == (expected[0], expected[1])


@pytest.mark.parametrize("formato", ["vertical", "horizontal"])
def test_footer_is_black_without_map_strip(formato: str) -> None:
    cap_w, cap_h = _map_capture_size(formato, preview=False)
    # Mapa distinto del footer para detectar franjas de mapa bajo la barra
    map_bytes = _fake_map_png(cap_w, cap_h, (100, 150, 200))
    img = _compose_ubicacion_image(SAMPLE_DATOS, formato, map_bytes, preview=False)
    out_w, out_h, footer_h = _dimensions_for(formato, preview=False)
    map_h = out_h - footer_h

    # Borde superior del footer: negro en los extremos
    left = img.getpixel((0, map_h))
    right = img.getpixel((out_w - 1, map_h))
    assert sum(left) < 80
    assert sum(right) < 80

    # Fila inmediatamente encima del footer: tono del mapa (no negro puro)
    above = img.getpixel((out_w // 2, map_h - 1))
    assert sum(above) > 150


def test_crop_footer_bar_removes_map_preview_strip() -> None:
    footer_path = resource_path("assets/ubicaciones/footer_horizontal.png")
    original = Image.open(footer_path)
    cropped = _crop_footer_bar(original)
    assert cropped.height <= original.height
    # PNG legacy incluía mapa debajo (~260px); el repo usa barra negra ~133px.
    assert cropped.height <= max(original.height, 260) * 0.55


@pytest.mark.parametrize("formato", ["vertical", "horizontal"])
def test_pin_is_within_map_area(formato: str) -> None:
    cap_w, cap_h = _map_capture_size(formato, preview=False)
    img = _compose_ubicacion_image(
        SAMPLE_DATOS,
        formato,
        _fake_map_png(cap_w, cap_h),
        preview=False,
    )
    out_w, out_h, footer_h = _dimensions_for(formato, preview=False)
    map_h = out_h - footer_h
    pin_scale = float(_REF_LAYOUT[formato]["pin_scale"])
    pin_w = int(out_w * pin_scale)
    pin_y = (map_h // 2) - int(pin_w * _PIN_TIP_RATIO)
    assert 0 <= pin_y < map_h
    center_x = out_w // 2
    assert img.getpixel((center_x, pin_y + pin_w // 2)) != _BG_RGB


def test_ref_layout_horizontal_matches_reference_jpg() -> None:
    spec = _REF_LAYOUT["horizontal"]
    assert spec["out_w"] == 3508
    assert spec["out_h"] == 2480
    assert spec["footer_h"] == 135


def test_ref_layout_vertical_a4_aspect() -> None:
    spec = _REF_LAYOUT["vertical"]
    assert spec["out_w"] / spec["out_h"] == pytest.approx(2480 / 3508, rel=0.001)
    assert spec["footer_h"] / spec["out_h"] == pytest.approx(122 / 3508, rel=0.01)


@pytest.mark.parametrize("formato,max_ratio", [("vertical", 0.05), ("horizontal", 0.06)])
def test_footer_not_oversized(formato: str, max_ratio: float) -> None:
    _, out_h, footer_h = _dimensions_for(formato, preview=False)
    assert footer_h / out_h < max_ratio


def test_footer_logo_fills_bar_width() -> None:
    cap_w, cap_h = _map_capture_size("vertical", preview=False)
    img = _compose_ubicacion_image(
        SAMPLE_DATOS,
        "vertical",
        _fake_map_png(cap_w, cap_h),
        preview=False,
    )
    out_w, out_h, footer_h = _dimensions_for("vertical", preview=False)
    map_h = out_h - footer_h
    row_y = map_h + footer_h // 2
    xs = [x for x in range(out_w) if max(img.getpixel((x, row_y))) > 30]
    assert xs, "footer row should contain logo pixels"
    assert (max(xs) - min(xs)) >= out_w * 0.08
    assert max(img.getpixel((out_w // 2, row_y))) > 100


def test_measure_footer_band_height_matches_reference_templates() -> None:
    assets = resource_path("assets/ubicaciones")
    vertical_band = _measure_footer_band_height(f"{assets}/vertical.jpg")
    horizontal_band = _measure_footer_band_height(f"{assets}/Horizontal.jpg")
    assert vertical_band == pytest.approx(52, abs=5)
    assert horizontal_band == pytest.approx(135, abs=5)
    assert round(vertical_band / 1491 * 3508) == pytest.approx(int(_REF_LAYOUT["vertical"]["footer_h"]), abs=3)


def test_normalize_map_screenshot_trims_left_gutter() -> None:
    combined = Image.new("RGB", (400, 200), (244, 251, 252))
    map_part = Image.new("RGB", (320, 200), (100, 150, 200))
    combined.paste(map_part, (80, 0))
    buf = BytesIO()
    combined.save(buf, format="PNG")
    normalized = _normalize_map_screenshot(buf.getvalue(), 320, 200)
    result = Image.open(BytesIO(normalized))
    assert result.size == (320, 200)
    assert not _is_gutter_pixel(*result.getpixel((0, 100)))
    assert result.getpixel((0, 100)) == (100, 150, 200)


def test_map_cache_key_differs_by_resolution() -> None:
    preview_key = _map_cache_key(-12.0, -77.0, "vertical", preview=True)
    export_key = _map_cache_key(-12.0, -77.0, "vertical", preview=False)
    assert preview_key != export_key


def test_compose_skips_resize_when_map_size_matches(monkeypatch: pytest.MonkeyPatch) -> None:
    out_w, out_h, footer_h = _dimensions_for("vertical", preview=False)
    map_h = out_h - footer_h
    resize_sizes: list[tuple[int, int]] = []
    original_resize = Image.Image.resize

    def tracked_resize(self, *args, **kwargs):
        size = args[0] if args else kwargs.get("size")
        if isinstance(size, tuple):
            resize_sizes.append(size)
        return original_resize(self, *args, **kwargs)

    monkeypatch.setattr(Image.Image, "resize", tracked_resize)
    _compose_ubicacion_image(
        SAMPLE_DATOS,
        "vertical",
        _fake_map_png(out_w, map_h),
        preview=False,
    )
    assert (out_w, map_h) not in resize_sizes


# --- perf-03: parallel OSM tile fetch -------------------------------------------------


class _RecordingExecutor:
    """Fake ThreadPoolExecutor that records max_workers and runs ``map``
    synchronously so the test is deterministic (no real threads / network).
    Proves the parallel code path is used with a bounded worker count."""

    def __init__(self, max_workers: int | None = None, **_kwargs: object) -> None:
        self.max_workers = max_workers
        self.map_calls = 0

    def __enter__(self) -> "_RecordingExecutor":
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def map(self, fn, iterable):
        self.map_calls += 1
        for item in iterable:
            yield fn(item)


def _red_tile_png() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (256, 256), (255, 0, 0)).save(buf, format="PNG")
    return buf.getvalue()


def test_fetch_osm_tiles_map_uses_bounded_pool_and_covers_viewport(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """perf-03: tiles are fetched via a bounded ThreadPoolExecutor and composited
    identically to the serial path (full coverage of a fully-valid viewport)."""
    red = _red_tile_png()
    calls: list[str] = []

    def fake_http_get(url: str, headers: dict[str, str]) -> bytes:
        calls.append(url)
        return red

    created: list[_RecordingExecutor] = []

    def factory(*a: object, **k: object) -> _RecordingExecutor:
        ex = _RecordingExecutor(*a, **k)  # type: ignore[arg-type]
        created.append(ex)
        return ex

    monkeypatch.setattr("backend.handlers.ubicaciones._http_get", fake_http_get)
    monkeypatch.setattr("backend.handlers.ubicaciones.ThreadPoolExecutor", factory)

    # lat=0, lon=0, zoom=2, 512x512 → 3x3 grid of valid tiles (n=4, ty in [1,3]).
    img = _fetch_osm_tiles_map(0.0, 0.0, 512, 512, 2)

    assert img.size == (512, 512)
    assert len(created) == 1 and created[0].map_calls == 1, "tiles must go through the pool, not a serial loop"
    assert created[0].max_workers is not None and created[0].max_workers <= 8, "worker cap (OSM policy)"
    assert len(calls) == 9, f"expected 9 tile fetches (3x3 grid), got {len(calls)}"
    # Full coverage: every pixel is the red tile (no gray holes from a missed paste).
    assert img.convert("RGB").getcolors() == [(512 * 512, (255, 0, 0))]


def test_fetch_osm_tiles_map_preserves_failed_tile_as_gray(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """perf-03: a failed tile (None) is skipped → the gray canvas background shows
    through, exactly as the serial version did (failure path preserved)."""
    red = _red_tile_png()
    state = {"n": 0}

    def fake_http_get(url: str, headers: dict[str, str]):
        state["n"] += 1
        return None if state["n"] == 1 else red

    monkeypatch.setattr("backend.handlers.ubicaciones._http_get", fake_http_get)
    monkeypatch.setattr("backend.handlers.ubicaciones.ThreadPoolExecutor", lambda *a, **k: _RecordingExecutor(*a, **k))

    img = _fetch_osm_tiles_map(0.0, 0.0, 512, 512, 2).convert("RGB")
    color_set = {c for _, c in img.getcolors()}
    assert (218, 218, 218) in color_set, "failed tile should leave the gray canvas background"
    assert (255, 0, 0) in color_set, "other tiles should still paste"


# --- perf-04: ubicaciones export dispatches rows via WorkScheduler -------------------


def test_handle_generar_ubicaciones_dispatches_rows_via_scheduler(tmp_path, monkeypatch) -> None:
    """perf-04: handle_generar_ubicaciones dispatches each valid row to the
    WorkScheduler heavy lane (not a serial loop), skips NaN rows, preserves row
    order (consolidado page order), and writes one PDF per row in per-file mode."""
    from concurrent.futures import Future
    from pathlib import Path

    import pandas as pd

    from backend.handlers import ubicaciones as ub

    df = pd.DataFrame(
        [
            {"cod_componente": "C1", "latitud": 0.0, "longitud": 0.0},
            {"cod_componente": "C2", "latitud": float("nan"), "longitud": 0.0},
            {"cod_componente": "C3", "latitud": 1.0, "longitud": 1.0},
        ]
    )
    excel_path = tmp_path / "in.xlsx"
    df.to_excel(excel_path, index=False, engine="openpyxl")

    submitted = []

    class _SyncScheduler:
        def submit_heavy(self, fn, *args, **kwargs):
            submitted.append(args[0] if args else None)
            fut = Future()
            try:
                fut.set_result(fn(*args))
            except Exception as exc:
                fut.set_exception(exc)
            return fut

    render_order = []

    def fake_render(d, formato, map_opts=None):
        render_order.append(d["cod_componente"])
        return Image.new("RGB", (10, 10), (12, 34, 56))

    def fake_generar(d, out_path, formato, map_opts=None):
        render_order.append(d["cod_componente"])
        Path(out_path).write_bytes(b"%PDF-1.4 placeholder")

    monkeypatch.setattr(ub, "get_scheduler", lambda: _SyncScheduler())
    monkeypatch.setattr(ub, "render_imagen_ubicacion", fake_render)
    monkeypatch.setattr(ub, "generar_imagen_ubicacion", fake_generar)

    out_dir = tmp_path / "out"
    result = ub.handle_generar_ubicaciones({
        "excelPath": str(excel_path),
        "outputDir": str(out_dir),
        "formato": "vertical",
        "consolidado": False,
    })
    assert result["success"] is True
    assert result["data"]["generados"] == 2
    assert len(submitted) == 2, "each valid row must go through submit_heavy (perf-04)"
    assert render_order == ["C1", "C3"], "NaN row skipped, order preserved"
    assert (out_dir / "C1.pdf").exists() and (out_dir / "C3.pdf").exists()
    assert not (out_dir / "C2.pdf").exists()

    submitted.clear()
    render_order.clear()
    out_dir2 = tmp_path / "out2"
    result2 = ub.handle_generar_ubicaciones({
        "excelPath": str(excel_path),
        "outputDir": str(out_dir2),
        "formato": "vertical",
        "consolidado": True,
    })
    assert result2["success"] is True
    assert result2["data"]["generados"] == 2
    assert len(submitted) == 2
    assert render_order == ["C1", "C3"], "consolidado must preserve row order"
    assert (out_dir2 / "ubicaciones_consolidado.pdf").exists()
