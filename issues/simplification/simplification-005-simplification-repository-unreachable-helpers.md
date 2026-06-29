# simplification-005 — Eliminar `execute_query` y `execute_write` en `repository.py`

## Skill
`deprecation` + `simplification` + `security`

## Ubicación
`backend/core/repository.py` líneas ~55-69

```python
def execute_query(db_path: Path, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    """Execute a SELECT query and return rows as dicts."""
    with _db_lock:
        conn = get_connection(db_path)
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def execute_write(db_path: Path, sql: str, params: tuple = ()) -> int:
    """Execute a write query and return lastrowid or rowcount."""
    with _db_lock:
        conn = get_connection(db_path)
        cursor = conn.execute(sql, params)
        conn.commit()
        return cursor.lastrowid or cursor.rowcount
```

## Por qué es un problema
1. **Cero callers.** Búsqueda `grep -r "execute_query\|execute_write" backend/ frontend/ electron/ tests/ scripts/` → solo la definición en `repository.py`; sin imports desde handlers, tests, o scripts.
2. **Vector de SQL injection latente.** Si alguien las usara con `sql` string interpolado con input del usuario, bypassarían los `_validate_identifier` que SÍ usa `database.py` para sus queries. Es mejor eliminar la API genérica que dejarla "por si acaso".
3. Mantenimiento de boilerplate muerto.

## Verificación de consumers
- Búsqueda `grep -rn "from backend.core.repository import" backend/ tests/ electron/ scripts/`:

```
.\handlers\database.py:    from backend.core.database import buscar_por_columna, …
.\backend\core\database.py:from backend.core.repository import _db_lock, get_connection
.\backend\core\history.py:from backend.core.repository import _db_lock, get_connection
```

Nadie importa `execute_query` ni `execute_write`. Solo se importan `_db_lock` y `get_connection` (que se quedan).

## Propuesta
Borrar las dos funciones (~14 líneas) de `repository.py`. Mantener `get_connection`, `close_connection`, `_db_lock`, `_db_conn`, `_db_conn_path`.

## Cambio de comportamiento
Ninguno. Cero callers.

## Riesgo de migración
Ninguno.

## Verificación
```bash
ruff check backend/core/repository.py    # no F401 después de borrado
cd backend && python -m pytest ../tests/test_database*.py ../tests/test_history*.py -v
```

`ruff` debe reportar `repository.py` limpio tras el borrado (sin F401, porque no quedan imports no usados).
