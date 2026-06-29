# simplification-018 — Reemplazar constantes `RUN_TYPE_*` de `history.py` por imports desde `run_types.py` (no borrar)

## Skill
`deprecation` + `simplification`

> **CORREGIDO vs auditoría previa:** las constantes NO se eliminan. Se reemplazan por re-exportación para mantener compatibilidad con `tests/test_run_types.py` y el `default` de `save_run`.

## Ubicación
`backend/core/history.py` líneas ~13-22

```python
RUN_TYPE_CONVERSION = "conversion"
RUN_TYPE_FORMATO = "formato"
RUN_TYPE_SELLADOR = "sellador"
RUN_TYPE_PADRON = "padron"
RUN_TYPE_VOLANTE = "volante"
RUN_TYPE_IMAGE_OPTIMIZER = "image_optimizer"
RUN_TYPE_REPORTE_CAMPO = "reporte_campo"
RUN_TYPE_PANEL_AVISO_CORTE = "panel_aviso_corte"
RUN_TYPE_INFORME_TECNICO = "informe_tecnico"
```

## Verificación de consumers (CRÍTICA)

### Consumer 1 — `save_run` default parameter
`backend/core/history.py` línea ~109 (`save_run` signature):
```python
def save_run(
    …
    run_type: str = RUN_TYPE_CONVERSION,
    …
) -> int:
```
`RUN_TYPE_CONVERSION` se usa como VALOR DEFAULT del parámetro `run_type`. Borrar la constante rompe el signature (NameError en tiempo de import).

### Consumer 2 — `tests/test_run_types.py` importa `ALL_RUN_TYPES` desde `history`
```python
# tests/test_run_types.py (clase TestHistoryConstants)
def test_history_all_run_types_matches_registry(self) -> None:
    from backend.core.history import ALL_RUN_TYPES as history_types
    assert set(history_types) == set(RUN_TYPE_REGISTRY.keys())
    assert "sellador" in history_types
```

Esto prueba que `history.py` expone `ALL_RUN_TYPES` — la re-exportación `from backend.core.run_types import ALL_RUN_TYPES  # noqa: F401` en `history.py` es INTENCIONAL para satisfacer este test. NO debe borrarse.

## Propuesta
Reemplazar las 9 constantes hardcoded por re-exportación desde `run_types.py`:

```python
# backend/core/history.py
from backend.core.run_types import (
    RUN_TYPE_REGISTRY,            # ← ya está importado en parte
    ALL_RUN_TYPES,                # re-export, # noqa: F401
)

# Re-export de RUN_TYPE_* para consumidores legacy (test_run_types + save_run default)
RUN_TYPE_CONVERSION = RUN_TYPE_REGISTRY["conversion"].id
RUN_TYPE_FORMATO = RUN_TYPE_REGISTRY["formato"].id
RUN_TYPE_SELLADOR = RUN_TYPE_REGISTRY["sellador"].id
RUN_TYPE_PADRON = RUN_TYPE_REGISTRY["padron"].id
RUN_TYPE_VOLANTE = RUN_TYPE_REGISTRY["volante"].id
RUN_TYPE_IMAGE_OPTIMIZER = RUN_TYPE_REGISTRY["image_optimizer"].id
RUN_TYPE_REPORTE_CAMPO = RUN_TYPE_REGISTRY["reporte_campo"].id
RUN_TYPE_PANEL_AVISO_CORTE = RUN_TYPE_REGISTRY["panel_aviso_corte"].id
RUN_TYPE_INFORME_TECNICO = RUN_TYPE_REGISTRY["informe_tecnico"].id
```

O más limpio (un solo helper en run_types):
```python
# backend/core/run_types.py — agregar:
def run_type_id(name: str) -> str:
    return RUN_TYPE_REGISTRY[name].id

# backend/core/history.py
from backend.core.run_types import run_type_id
RUN_TYPE_CONVERSION = run_type_id("conversion")
# …
```

Resultado: single source of truth (el id string vive en `RUN_TYPE_REGISTRY`), las constantes `RUN_TYPE_*` se evalúan a los MISMOS strings exactos ("conversion", "formato", etc.) — compatibilidad preservada al 100%.

## Cambio de comportamiento
Ninguno. Los valores string son idénticos. `save_run(run_type=RUN_TYPE_CONVERSION)` sigue recibiendo `"conversion"`. `test_run_types.py` sigue viendo `ALL_RUN_TYPES` y los mismos set de IDs.

## Riesgo de migración
Medio. Toca el módulo `history.py` y el `default` de `save_run`.

## Verificación
```bash
cd backend && python -m pytest ../tests/test_run_types.py ../tests/test_history_*.py -v
ruff check backend/core/history.py backend/core/run_types.py
mypy backend
```

`test_run_types.py:TestHistoryConstants.test_history_all_run_types_matches_registry` debe pasar idéntico.
`test_history_*.py` cubren `save_run`/`list_runs` — el `default=RUN_TYPE_CONVERSION` se evalúa en import, así que las pruebas que llaman `save_run(…, run_type="conversion")` y las que omiten `run_type` deben seguir funcionando idéntico.

## Importante
NO borrar las constantes del todo (auditoría previa sugería eso). Esto rompería los dos consumers verificados arriba. La acción correcta es consolidar la fuente canónica (de `"conversion"` literal → `RUN_TYPE_REGISTRY["conversion"].id`) manteniendo los nombres `RUN_TYPE_*` accesibles.
