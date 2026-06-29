# simplification-002 — Eliminar imports locales duplicados de `buscar_por_columna` en `conversion.py`

## Skill
`simplification` + `performance`

## Ubicación
`backend/handlers/conversion.py` — 6 imports locales a funciones:
- línea ~73 (`_detect_best_key_column`)
- línea ~118 (`_resolve_key_column`)
- línea ~154 (`preview`, rama `key_column`)
- línea ~187 (`preview`, rama `auto-detect`)
- línea ~259 (`_run_conversion_job`)
- + `buscar_lote_por_codigos`, `obtener_todos`, `parse_id_rename_mapping` también importadas localmente en múltiples funciones

## Por qué es un problema
Patrón de lazy-import mal aplicado: `buscar_por_columna`, `buscar_lote_por_codigos`, `obtener_todos`, `parse_id_rename_mapping` son funciones puras de `backend.core.database`. Ningún import circular impide traerlas al top-level del módulo. Importarlas dentro de cada función añade overhead por llamada (resolución de `from … import …` en cada invocación) y complica el análisis estático (mypy, ruff).

## Verificación de consumers

Búsqueda: `grep -r "from backend.core.database import" backend/ frontend/ tests/`

- `backend/core/database.py` define todas estas funciones.
- `backend/handlers/conversion.py` las usa SIN top-level import (lazy). 
- `tests/` las usa vía monkeypatch en `conversion` (verificado: no las parchea — parchean `_resolve_key_column` y `_notify_complete`, que son funciones del propio `conversion.py`, no de `database`).

Confirma que mover `from backend.core.database import buscar_por_columna, buscar_lote_por_codigos, obtener_todos, parse_id_rename_mapping` al top de `conversion.py` no afecta los patches de tests.

## Verificación de imports circular
Comprobar que `backend/core/database.py` no importe `backend.handlers.conversion`:

`grep "import.*conversion\|from.*conversion" backend/core/database.py` → sin resultados. Sin ciclo.

## Propuesta
Reemplazar los 6+ imports locales con uno solo top-level al inicio de `conversion.py`:

```python
from backend.core.database import (
    buscar_lote_por_codigos,
    buscar_por_columna,
    obtener_todos,
    parse_id_rename_mapping,
)
```

Borrar las 6+ apariciones de `from backend.core.database import …` dentro de funciones.

## Cambio de comportamiento
Ninguno. Las importaciones se resuelven igual; solo se mueven en tiempo de carga del módulo.

## Riesgo de migración
Ninguno.

## Verificación
```bash
ruff check backend/handlers/conversion.py   # no F811 redefinition
cd backend && python -m pytest ../tests/test_conversion_*.py ../tests/test_rename_*.py -v
npm run typecheck:backend
```

Si `ruff` reporta unused-import (F401) en una función porque ya no la usa tras el refactor, eliminar la función también — pero verificar primero con grep que no se llame desde fuera.
