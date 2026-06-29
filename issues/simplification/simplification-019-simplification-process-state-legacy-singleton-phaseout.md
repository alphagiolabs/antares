# simplification-019 — Eliminar el singleton `process_state` legacy en `common.py` (phase-out)

## Skill
`deprecation` + `code-review` (architecture)

## Ubicación
`backend/handlers/common.py` líneas ~38-90

```python
# Legacy singleton for backward compatibility with existing frontend.
process_state = ProcessState()

def reset_state(state: ProcessState | None = None) -> None:
    target = state or process_state
    # …

def log_message(msg: str, tag: str = "info", state: ProcessState | None = None) -> None:
    target = state or process_state
    # …
```

Y re-exports en `backend/handlers/__init__.py:48-52`:
```python
_state = process_state
_reset_state = reset_state
_log = log_message
```

## Por qué es un problema
El singleton `process_state` convive con el moderno `JobManager` con cada `Job.own.state`. El dualismo crea dos lugares donde buscar logs/estado. Cuando un handler hace `log_message(msg, state=None)` escribe al legacy; cuando el usuario consulta `process_status`, lee el estado del `Job("default")` — si esos dos desincronizan (p.ej. handler olvidó pasar `state=job.state`), el usuario ve progreso congelado.

## Verificación de consumers (CRÍTICA)

### Consumers en tests
- `tests/test_handlers.py` usa `handlers._state.logs[0]` y `handlers._reset_state()` directamente. Si `process_state`/`reset_state` se borran sin tocar tests → tests fallan.
- `tests/test_race_condition.py:6` → `from backend.handlers import _state`. Hace `with _state._lock: _state.running = ...`. Si `_state` se borra → AttributeError.

### Consumers en runtime
`grep "_state\b\|reset_state\|log_message.*state=None\|process_state" backend/handlers/`:

- `conversion.py` llama `log_message(msg, "warn", state=state)` (pasando `state`, no usando singleton).
- `info.py`, `database.py`, `theme.py`, `templates.py`, etc. → solo import `with_locale`/`validate_params`/`parse_positive_int` (NO `process_state`/`reset_state` directamente).

Verificación de `log_message` sin `state`:
```
grep "log_message(" backend/handlers/conversion.py  # los del conversion pasan state=state
grep "log_message(" backend/handlers/common.py      # solo la definición
```

Únicos callers de `log_message` en runtime pasan `state=state`. El `target = state or process_state` fallback del singleton NO se usa en runtime.

## Propuesta (phase-out en 2 etapas)

### Etapa 1 (sin tocar tests): deprecar pero no romper
1. En `common.py`, preservar `process_state`, `reset_state`, `log_message` signatures.
2. Sustituir el singleton global por una función que retorne el estado del job "default":

```python
def _legacy_default_state() -> ProcessState:
    """For backward compatibility: return the 'default' Job's ProcessState."""
    from backend.core.jobs import get_job_manager
    target_job = get_job_manager().get_job("default")
    if target_job is None:
        # Create an empty default job so legacy consumers (without state=) don't crash.
        # The JobManager.create_job won't start it without a target.
        # Instead, return a fresh ProcessState so reads are safe.
        return ProcessState()
    return target_job.state

process_state = None  # ← ahora es None en lugar de una instance; tests que acceden via _state._lock verán None

# Pero esto rompe tests/test_race_condition.py que hace `with _state._lock:` …
```

**Esto no funciona** porque tests acceden a `_state._lock`. El singleton debe ser una `ProcessState()` real (con su _lock) para satisfacer el test.

### Etapa 1 (propuesta alternativa, segura): documentar el dualismo sin tocar el singleton
- Agregar en `common.py` un comentario de la deuda técnica y los consumers:
```python
# process_state + reset_state + log_message(state=None) son la superficie legacy.
# Consumers en tests:
#   - tests/test_race_condition.py (accede _state._lock)
#   - tests/test_handlers.py (usa handlers._state.logs y handlers._reset_state())
# Consumers en runtime:
#   - Ninguno (todos los handlers pasan state=job.state).
# Antes de eliminar: migrar los 2 tests a usar JobManager.get_job("default").state.
# Ver issues/simplification/019.
```

No se toca código runtime. Acción mínima.

### Etapa 2 (cuando los tests puedan migrarse): eliminar el singleton
Requiere tocar `test_race_condition.py` (línea 6: `from backend.handlers import _state` → `from backend.core.jobs import get_job_manager; _state = get_job_manager().get_job("default").state` que requiere crear un job default) y `test_handlers.py` (análogo).

Etapa 2 fuera de scope de esta auditoría (requiere tocar tests).

## Cambio de comportamiento
- Etapa 1 (propuesta alternativa): NINGUNO. Solo documentación.
- Etapa 2 (descartada aquí): requiere tocar tests.

## Riesgo de migración
Bajo (etapa 1 doc only). Alto (etapa 2, no recomendada).

## Verificación
```bash
cd backend && python -m pytest ../tests/test_handlers.py ../tests/test_race_condition.py ../tests/test_reentrant_lock.py ../tests/test_conversion_*.py -v
```

Etapa 1: ningún comando nuevo (acción = doc).

## Acción recomendada
**Solo aplicar Etapa 1 (documentación).** El singleton queda; los tests siguen siendo válidos. La deuda técnica se anota en el issue. Cualquier eliminación real requiere decidir tocar los tests.
