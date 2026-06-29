# perf-06 — Lock global de SQLite serializa todas las lecturas (P2)

**Severidad:** P2
**Área:** Backend / data / concurrencia

## Bottleneck

`repository.py` protege la única conexión SQLite con un `threading.RLock` **global** adquirido por **toda** operación (lectura y escritura). Esto serializa las lecturas entre sí, anulando el beneficio de concurrencia de lecturas que permite el modo WAL. El scheduler corre hasta ~4 heavy + ~4 light threads, pero toda lectura DB pasa de a una.

## Evidence (métrica)

- `backend/core/repository.py:15`: `_db_lock = threading.RLock()`
- `execute_query` (lectura) y `execute_write` (escritura) adquieren `_db_lock` con `with` en cada llamada.
- Todas las funciones de `database.py` (`buscar_por_columna`, `obtener_todos`, `buscar_lote_por_codigos`, `contar`, etc.) pasan por esas dos envolturas → **1 lector a la vez aunque WAL permitiría muchos**.
- PRAGMAs ya configurados: `journal_mode=WAL`, `synchronous=NORMAL`, `check_same_thread=False`. La infraestructura para concurrencia de lectores está; el lock la bloquea.
- `tests/test_performance_audit.py::test_connection_is_reused` valida que se reutilice **una** conexión — el fix debe respetar ese contrato.

## Fix concreto que conserva funcionalidad

Reemplazar el `RLock` global por un **reader-writer lock** (`threading` no lo trae nativo; implementarlo con `Lock`+`Condition` o usar un módulo pequeño ya permitido). Reglas:
- Múltiples lectores pueden entrar concurrentes.
- Un escritor es exclusivo (nadie lee ni escribe mientras escribe).
- (Opcional, justo) si hay escritor esperando, nuevos lectores esperan para evitar starvation de escritores.

Conserva: la conexión única (`check_same_thread=False`), los PRAGMAs, el contrato de `execute_query`/`execute_write`, y la atomicidad de cada operación. Las escrituras siguen serializadas (SQLite es single-writer de todos modos), así que **no se pierde corrección**; solo se deserializan lecturas.

```python
class RWLock:
    # readers entran concurrentes; writer exclusivo
    ...
_db_lock = RWLock()   # en vez de RLock()

def execute_query(...):
    with _db_lock.read():
        ...
def execute_write(...):
    with _db_lock.write():
        ...
```

## Verificación

- **Medir primero**: con `EXPLAIN QUERY PLAN` confirmar que las lecturas pesadas (`buscar_lote_por_codigos` con N keys) son index scans (lo son: `idx_imagenes_<col>`).
- Benchmark de concurrencia: lanzar 8 lecturas pesadas en paralelo desde el scheduler y medir wall-time antes (serial) vs después (concurrente).
- Tests existentes deben seguir pasando (`test_connection_is_reused`, etc.); añadir un test que asserte que 2 lecturas se solapan en tiempo.
