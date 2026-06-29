# simplification-004 — Mover `_consecutive_errors` + `time.sleep(0.5)` a `ErrorBudget` dataclass local

## Skill
`observability` + `code-review` (architecture)

> **NOTA:** Esta versión preserva el comportamiento `time.sleep(0.5)` textualmente. La variante "backoff exponencial" es un cambio de comportamiento y se descarta (ver README, Z5).

## Ubicación
`backend/main.py` líneas ~181-210

```python
_consecutive_errors = 0
_MAX_CONSECUTIVE_ERRORS = 100
# …
while True:
    # …
    except Exception as exc:
        _consecutive_errors += 1
        logger.exception("Unexpected error in main loop (consecutive=%d): %s", _consecutive_errors, exc)
        if _consecutive_errors >= _MAX_CONSECUTIVE_ERRORS:
            logger.error("Too many consecutive errors, exiting.")
            break
        time.sleep(0.5)
```

## Por qué es un problema
El estado `_consecutive_errors` es un global mutable del módulo. Aunque `main()` es el único que lo escribe (y el loop es single-threaded), el patrón "global + ad-hoc decrement/increment" es frágil:
- Sin estructura, fácil añadir un segundo path que mute el contador y lo descuadre.
- `time.sleep(0.5)` mágico hardcoded sin abstracción.
- `logger.exception("consecutive=%d", _consecutive_errors)` es string interpolation, no structured logging.

## Verificación de consumers
`_consecutive_errors` es interno a `main.py`. Grep en tests: ningún test lo referencia. Cero consumers externos.

## Propuesta (manteniendo comportamiento 1:1)
Definir un dataclass local a `main()`:

```python
@dataclass
class ErrorBudget:
    consecutive: int = 0
    max_consecutive: int = 100
    recovery_sleep_seconds: float = 0.5

    def record_error(self) -> bool:
        self.consecutive += 1
        return self.consecutive >= self.max_consecutive

    def record_success(self) -> None:
        self.consecutive = max(0, self.consecutive - 1)

    def sleep_recovery(self) -> None:
        time.sleep(self.recovery_sleep_seconds)
```

En `main()`:
```python
budget = ErrorBudget()  # reemplaza _consecutive_errors global
# …
budget = ErrorBudget()
while True:
    try:
        # …
        budget.record_success()   # era: _consecutive_errors = max(0, _consecutive_errors - 1)
    except Exception as exc:
        logger.exception("Unexpected error in main loop", extra={"consecutive": budget.consecutive})
        if budget.record_error():
            logger.error("Too many consecutive errors, exiting.")
            break
        budget.sleep_recovery()   # era: time.sleep(0.5)
```

Borrar `_consecutive_errors` y `_MAX_CONSECUTIVE_ERRORS` globales.

## Cambio de comportamiento
Ninguno. `recovery_sleep_seconds = 0.5` literal — mismo sleep que antes. Mismo `max_consecutive = 100`. Misma rama de "break on too many errors". El `extra={"consecutive": n}` enriquece logs estructurados SIN cambiar el texto humano (logger.exception sigue imprimiendo lo mismo).

## Riesgo de migración
Bajo.

## Verificación
```bash
cd backend && python -m pytest ../tests/test_ipc.py ../tests/test_ipc_validation.py ../tests/test_backend_main.py -v
```

`test_backend_main.py` valida que el modulo arranca; no aserta sobre `_consecutive_errors`.
