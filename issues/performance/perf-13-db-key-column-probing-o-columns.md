# perf-13 — Detección de columna clave: O(columnas) queries de probing (P3)

**Severidad:** P3
**Área:** Backend / data / conversión

## Bottleneck

`_detect_best_key_column` / `_resolve_key_column` / `db_detect_key_column` emiten una consulta SQLite por cada columna candidata, serializadas por `_db_lock` (perf-06). Ocurre en cada `preview`/`process_start` cuando la columna clave no está definida.

## Evidence (métrica)

- `backend/handlers/conversion.py:134-144, 186-200, 796-805`: iteran sobre `db_columns` (todas las columnas de `imagenes`) y llaman `buscar_por_columna(search_keys, col)` **por cada columna**.
- Cada `buscar_por_columna` adquiere `_db_lock` y arma un `IN (...)` (chunked si hay muchos `search_keys`).
- Para C columnas → C queries seriales, cada una con su propio lock acquire/release.

## Fix concreto que conserva funcionalidad

**Opción A — una sola query OR multi-columna**: construir un `SELECT … WHERE col1 IN (...) OR col2 IN (…) OR …` (respetando el límite de 999 parámetros de SQLite con chunking, igual que `buscar_lote_por_codigos`) y contar matches por columna en una pasada. Conserva la heurística actual (columna con más matches = mejor), solo colapsa C queries en 1.

**Opción B — caché por (esquema + stems de archivos)**: cachear el resultado de la detección para un hash de `{columnas, stems de los archivos de entrada}`; reutilizarlo entre `preview` y `process_start` del mismo batch (hoy se recomputea). Invaliar si cambia el esquema.

Ambas conservan la funcionalidad de auto-detección y la firma del handler. A 推荐 A por menor estado.

## Verificación

- Medir: `preview` con un Excel de 100 archivos y C=20 columnas — contar `execute_query` antes (≈20) vs después (≈1) y medir wall-time.
- Test funcional: misma columna detectada que hoy para un caso conocido.
