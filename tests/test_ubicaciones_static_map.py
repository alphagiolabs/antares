"""Tests para el provider de mapas estáticos (reemplazo de Playwright)."""

from io import BytesIO

import pytest
from PIL import Image

from backend.handlers import ubicaciones as ub


def _png_bytes(size: tuple[int, int], color: tuple[int, int, int] = (70, 130, 180)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


class TestProviderResolution:
    def test_default_is_osm(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("ANTARES_MAP_PROVIDER", raising=False)
        assert ub._resolve_provider(None) == "osm"

    def test_env_overrides_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("ANTARES_MAP_PROVIDER", "google")
        assert ub._resolve_provider(None) == "google"

    def test_payload_overrides_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("ANTARES_MAP_PROVIDER", "google")
        assert ub._resolve_provider({"provider": "osm"}) == "osm"

    def test_lowercased(self) -> None:
        assert ub._resolve_provider({"provider": "GOOGLE"}) == "google"


def test_resolve_google_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTARES_GOOGLE_MAPS_KEY", raising=False)
    assert ub._resolve_google_key(None) is None
    assert ub._resolve_google_key({"google_maps_key": "abc"}) == "abc"
    monkeypatch.setenv("ANTARES_GOOGLE_MAPS_KEY", "envkey")
    assert ub._resolve_google_key(None) == "envkey"
    # payload wins over env
    assert ub._resolve_google_key({"google_maps_key": "pk"}) == "pk"


class TestCapFetchSize:
    def test_no_upscale_when_under_cap(self) -> None:
        assert ub._cap_fetch_size(600, 800) == (600, 800)

    def test_caps_long_side_preserving_aspect(self) -> None:
        w, h = ub._cap_fetch_size(2480, 3386)
        assert max(w, h) <= ub._MAP_FETCH_MAX_DIM
        # aspect preserved within rounding
        assert w / h == pytest.approx(2480 / 3386, rel=0.01)

    def test_never_zero(self) -> None:
        w, h = ub._cap_fetch_size(1, 1)
        assert w >= 1 and h >= 1


def test_lonlat_to_webmercator_pixel_origin() -> None:
    # Web Mercator: (lon=-180, lat~0) maps to x=0; lat=0 maps to y = n*128.
    x, y = ub._lonlat_to_webmercator_pixel(-180.0, 0.0, 0)
    assert x == pytest.approx(0.0, abs=1e-3)
    assert y == pytest.approx(128.0, abs=1e-3)


def test_fetch_static_map_osm_returns_image(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTARES_MAP_PROVIDER", "osm")
    tile = _png_bytes((ub._OSM_TILE_SIZE, ub._OSM_TILE_SIZE), (60, 120, 160))
    monkeypatch.setattr(ub, "_http_get", lambda url, headers, timeout=ub._HTTP_TIMEOUT: tile)

    data = ub.fetch_static_map(-12.046, -77.042, 800, 600, zoom=18, provider="osm")
    img = Image.open(BytesIO(data))
    assert img.size == ub._cap_fetch_size(800, 600)
    # A real (colored) map passes the tiles heuristic.
    assert ub._screenshot_has_map_tiles(data)


def test_fetch_static_map_fallback_on_http_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ub, "_http_get", lambda *a, **k: None)
    data = ub.fetch_static_map(-12.0, -77.0, 800, 600, zoom=18, provider="osm")
    img = Image.open(BytesIO(data))
    fw, fh = ub._cap_fetch_size(800, 600)
    assert img.size == (fw, fh)
    # Uniform gray placeholder does NOT pass the tiles heuristic.
    assert not ub._screenshot_has_map_tiles(data)


def test_fetch_static_map_google_without_key_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    data = ub.fetch_static_map(-12.0, -77.0, 800, 600, zoom=18, provider="google", google_key=None)
    assert not ub._screenshot_has_map_tiles(data)


def test_fetch_static_map_google_with_key(monkeypatch: pytest.MonkeyPatch) -> None:
    called: dict[str, str] = {}

    def fake_get(url, headers, timeout=ub._HTTP_TIMEOUT):
        called["url"] = url
        return _png_bytes((640, 640), (90, 140, 190))

    monkeypatch.setattr(ub, "_http_get", fake_get)
    data = ub.fetch_static_map(-12.0, -77.0, 800, 600, zoom=18, provider="google", google_key="TESTKEY")
    assert "maps.googleapis.com" in called["url"]
    assert "key=TESTKEY" in called["url"]
    assert ub._screenshot_has_map_tiles(data)
