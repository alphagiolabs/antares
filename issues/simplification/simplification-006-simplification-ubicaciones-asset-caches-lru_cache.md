# simplification-006 — Reemplazar caches de assets en `ubicaciones.py` con `functools.lru_cache`

## Skill
`simplification` + `performance`

## Ubicación
`backend/handlers/ubicaciones.py`

```python
# Líneas ~36-49
_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont | ImageFont.ImageFont] = {}
_footer_cache: dict[tuple[int, int, int], Image.Image | None] = {}
# …
_pin_cache: Image.Image | None = None

def _get_font(bold: bool, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    key = ("arialbd" if bold else "arial", size)
    if key not in _font_cache:
        # …
    return _font_cache[key]

def _get_footer_image(width: int, height: int) -> Image.Image | None:
    key = (_FOOTER_LAYOUT_VERSION, width, height)
    if key not in _footer_cache:
        # …
    return _footer_cache[key]

def _get_pin_rgba() -> Image.Image | None:
    global _pin_cache
    if _pin_cache is None:
        # …
    return _pin_cache
```

## Por qué es un problema
1. Tres caches de assets hechos a mano con dict + check-then-set. Sin evicción (`_font_cache` y `_footer_cache` crecen sin límite).
2. `_get_pin_rgba` usa global mutable `_pin_cache` para "pre-cargar una vez" — equivalente exacto a `@lru_cache(maxsize=1)`.
3. `functools.lru_cache` ya resuelve lookup + eviction + thread-safety (la caché interna es thread-safe bajo CPython GIL).

## Verificación de consumers
- `_get_font`, `_get_footer_image`, `_get_pin_rgba` son internas a `ubicaciones.py`. Solo llamadas desde `_compose_ubicacion_image`.
- Tests `test_ubicaciones_*.py` no parchean estas funciones — parchean (`_resolve_provider`, `_fetch_osm_tiles_map` en `test_ubicaciones_static_map.py` verificación abajo).

`grep "_get_font\|_get_footer\|_get_pin" tests/` → sin resultados.

## Propuesta
Reemplazar por `@lru_cache` decorador:

```python
import functools

@functools.lru_cache(maxsize=32)  # pares finitos (bold × size)
def _get_font(bold: bool, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    key = ("arialbd" if bold else "arial", size)
    # … (cuerpo idéntico, sin check-then-set)
    return _font_cache[key]    # ← borrar esta línea, return directo

@functools.lru_cache(maxsize=16)  # layouts finitos (version × w × h)
def _get_footer_image(width: int, height: int) -> Image.Image | None:
    # … (cuerpo idéntico, sin check-then-set)
    return footer

@functools.lru_cache(maxsize=1)
def _get_pin_rgba() -> Image.Image | None:
    pin_path = os.path.join(resource_path("assets/ubicaciones"), "pin.png")
    if os.path.exists(pin_path):
        return Image.open(pin_path).convert("RGBA")
    return None
```

Borrar `_font_cache`, `_footer_cache`, `_pin_cache` globales.

## Cambio de comportamiento
Ninguno observable. Los assets devueltos son idénticos. La caché sigue siendo in-memory + proceso-local. `lru_cache` eviciona en orden LRU cuando se llena — mejor que la actual (que no evictaba).

Detalle: `lru_cache` requiere que los args TODOS sean hashable. `bold: bool`, `size: int`, `width: int`, `height: int`, sin args → OK.

## Riesgo de migración
Bajo. Las funciones son puras (cargan archivos estáticos del bundle).

## Verificación
```bash
cd backend && python -m pytest ../tests/test_ubicaciones_compose.py ../tests/test_ubicaciones_static_map.py -v
```

`test_ubicaciones_compose.py` valida que `_compose_ubicacion_image` produce bytes estables — pasará sin tocar tests.
