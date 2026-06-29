# simplification-014 — Unificar los dos detectores de límites hardware (`scheduler._detect_limits` + `jobs._detect_max_concurrent`)

## Skill
`simplification` + `code-review` (architecture)

## Ubicación
1. `backend/core/jobs.py` líneas ~55-79 — `_detect_max_concurrent()`
2. `backend/core/scheduler.py` líneas ~31-52 — `_detect_limits()`

Ambas leen `os.cpu_count()` + `psutil.virtual_memory().available` y computan límites. Sus fórmulas finales producen valores distintos (una para `max_concurrent_jobs`, otra para `light_workers`/`heavy_workers`/`heavy_queue_limit`).

## Por qué es un problema
- Los comentarios en cada función dicen "intentionally separate from the other" pero el motivo no es arquitectónico — es histórico. Ambas son heurísticas ad-doc del mismo hardware.
- Dos lugares donde ajustar cuando cambia el modelo (p.ej. si se quiere reducir el consumo RAM por job).
- Drift entre límites garantizado en cualquier cambio.

## Verificación de consumers
- `jobs._detect_max_concurrent` se invoca en `jobs.MAX_CONCURRENT_DEFAULT = _detect_max_concurrent()` (línea 79, valor evaluado al import).
- `scheduler._detect_limits` se invoca en `WorkScheduler.autodetected()` (línea ~70).
- Tests:
  - `tests/test_scheduler.py` importa directamente `scheduler` y quizás `_detect_limits` (verificar).
  - `tests/test_jobs.py` no parchea `_detect_max_concurrent` (usar monkeypatch solo para `psutil.virtual_memory`).

`grep "_detect_max_concurrent\|_detect_limits" tests/` → sin parches directos.

## Propuesta (manteniendo signatures retornadas)
Crear `backend/core/system_limits.py`:

```python
"""Hardware-aware resource limits for the ANTARES backend.

Single source of truth for limits derived from CPU and RAM. Consumed by both
JobManager (top-level concurrent user jobs) and WorkScheduler (thread-pool
heavy/light slots).
"""
from __future__ import annotations
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class HardwareLimits:
    cpu_count: int
    ram_available_gb: float

    @property
    def max_concurrent_jobs(self) -> int:
        try:
            ram_limited = max(1, int(self.ram_available_gb // 2))
            return max(4, min(self.cpu_count, ram_limited, 16))
        except Exception:
            return 4

    @property
    def light_workers(self) -> int:
        return max(2, min(self.cpu_count, 4))

    @property
    def heavy_workers(self) -> int:
        ram_limited = max(1, int(self.ram_available_gb // 3))
        return max(2, min(max(1, self.cpu_count // 2), ram_limited, 6))

    @property
    def heavy_queue_limit(self) -> int:
        return max(self.heavy_workers, self.heavy_workers * 2)


def detect_hardware_limits() -> HardwareLimits:
    cpu_count = os.cpu_count() or 2
    try:
        import psutil
        ram_available_gb = psutil.virtual_memory().available / (1024 ** 3)
    except ImportError:
        ram_available_gb = 4.0
    except Exception:
        ram_available_gb = 4.0
    return HardwareLimits(cpu_count=cpu_count, ram_available_gb=ram_available_gb)
```

Modificar:
- `jobs._detect_max_concurrent` → delegar: `return detect_hardware_limits().max_concurrent_jobs`. Mantiene nombre de función y signature `() -> int` (los tests que la referencien por nombre seguirán funcionando).
- `scheduler._detect_limits` → delegar: devolver `(lim.light_workers, lim.heavy_workers, lim.heavy_queue_limit)`. Signature `() -> tuple[int, int, int]` preservada.

Las fórmulas son copia exacta de las actuales. El cambio es solo de ubicación.

## Cambio de comportamiento
Ninguno. Las fórmulas son idénticas línea por línea. El valor que ve `JobManager.max_concurrent` y el `WorkScheduler._executor.max_workers` sigue siendo el mismo para la misma máquina.

## Riesgo de migración
Bajo. Las APIs públicas (`scheduler.get_scheduler`, `jobs.get_job_manager`) no cambian. Tests cubren comportamiento (no implementación).

## Verificación
```bash
cd backend && python -m pytest ../tests/test_scheduler.py ../tests/test_jobs.py ../tests/test_performance_audit.py -v
ruff check backend/core/
```

`test_scheduler.py` valida la inicialización del `WorkScheduler` concretizando `autodetected()` y posiblemente forzando límites — sin monkeypatch de `_detect_limits` (confirmado arriba), pasará sin modificación.

`test_performance_audit.py` es el test más relevante (audita latencias); si los límites se alteraran, los timings medidos cambiarían.
