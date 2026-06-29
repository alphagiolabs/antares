# perf-14 — History bulk delete: N commits (P3)

**Severidad:** P3
**Área:** Backend / data / historial

## Bottleneck

`history_delete_many` llama a `delete_run(id)` por cada ID, con un commit por llamada. Para M IDs → M commits (M fsync del WAL/journal).

## Evidence (métrica)

- `backend/handlers/history.py:60-64`:
  ```python
  for run_id in ids:
      delete_run(int(run_id))   # un DELETE + commit por id
  ```
- `delete_run` (en `backend.core.history`) ejecuta su `DELETE` con su propio commit/tx implícita.
- `history_list` ya hace paginación SQL (✅); el bulk-delete es la asimetría.

## Fix concreto que conserva funcionalidad

Un solo `DELETE FROM historial WHERE id IN (…)` (o `run_id` según el esquema) dentro de **una transacción**, con chunking por el límite de 999 parámetros si M es grande. Conserva el comportamiento observable (mismos IDs borrados, mismo reporte de cuántos se eliminaron, misma invalidación de caches/índices).

```python
def delete_runs(ids: list[int]) -> int:
    deleted = 0
    with _db_lock.write():   # o la tx envolvente que use repository
        for chunk in chunks(ids, 900):
            placeholders = ",".join("?" * len(chunk))
            cur = conn.execute(f"DELETE FROM historial WHERE id IN ({placeholders})", chunk)
            deleted += cur.rowcount
    return deleted
```

Mantiene la API pública (`history_delete_many` sigue aceptando una lista de IDs); solo colapsa N commits en 1 (o pocos, por chunk).

## Verificación

- Medir: borrar M=1000 IDs antes (~1000 commits) vs después (1–2 tx) — delta de wall-time/IO.
- Test funcional: mismos IDs borrados, mismo conteo retornado, FKs/cascadas (si las hay) se respetan.
