# perf-07 — Technical reports: persistencia en JSON único con rewrite completo (P2)

**Severidad:** P2
**Área:** Backend / data / escalabilidad

## Bottleneck

Los informes técnicos se persisten en un **archivo JSON único** (`technical_reports.json`). Cada escritura reescribe el archivo entero; cada listado carga+normalizea todos los ítems en Python y filtra/ordena en memoria. Escala O(N) por edit y O(N) por list.

## Evidence (métrica)

- `backend/core/technical_reports/database.py`: `TechnicalReportsDB.__init__` carga todo el JSON a `self._items` (dict en memoria).
- `_save()` serializa **todo** `self._items` y reescribe el archivo en cada `create`/`update`/`delete`/`clear_all`/`replace_all`.
- `get_all()` construye una **nueva lista** de `TechnicalReport.normalize(...)` por cada llamada, aunque los datos no hayan cambiado.
- `backend/handlers/technical_reports.py::technical_reports_list` llama `get_all()` y luego filtra/ordena en Python (no en DB).
- Contraste: el resto de la app (`catalogo.db`) ya usa SQLite con índices y paginación SQL (`history_list`).

## Fix concreto que conserva funcionalidad

**Opción A (recomendada) — migrar a SQLite** reutilizando `repository.py`:
- Tabla `technical_reports` con columnas indexadas (`id`, `cs`, `contratista`, `status`, `informe_id`, `updated_at`).
- `get_all`/list con `SELECT … WHERE … ORDER BY … LIMIT/OFFSET` (empuja filtro+orden+paginación al motor; reusa el patrón de `history_list`).
- `create`/`update`/`delete` → `INSERT`/`UPDATE`/`DELETE` por fila (sin reescribir todo).
- Migración one-shot al arrancar: si existe `technical_reports.json`, importarlo a la tabla y renombrar el archivo a `.bak`.
- Conserva toda la API pública del handler (`technical_reports_list/create/update/delete/clear_all/replace_all`); solo cambia el storage detrás.

**Opción B (intermedia, menor diff) — caché en memoria**:
- Cachear la lista normalizada devuelta por `get_all()`; invalidar el caché solo en operaciones de escritura.
- Filtrar/ordenar sobre la lista cacheada en vez de re-normalizar cada vez.
- Sigue siendo O(N) por escritura (rewrite del archivo), pero el listado pasa a O(1) en cache-hit.

Ambas conservan funcionalidad y formato de salida. A 推荐 A por consistencia con el resto del stack.

## Verificación

- Test de migración: cargar N=1000 informes, medir tiempo de `list` y de `update` uno antes (JSON) vs después (SQLite/caché).
- Test de regresión: misma salida de `technical_reports_list` (mismo orden, mismos campos) para un dataset dado.
- Test existente `test_performance_audit.py` debe seguir pasando.
