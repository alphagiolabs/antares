# perf-04 — Ubicaciones: export procesa filas en serie, sin paralelismo (P1)

**Severidad:** P1
**Área:** Backend / ubicaciones / batch

## Bottleneck

`handle_generar_ubicaciones` recorre el Excel con `df.iterrows()` y procesa cada fila **secuencialmente** (fetch de mapa + composición + guardado PDF), a diferencia del handler de conversión de imágenes que usa el `WorkScheduler` con heavy workers.

## Evidence (métrica)

- `backend/handlers/ubicaciones.py:856`:
  ```python
  for index, row in df.iterrows():
      ... render_imagen_ubicacion / fetch_static_map / compose / save PDF ...
  ```
- N filas con coords únicas → N ops costosas en serie. Cada fila = fetch de tiles (ver perf-03) + `PIL.Image` compose + `pypdf` save.
- `backend/handlers/conversion.py::_run_conversion_job` ya usa `scheduler.submit_heavy` con chunking y `SchedulerBusy`, demostrando que el patrón existe en la codebase.
- Los caches (`_get_cached_map_screenshot`, `_compose_and_cache_preview`) son thread-safe y se beneficiarían directamente de múltiples workers (mismo mapa → cache hit).

## Fix concreto que conserva funcionalidad

Mover el procesamiento por fila al `WorkScheduler` (`scheduler.submit_heavy`), preservando: orden de notificaciones de progreso (notificar al completar cada fila o por chunk), reporte de errores por fila, y el resultado agregado (PDFs generados + resumen). El guardado por archivo ya es independiente entre filas.

- Mantener la semántica de progreso actual: notificar % cada N filas o cada chunk (igual que conversion).
- Preservar el manejo de errores por fila (no abortar todo el batch por una fila con coords inválidas; ya se hace así en serie).
- Aprovechar el cache compartido: con coords repetidas entre filas, múltiples workers llenan/leen el LRU simultáneamente.

Reducción esperada: wall-time ~ N / min(heavy_workers, coords-únicas).

## Verificación

- Medir wall-time de export de un Excel de 50/200 filas con coords mixtas (únicas vs repetidas) antes/después.
- Test funcional: mismo set de PDFs generados + mismo reporte de filas-ok/filas-error que en serie.
