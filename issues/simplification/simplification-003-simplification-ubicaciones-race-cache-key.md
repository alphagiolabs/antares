# simplification-003 — Cerrar race condition de `_preview_excel_ctx` en `ubicaciones.py` (via cache_key)

## Skill
`code-review` (correctness, threading) + `simplification`

## Ubicación
`backend/handlers/ubicaciones.py`

```python
# Líneas ~41-49
_preview_excel_ctx: tuple[str, float] | None = None
_cache_lock = threading.Lock()
# …
def _sync_excel_context(excel_path: str) -> tuple[str, float]:
    global _preview_excel_ctx
    ctx = (excel_path, os.path.getmtime(excel_path))
    if _preview_excel_ctx != ctx:        # ← CHECK fuera del lock
        with _cache_lock:
            _preview_composed_cache.clear()
        _preview_excel_ctx = ctx          # ← WRITE fuera del lock
    return ctx
```

Llamado desde `handle_preview_ubicacion` (~línea 605) y por el thread daemon de prefetch (`_prefetch_alternate_formato`).

## Por qué es un problema (confirmado)
El propio comentario del código lo admite:

```python
# Guarda las caches mutadas desde el thread daemon de prefetch (B1): sin lock,
# _trim_cache + __setitem__ concurrentes pueden lanzar RuntimeError o corromper
# el orden LRU.
```

El check `if _preview_excel_ctx != ctx:` se hace FUERA del `_cache_lock`. Dos threads pueden leer ambos el valor stale, ambos decidir "limpia caché", y pisarse en el setter. Reducción de caché válida + posible `RuntimeError: dictionary changed size during iteration` en operaciones `del cache[next(iter(cache))]`.

## Verificación de consumers
`_sync_excel_context` y `_preview_excel_ctx` son internos de `ubicaciones.py` (no expuestos en `HANDLERS`). Solo `handle_preview_ubicacion` y `_prefetch_alternate_formato` los llaman. Cero consumidores externos.

## Propuesta (cambio mínimo, cierra el race + elimina estado global mutable)
Incorporar el mtime del Excel al cache_key de `_preview_composed_cache`:

1. En `_compose_and_cache_preview` y en `handle_preview_ubicacion`, reemplazar el cache_key actual:
   ```python
   composed_key = (_FOOTER_LAYOUT_VERSION, _MAP_CAPTURE_VERSION, excel_ctx, row_index, formato)
   ```
   por:
   ```python
   composed_key = (_FOOTER_LAYOUT_VERSION, _MAP_CAPTURE_VERSION, row_index, formato, excel_mtime)
   ```
   donde `excel_mtime` es el float que ya venga dentro de `excel_ctx` (tuple `(path, mtime)`).

2. Eliminar la función `_sync_excel_context` Y el global `_preview_excel_ctx`.

3. En `handle_preview_ubicacion`, en lugar de `excel_ctx = _sync_excel_context(excel_path)`:
   ```python
   excel_mtime = os.path.getmtime(excel_path)
   excel_ctx = (excel_path, excel_mtime)   # solo usado como parte del key
   ```

Cuando el Excel cambia en disco, `mtime` cambia → el key cambia → las entradas viejas quedan orphan + eviction automática por `_trim_cache(_MAX_COMPOSED_CACHE)`. Invalidation implícita sin estado mutable compartido.

## Cambio de comportamiento
Ninguno observable en el frontend. La preview sigue regenerándose cuando el Excel cambia (ahora vía key change en vez de `.clear()`). La respuesta `data: {image, cod_componente, …}` es idéntica byte-a-byte.

Detalle: las entradas orphan (Excel cambiado → key viejo sin .clear) ocupan espacio en la caché hasta evicción LRU. Antes se limpiaban de inmediato. Con `_MAX_COMPOSED_CACHE = 80` y la baja frecuencia de mutación de Excel, esta es acceptable. Si fuera preocupante, agregar thread daemon cleanup opcional — pero no es necesario.

## Riesgo de migración
Bajo. Sin cambio de contrato IPC. Tests `test_ubicaciones_*.py` validan la composición, no la caché interna.

## Verificación
```bash
cd backend && python -m pytest ../tests/test_ubicaciones_compose.py ../tests/test_ubicaciones_static_map.py -v
```

Ambos tests importan funciones puras de composición (`_compose_ubicacion_image`, `fetch_static_map`), no el estado de `_preview_excel_ctx`. Pasarán sin modificación.
