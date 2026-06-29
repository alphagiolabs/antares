# simplification-022 — Consolidar las 3 funciones de "detect best key column" (preservar signature exacta)

## Skill
`simplification` + `code-review` (architecture, código duplicado)

> **CORREGIDO vs auditoría previa:** las 3 funciones NO son triviales de consolidar porque los tests parchean `_resolve_key_column` con signature exacta `(key, _files, _columns) -> str`. La consolidación debe preservar esa signature.

## Ubicación
`backend/handlers/conversion.py`

1. `_detect_best_key_column(files, db_columns, sample_size=30) -> str` (líneas ~73-100)
2. `_resolve_key_column(key_column, files, db_columns=None) -> str` (líneas ~118-158)
3. `db_detect_key_column(params) -> dict` (handler IPC, líneas ~336-380)

## Por qué es un problema
Tres funciones casi idénticas que (1) parsean `parse_filename_parts` de los primero 30 archivos, (2) iteran columnas de la BD, (3) llaman `buscar_por_columna(search_keys, col)`, (4) eligen la columna con más matches. ~150 líneas de copia-pega-tweak. Cualquier fix al algoritmo debe aplicarse 3 veces.

## Verificación de consumers (CRÍTICA)
`tests/test_conversion_record_sequence.py` — hace `monkeypatch.setattr(conversion, "_resolve_key_column", lambda key, _files, _columns: key)` en 3 lugares.

Esto significa: `_resolve_key_column` EXISTE con signature `(key_column: str, files: list[str], db_columns: list[str] | None = None) -> str` en el módulo `conversion`. Cualquier refactor debe PRESERVAR:
- El nombre `_resolve_key_column` como atributo del módulo `conversion`.
- La signature EXACTA: 3 parámetros posicionales donde el primero es `key_column` y el último tiene default `None`.

`_detect_best_key_column` y `db_detect_key_column` no se parchean por tests (verificado: `grep "_detect_best_key_column\|db_detect_key_column" tests/` → sin patches, solo definiciones y handlers tests).

## Propuesta (conservadora, preserva signature)
Crear `backend/core/column_detection.py` con una FUNCIÓN única bien tipada:

```python
"""Detect the database column containing file codes, for catalog renames."""
from __future__ import annotations
from pathlib import Path
from typing import Any

from backend.utils.validators import parse_filename_parts


def detect_best_key_column(
    files: list[str],
    db_columns: list[str],
    *,
    preferred: str | None = None,
    sample_size: int = 30,
) -> tuple[str, int, list[dict[str, Any]]]:
    """Probe each DB column, return (column_name, best_match_count, per_column_results).

    If ``preferred`` is provided AND matches columns equally well as the best, returns it.
    """
    if not db_columns:
        return "", 0, []
    if len(db_columns) == 1:
        return db_columns[0], 0, [{"name": db_columns[0], "matches": 0}]

    from backend.core.database import buscar_por_columna

    sample_files = files[:sample_size]
    sample_keys: list[str] = []
    for f in sample_files:
        p = Path(f)
        code, _ = parse_filename_parts(p.name)
        sample_keys.append(code)
        sample_keys.append(p.stem)
    search_keys = list(set(sample_keys))
    if not search_keys:
        return db_columns[0], 0, [{"name": db_columns[0], "matches": 0}]

    best_col = db_columns[0]
    best_count = -1
    user_count = -1
    column_results: list[dict[str, Any]] = []
    for col in db_columns:
        try:
            count = len(buscar_por_columna(search_keys, col))
        except Exception:
            count = -1
        column_results.append({"name": col, "matches": count})
        if col == preferred:
            user_count = count
        if count > best_count:
            best_count = count
            best_col = col

    final_col = best_col
    if preferred and preferred in db_columns and user_count >= 0 and user_count >= best_count and user_count > 0:
        final_col = preferred

    return final_col, best_count, column_results
```

En `conversion.py`, REEMPLAZA las 3 funciones con wrappers delgados + el binding exacto que esperan los tests:

```python
from backend.core.column_detection import detect_best_key_column


def _resolve_key_column(key_column, files, db_columns=None):        # ← signature EXACTA preservada
    from backend.core.config_fields import get_field_names
    columns = db_columns if db_columns is not None else get_field_names()
    if not columns or len(columns) == 1:
        return columns[0] if columns else key_column
    final, _, _ = detect_best_key_column(files, columns, preferred=key_column if key_column else None)
    return final


def _detect_best_key_column(files, db_columns, sample_size=30):     # ← signature preservada
    if not db_columns:
        return ""
    final, _, _ = detect_best_key_column(files, db_columns, sample_size=sample_size)
    return final


@with_locale
@validate_params("files")
def db_detect_key_column(params: dict[str, Any]) -> dict[str, Any]:
    # ← signature de handler IPC, dict shape EXACTO preservado:
    # {key_column: str, matches: int, columns: [{name, matches}, …]}
    files = params.get("files", [])
    if not files or not isinstance(files, list):
        return {"key_column": "", "matches": 0, "columns": []}
    from backend.core.config_fields import get_field_names
    db_cols = get_field_names()
    if not db_cols:
        return {"key_column": "", "matches": 0, "columns": []}
    if len(db_cols) == 1:
        return {"key_column": db_cols[0], "matches": 0, "columns": [{"name": db_cols[0], "matches": 0}]}
    final, best_count, col_results = detect_best_key_column(files, db_cols)
    return {"key_column": final, "matches": best_count, "columns": col_results}
```

Resultado:
- Las 3 signatures se preservan exactas.
- El algoritmo vive en un solo lugar (`column_detection.detect_best_key_column`).
- Los tests que parchean `conversion._resolve_key_column` con `lambda key, _files, _columns: key` siguen funcionando (sigue existiendo `_resolve_key_column` con esos 3 args).
- El dict IPC de `db_detect_key_column` tiene el mismo shape que los tests y el frontend esperan (`key_column`, `matches`, `columns: list[{name, matches}]`).

## Cambio de comportamiento
Ninguno. El algoritmo es copia exacta línea por línea (incluye el edge case `user_count >= 0 and user_count >= best_count and user_count > 0` que conservaba el preferred column).

## Riesgo de migración
Alto por el parcheo de `_resolve_key_column` en tests. Verificación exhaustiva requerida.

## Verificación
```bash
cd backend && python -m pytest ../tests/test_conversion_mapping.py ../tests/test_conversion_record_sequence.py ../tests/test_database_mapping.py ../tests/test_rename_mapping.py -v
ruff check backend/core/column_detection.py backend/handlers/conversion.py
```

`test_conversion_record_sequence.py` hace `monkeypatch.setattr(conversion, "_resolve_key_column", lambda key, _files, _columns: key)` — el wrapper `_resolve_key_column` sigue existiendo como binding del módulo, así que el patch funciona.

Manual: cargar un Excel de conversión donde la columna ID esté en `sgio` (no `nis`), forzar auto-detec → debe seguir eligiendo `sgio`.

## Importante
NO eliminar `_resolve_key_column` ni `_detect_best_key_column` como atributos del módulo `conversion.py` — son observados vía `setattr` por los tests. La consolidación es mover la IMPLEMENTACIÓN a `column_detection.py`, dejando wrappers delgados en `conversion.py`.
