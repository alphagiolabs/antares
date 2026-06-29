# simplification-017 — Extraer `_run_conversion_job` y `_prepare_chunk_tasks` de `conversion.py`

> **STATUS: DESCARTADO (verificación de acoplamiento real, 2026-06-27)**
>
> El issue decía "Ningún test parchea `_run_conversion_job` o `_prepare_chunk_tasks`
> directamente", pero `grep` sobre el código actual muestra MÁS acoplamiento de
> monkeypatch del documentado:
> - `_calculate_chunk_size` — parcheada en 6 archivos (test_conversion_record_sequence,
>   test_conversion_mapping, test_conversion_scheduler, test_stress_conversion,
>   test_rename_audit ×4). El issue no la listaba como parcheada.
> - `_run_conversion_job` — parcheada directamente en `test_stress_conversion:85` Y
>   llamada directamente en 6 archivos (contrario a la claim del issue).
> - `_prepare_chunk_tasks` — llamada directamente en `test_conversion_mapping:228`.
> - `_notify_complete` + `_resolve_key_column` — parcheadas (esto sí lo decía el issue).
>
> El refactor completo sólo preserva los patches si las llamadas internas a
> `_calculate_chunk_size` / `_notify_complete` / `_resolve_key_column` se hacen vía
> attribute access al módulo `conversion` (no import estático). Un error sutil →
> regresión SILENCIOSA: el test pasa (verifica `ok_count`/`progress`, no que el patch
> atrapó) pero el comportamiento runtime cambia. `simplification-002` ya rompió 15
> tests en este mismo módulo por monkeypatch. El beneficio es legibilidad (no bug/perf);
> el riesgo supera al beneficio. Descartado bajo la regla "tests sin modificar" +
> "completamente funcional".

## Skill
`code-review` (legibilidad, funciones >50 líneas) + `simplification`

## Ubicación
`backend/handlers/conversion.py`
- `_run_conversion_job` (líneas ~200-330, ~150 líneas)
- `_prepare_chunk_tasks` (líneas ~382-450, ~70 líneas)

## Por qué es un problema
- `_run_conversion_job` tiene 150 líneas con 6 niveles de anidamiento, mezclando: validación de mapping, setup de RenamerEngine, cálculo de resize, chunking por tamaño adaptativo, submit de futures, throttle de notificaciones, persistencia en history. Función incomprensible de un vistazo.
- `_prepare_chunk_tasks` aplica 4 ramas (`mapping_index` / `key_column` / `use_column_rename` / fallback) con ramas casi iguales entre sí (duplicación del `if is_video or not conversion_enabled` etc.).
- Cualquier bug en conversion flow es hard to localize.

## Verificación de consumers
- `_run_conversion_job` es target de `JobManager.create_job(_run_conversion_job, …)` en `process_start`. Privada al módulo.
- `_prepare_chunk_tasks` se invoca solo desde `_run_conversion_job`. Privada.
- Tests:
  - `tests/test_conversion_record_sequence.py` parchea `conversion._notify_complete` (NO `_run_conversion_job` ni `_prepare_chunk_tasks`).
  - `tests/test_rename_audit.py` parchea `conversion._notify_complete`.
  - `tests/test_conversion_mapping.py` parchea `conversion._notify_complete` y `conversion._resolve_key_column`.

Ningún test parchea `_run_conversion_job` o `_prepare_chunk_tasks` directamente. Moverlos NO rompe tests.

## Propuesta (manteniendo nombres de atributos del módulo)
Crear `backend/core/conversion_runner.py`:

```python
"""Conversion job orchestration: chunking, threading, history persistence."""
from __future__ import annotations
import time
from concurrent.futures import CancelledError, wait
from pathlib import Path
from typing import Any, cast

from backend.core.converter import convertir_imagen, copiar_archivo, copiar_video, es_video, FORMATOS_SOPORTADOS
from backend.core.database import buscar_lote_por_codigos
from backend.core.jobs import Job, is_legacy_default_job
from backend.core.mapping_index import MappingIndex
from backend.core.renamer import RenamerEngine, SequenceMode
from backend.core.scheduler import get_scheduler
from backend.ipc_protocol import send_notification
from backend.utils.i18n import set_locale, t
from backend.utils.validators import parse_filename_parts

from backend.handlers.conversion import (
    _resolve_sequence_mode,         # ← se queda en conversion.py (tests no la parchan)
    _notify_complete,               # ← se queda como alias para compat con tests
    _apply_catalog_rename,
    _record_group_key,
)


def _calculate_chunk_size() -> int:
    """…”""  # idéntico al actual


def _prepare_chunk_tasks(...):
    """…”""  # idéntico actual


def _emit_progress_notifications(job_id, data, is_default):
    """…”""  # idéntico


def run_conversion_job(job: Job) -> None:
    """Thread target — anteriormente `_run_conversion_job`."""
    # … idéntico, ~150 líneas, pero usando `run_conversion_job` como nombre.
```

En `conversion.py`, reemplazar:
```python
from backend.core.conversion_runner import run_conversion_job as _run_conversion_job
```

El nombre `_run_conversion_job` se conserva como binding en `conversion.py` — los tests que hagan `monkeypatch.setattr(conversion, "_run_conversion_job", ...)` (si existieran) seguirían funcionando. Verificación: `grep "_run_conversion_job" tests/` → sin resultados, así que no hay parches; pero la precaución es razonable.

Más importante: **las referencias internas en `_run_conversion_job`** a `_emit_complete_notifications` deben hacerse via `_notify_complete` (el alias), para no romper los parches de los tests (`setattr(conversion, "_notify_complete", …)` debe atrapar las llamadas desde adentro).

Esto significa: el código MIGRADO que vive en `conversion_runner.py` debe llamar via `conversion._notify_complete(...)` — pero al estar en OTRO módulo, sería `backend.handlers.conversion._notify_complete(...)` con import circular. Solución: en `run_conversion_job`, recibir un callback `notify_complete_fn` como parámetro, y en `process_start` inyectar `_notify_complete`. O: que `conversion_runner.py` importe `_notify_complete` desde `conversion.py` (la importación circular la evita el lazy import).

Detalle final de este issue: el refactor tiene riesgo MEDIO-ALTO por las dependencias de monkeypatching. Si NO se quiere el riesgo, dividir en chunks más pequeños:

1. **Etapa 1 (bajo riesgo):** Solo extraer `_calculate_chunk_size` y `_emit_progress_notifications` a `conversion_runner.py` (son funciones puras helper). ~30 líneas.
2. **Etapa 2 (medio riesgo):** Extraer `_prepare_chunk_tasks`.
3. **Etapa 3 (alto riesgo):** Extraer `_run_conversion_job` completo.

Recomendación: hacer etapas 1+2 primero, verificar, y luego decidir etapa 3 con más datos.

## Cambio de comportamiento
Ninguno runtime. Cambio de ubicación de funciones privadas + preservación de bindings para compat con tests.

## Riesgo de migración
Medio-alto por los patches de `_notify_complete` y `_resolve_key_column` en tests.

## Verificación
```bash
cd backend && python -m pytest ../tests/test_conversion_*.py ../tests/test_rename_*.py ../tests/test_stress_conversion.py -v
cd backend && python -m pytest ../tests/test_performance_audit.py -v   # timings no deben alterarse
```

Manual: correr conversión de 50 imágenes con rename + mapeo Excel; comparar logs de progreso, nombres generados, y tiempos.

## Opción descartada
Reescribir `_run_conversion_job` de cero con nuevos abstractions. NO — es demasiado riesgo y no preserva comportamiento garantizadamente. Solo EXTRACT (move verbatim).
