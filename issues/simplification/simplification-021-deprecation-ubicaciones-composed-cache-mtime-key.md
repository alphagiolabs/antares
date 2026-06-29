# simplification-021 — Reemplazar `_preview_excel_ctx` global mutable en `ubicaciones.py` (consolidación con 003)

## Skill
`code-review` (correctness, threading) + `deprecation`

> **DUPLICADO intencional con 003.** Este issue es la versión más grande: cuando se aplique 003 (Quick Win que mueve mtime a cache_key), la mayor parte del estado mutable desaparece. Si después se hace 016 (split en `core/ubicaciones/`), este issue colapsa con `cache.py` en ese paquete. Listado aquí para que no quede el global mutable sin un issue dedicado.

## Ubicación
`backend/handlers/ubicaciones.py`

```python
_preview_excel_ctx: tuple[str, float] | None = None
_excel_cache: dict[str, tuple[float, pd.DataFrame, tuple[Any, ...]]] = {}
# Globales mutables accedidas desde thread daemon de prefetch SIN lock consistente
```

## Verificación (igual a 003)
Race condition reconocido por el propio código:
```python
# Comentario del code line ~46:
# Guarda las caches mutadas desde el thread daemon de prefetch (B1): sin lock,
# _trim_cache + __setitem__ concurrentes pueden lanzar RuntimeError o corromper
# el orden LRU.
```

El thread daemon de prefetch es lanzado por `handle_preview_ubicacion` (línea ~638):
```python
threading.Thread(
    target=_prefetch_alternate_formato,
    args=(excel_ctx, row_index, formato, datos, lat, lon, len(df)),
    daemon=True,
).start()
```

El daemon accede a `_preview_composed_cache`, `_map_screenshot_cache`, `_excel_cache` con `_cache_lock` SÓLO en algunas funciones.

## Propuesta (resumen; ver 003 para detalle)
1. Eliminar `_preview_excel_ctx` global → mover mtime dentro del cache_key.
2. Eliminar `_sync_excel_context` función.
3. Si se aplica 016 (split), encapsular `_map_screenshot_cache`, `_preview_composed_cache`, `_excel_cache` en clase `UbicacionesCache` con métodos thread-safe.
4. Usar `functools.lru_cache` para `_font_cache`, `_footer_cache`, `_pin_cache` (ver 006).

## Cambio de comportamiento
Ninguno. Ver 003.

## Riesgo
Medio (caché central, mucho I/O de ubicaciones). Ver detalles en 003 + 016.

## Verificación
```bash
cd backend && python -m pytest ../tests/test_ubicaciones_compose.py ../tests/test_ubicaciones_static_map.py -v
```

Manual: lanzar UI, generar 3 previews de ubicaciones diferentes, modificar el Excel, generar de nuevo → el segundo ciclo debe mostrar los previews refrescados (no cacheados).
