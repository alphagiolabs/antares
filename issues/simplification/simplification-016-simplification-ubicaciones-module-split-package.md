# simplification-016 — Romper `ubicaciones.py` (750 líneas) en subpaquete `core/ubicaciones/`

## Skill
`code-review` (architecture) + `simplification`

## Ubicación
`backend/handlers/ubicaciones.py` (910 líneas, 36KB, el archivo más grande del backend)

## Por qué es un problema
Un único archivo mezcla 4 responsabilidades distintas:

1. **HTTP fetch de mapas** (`_fetch_osm_tiles_map`, `_fetch_google_static_map`, `_lonlat_to_webmercator_pixel`, `_http_get`, `_cap_fetch_size`, `_resolve_provider`, `_resolve_google_key`, `fetch_static_map`, `_fallback_map_bytes`, `_trim_map_gutters`, `_center_crop_to_aspect`, `_normalize_map_screenshot`, `_screenshot_has_map_tiles`, `_is_gutter_pixel`, `_column_is_gutter`, `_row_is_gutter`)
2. **Composición con Pillow** (`_compose_ubicacion_image`, `_encode_preview_data`, `_compose_and_cache_preview`, `_prefetch_alternate_formato`, `render_ubicacion`, `render_imagen_ubicacion`, `generar_imagen_ubicacion`, `_get_font`, `_get_footer_image`, `_get_pin_rgba`, `_crop_footer_bar`, `_measure_footer_band_height`, `_dimensions_for`, `_map_capture_size`)
3. **Cachés mutables globales** + LRU (`_font_cache`, `_footer_cache`, `_excel_cache`, `_map_screenshot_cache`, `_preview_composed_cache`, `_preview_excel_ctx`, `_cache_lock`, `_trim_cache`, `_sync_excel_context`)
4. **Excel parse** (`_load_excel_data`, `_parse_excel_columns`, `_extract_row_data`)
5. **Handlers IPC** (`handle_preview_ubicacion`, `handle_generar_ubicaciones`)

5 responsabilidades en un archivo = Single Responsibility violado × 5. Las caches globales mutables (`_preview_excel_ctx`, `_excel_cache`, etc.) son accedidas por el thread daemon de prefetch con race conditions conocidas (ver 003). Imposible testear solo compose sin tocar HTTP.

## Verificación de consumers
- `HANDLERS["generar_ubicaciones"]`, `HANDLERS["preview_ubicacion"]` registrados y consumidos por `ipc-methods.js`.
- Tests `tests/test_ubicaciones_compose.py` → importa funciones de composición.
- Tests `tests/test_ubicaciones_static_map.py` → importa `from backend.handlers import ubicaciones as ub` y patches `_resolve_provider`, `_fetch_osm_tiles_map`.

La verificación CRÍTICA: los tests acceden `ub._resolve_provider` y `ub._fetch_osm_tiles_map` (atributos del módulo). El split debe PRESERVAR un modulo `ubicaciones` con esos nombres como alias / re-exports, o los tests fallan:

```python
# backend/handlers/ubicaciones.py (post-split, archivo slim)
from backend.core.ubicaciones.handlers import handle_preview_ubicacion, handle_generar_ubicaciones

# Re-export atributos que tests parchean directamente:
from backend.core.ubicaciones.map_provider import _resolve_provider, _fetch_osm_tiles_map, fetch_static_map, _fallback_map_bytes  # noqa: F401
from backend.core.ubicaciones.composer import _compose_ubicacion_image, _get_pin_rgba, _get_font  # noqa: F401

HANDLERS = {
    "generar_ubicaciones": handle_generar_ubicaciones,
    "preview_ubicacion": handle_preview_ubicacion,
}
```

Esto garantiza que `ub._resolve_provider` sigue resolvible para `monkeypatch.setattr(ub, "_resolve_provider", …)`.

## Propuesta
Estructura target:

```
backend/core/ubicaciones/
├── __init__.py
├── map_provider.py      # fetch_static_map + OSM/Google + caches de screenshots
├── composer.py          # _compose_ubicacion_image + _get_font/_get_footer_image/_get_pin_rgba (ver 006 para caches)
├── cache.py             # UbicacionesCache singleton (thread-safe LRU para composed + excel)
├── parsers.py           # _parse_excel_columns, _load_excel_data, _extract_row_data
└── handlers.py          # handle_preview_ubicacion, handle_generar_ubicaciones
```

Y el original `handlers/ubicaciones.py` queda como shim slim (ver snippet arriba) que re-exporta los parcheables para compat con tests. Comentario en el shim:

```python
"""Shim: full implementation moved to backend.core.ubicaciones.

This file exists so that tests which do `from backend.handlers import ubicaciones as ub`
and then `monkeypatch.setattr(ub, "_resolve_provider", ...)` continue to work —
those re-exports must remain in place until tests are migrated.
"""
```

## Cambio de comportamiento
Ninguno runtime. Las clases consumidoras (`handlers/__init__.py` que hace `from backend.handlers.ubicaciones import HANDLERS`) siguen encontrando los handlers vía el shim.

## Pasos de migración
1. Crear el subpaquete `backend/core/ubicaciones/` con los 5 módulos + `__init__.py`.
2. Mover `cache.py` primero (cambiar caches globales a clase `UbicacionesCache` singleton, ver también 003 + 006).
3. Mover `map_provider.py` (cambiar las caches globales de screenshot por métodos del singleton).
4. Mover `composer.py` (puro, sin estado; sus assets caches via 006).
5. Mover `parsers.py`.
6. Mover `handlers.py` (orchestrate map + compose).
7. Reducir `handlers/ubicaciones.py` a shim con re-exports de los atributos parcheables.

## Riesgo de migración
Medio-alto. ~900 líneas reorganizadas. Tests parchean atributos internos — los aliases de compat deben mantenerse EXACTOS.

## Verificación
```bash
cd backend && python -m pytest ../tests/test_ubicaciones_compose.py ../tests/test_ubicaciones_static_map.py -v
ruff check backend/core/ubicaciones/ backend/handlers/ubicaciones.py
mypy backend
```

`test_ubicaciones_static_map.py` hace `monkeypatch.setattr(ub, "_resolve_provider", lambda: "osm")` y `monkeypatch.setattr(ub, "_fetch_osm_tiles_map", fake)`. Después del split, `ub._resolve_provider` debe seguir existiendo (re-exportado).

Manual: lanzar UI, ir a pestaña Ubicaciones, cargar un Excel con coordenadas, generar previews y PDFs → deben ser visualmente idénticos.

## Opción descartada
Borrar el shim y forzar migración de los tests (cambiar `ub.` por rutas nuevas). Descartado por restricción "tests sin modificar".
