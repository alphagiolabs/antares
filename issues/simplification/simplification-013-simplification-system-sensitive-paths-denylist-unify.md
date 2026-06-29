# simplification-013 — Unificar la doble denylist de paths system-sensitive

## Skill
`simplification` + `security` + `code-review` (correctness)

## Ubicación
DOS representaciones paralelas del mismo concepto "paths no permitidos":

1. `backend/utils/paths.py` líneas ~60-72 (Path-based):
   ```python
   _SYSTEM_SENSITIVE_ROOTS_WIN: tuple[str, ...] = (
       "C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData",
   )
   _SYSTEM_SENSITIVE_ROOTS_UNIX: tuple[str, ...] = (
       "/etc", "/usr", "/bin", "/sbin", "/proc", "/sys", "/dev", "/boot",
       "/lib", "/lib64", "/root",
   )
   ```

2. `backend/utils/validators.py` líneas ~18-37 (string-based, normalizado):
   ```python
   _SYSTEM_SENSITIVE_PATH_EXACT: frozenset[str] = frozenset({
       "c:/windows", "c:/program files", "c:/program files (x86)", "c:/programdata",
       "/etc", "/usr", "/bin", "/sbin", "/proc", "/sys", "/dev", "/boot",
       "/lib", "/lib64", "/root",
   })
   _SYSTEM_SENSITIVE_PATH_PREFIXES: tuple[str, ...] = (
       "c:/windows/", "c:/program files/", "c:/program files (x86)/", "c:/programdata/",
       "/etc/", "/usr/", "/bin/", "/sbin/", "/proc/", "/sys/", "/dev/", "/boot/",
       "/lib/", "/lib64/", "/root/",
   )
   ```

El propio comentario en `validators.py` lo admite:
```python
# SEC-003: ... Keep in sync with backend.utils.paths._SYSTEM_SENSITIVE_ROOTS_* (Path-based, used by sellador).
```

## Por qué es un problema
- DOS listas que deben mantenerse idénticas a mano. Una usa backslash + Title Case (`C:\Windows`), la otra slash + lowercase (`c:/windows`).
- Bug real latente: si alguien añade una ruta a una y no a la otra, hay bypass. Específicamente: `paths.is_system_sensitive_path` rechazaría `C:\Windows\System32` pero `validators._is_system_sensitive_path_str` lo aceptaría (si la lista diverge).
- Validación de input en boundary de API (IPC) usa `validators.is_safe_user_path` → string-based. Validación de `sellador_io.read_user_file` → `paths.assert_path_within_root` → Path-based. Dos caminos, dos fuentes de verdad.

## Verificación de consumers
- `validators.is_safe_user_path` se invoca desde `ipc_protocol.validate_params` (boundary del IPC) y `handlers.common._validate_path` (handler layer).
- `paths.is_system_sensitive_path` se invoca desde `paths.assert_path_within_root`, llamado por `sellador_io.read_user_file` (lectura de archivos de sello/PDF).

Ambas en uso en runtime.

## Propuesta (unificación preservando ambas APIs)
Definir en `backend/utils/paths.py` una lista canónica NORMALIZADA (lowercase + slash):

```python
# paths.py
_SYSTEM_SENSITIVE_ROOTS: tuple[str, ...] = (
    "c:/windows", "c:/program files", "c:/program files (x86)", "c:/programdata",
    "/etc", "/usr", "/bin", "/sbin", "/proc", "/sys", "/dev", "/boot",
    "/lib", "/lib64", "/root",
)
_SYSTEM_SENSITIVE_ROOTS_PREFIXED: tuple[str, ...] = tuple(r + "/" for r in _SYSTEM_SENSITIVE_ROOTS)
```

`paths.is_system_sensitive_path` ya normaliza en `r.resolve()`; ajustar la comparación con los strings normalized.

`validators._is_system_sensitive_path_str` se reimplementa así:
```python
from backend.utils.paths import _SYSTEM_SENSITIVE_ROOTS, _SYSTEM_SENSITIVE_ROOTS_PREFIXED

def _is_system_sensitive_path_str(value: str) -> bool:
    norm = value.strip().lower().replace("\\", "/")
    if norm in _SYSTEM_SENSITIVE_ROOTS:
        return True
    return any(norm.startswith(p) for p in _SYSTEM_SENSITIVE_ROOTS_PREFIXED)
```

Borrar `_SYSTEM_SENSITIVE_PATH_EXACT` y `_SYSTEM_SENSITIVE_PATH_PREFIXES` de `validators.py` y los `_SYSTEM_SENSITIVE_ROOTS_WIN`/`_UNIX` de `paths.py` (sustituidos por la lista unificada normalizada).

## Cambio de comportamiento
Ninguno. Las mismas rutas son rechazadas. La diferencia es que ahora hay UNA sola lista (canonical) y el riesgo de drift desaparece.

## Restricción preservada
- `paths.is_system_sensitive_path` sigue usando `Path.resolve()` para comparación (no cambia su signature).
- `validators.is_safe_user_path` sigue siendo pure-string (no FS access, fast IPC path).
- Ambas APIs conservan sus signatures exactas.

## Riesgo de migración
Bajo. Tests que cubren este comportamiento:
- `tests/test_path_sanitization.py` — testea `is_safe_user_path` y related.
- `tests/test_validators.py` — testea `validators`.
- `tests/test_sellador_handler.py` — testea `assert_path_within_root` vía `allowed_roots`.

## Verificación
```bash
cd backend && python -m pytest ../tests/test_path_sanitization.py ../tests/test_validators.py ../tests/test_sellador_handler.py -v
ruff check backend/utils/
```

Las aserciones siguen cubriendo `C:\Windows`, `/etc/passwd`, `C:/ProgramData/foo`, etc. Pasarán sin modificación.
