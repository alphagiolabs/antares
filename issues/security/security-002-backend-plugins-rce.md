# SEC-002 — Plugins: ejecución de código con sandbox AST bypassable + auto-load

- **Severidad:** P1 (Alta)
- **Categoría:** RCE / Plugin (arbitrary code execution en el proceso backend)
- **Archivos afectados:** `backend/core/plugins.py`, `backend/main.py`

## Vulnerabilidad

En cada arranque del backend, `main.py:198` llama `load_plugins_from_dir()`, que carga y ejecuta todos los `.py` de `user_data_path("plugins")` (≈ `%LOCALAPPDATA%\Antares\plugins\` en Windows):

```python
def load_plugins_from_dir(plugins_dir: Path | None = None) -> None:
    if plugins_dir is None:
        plugins_dir = user_data_path("plugins")
    plugins_dir.mkdir(parents=True, exist_ok=True)
    for file_path in plugins_dir.glob("*.py"):
        ...
        source = file_path.read_text(encoding="utf-8")
        if not _is_safe_plugin(source):
            logger.warning("Plugin %s bloqueado ...", file_path.name); continue
        ...
        spec.loader.exec_module(module)   # ← ejecuta bytecode completo en el proceso
        ...
        module.register(registry)
```

El filtro `_is_safe_plugin` hace un walk AST con un allowlist extenso (bloquea `os`, `sys`, `subprocess`, `ctypes`, `socket`, `eval`, `exec`, `open`, `getattr`, dunders, metaclass keywords, etc.). Es un buen filtro, **pero los sandboxes Python son bypassables por construcción** — el propio docstring del módulo lo admite: *"Treat third-party plugins as use at your own risk."* Bypasses conocidos: objetos alcanzables sin `getattr`/dunder explícitos (p.ej. `[].clear`, `int.from_bytes`, métodos de tipos incorporados alcanzables por atribución permitida), side-effects en la definición de funciones/clases que el AST no ejecuta pero `exec_module` sí, imports de submódulos no listados, etc.

No hay opt-in: el directorio se escanea y se ejecuta **siempre**. No hay logging de auditoría de qué se cargó (solo `logger.info`).

## Impacto

Cualquier proceso local (o malware, o un script descargado) que tenga permiso de escritura en `%LOCALAPPDATA%\Antares\plugins\` obtiene **ejecución de código persistente dentro del proceso backend** en cada arranque de Antares. El backend tiene acceso a: IPC (y por ende a todos los handlers — ver SEC-003), archivos del usuario, la base SQLite local, y los datos de padron/volantes que procesa (DNI, cuentas, direcciones). Es un vector de **persistencia + exfiltración** ideal para malware que quiera vivir dentro de la app confiada y robar los datos municipales que Antares procesa.

Prerrequisito: escritura local en el directorio de plugins (no es remoto). Por eso P1 y no P0 — pero el sandbox bypassable **amplifica** lo que un atacante con solo "escribir un archivo" puede lograr (de "drop un .py" a "RCE dentro del backend"), y la falsa sensación de seguridad del AST es el problema real.

## Fix propuesto (aditivo, conserva la funcionalidad de plugins)

**No** se elimina ni se desactiva por defecto el sistema de plugins (conserva la funcionalidad). Se añade: (a) **logging de auditoría** de cada plugin cargado (path, mtime, tamaño, SHA-256) a stderr y a un log de auditoría, y (b) un **kill switch** `ANTARES_PLUGINS_DISABLED=1` para entornos que quieran desactivarlo sin tocar código. Opcional más estricto (documentado): opt-in `ANTARES_PLUGINS_ENABLED`.

`backend/core/plugins.py` (cambios aditivos):

```python
import hashlib
import os
# ... imports existentes ...

def _plugin_fingerprint(file_path: Path) -> dict[str, str | int]:
    try:
        stat = file_path.stat()
        h = hashlib.sha256()
        with file_path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                h.update(chunk)
        return {"name": file_path.name, "size": stat.st_size,
                "mtime": int(stat.st_mtime), "sha256": h.hexdigest()}
    except OSError:
        return {"name": file_path.name, "sha256": "<unreadable>"}

def load_plugins_from_dir(plugins_dir: Path | None = None) -> None:
    """Load all .py plugins from the plugins directory."""
    # Kill switch aditivo: no cambia el default (sigue cargando).
    if os.environ.get("ANTARES_PLUGINS_DISABLED", "").lower() in ("1", "true", "yes"):
        logger.info("Plugins deshabilitados por ANTARES_PLUGINS_DISABLED")
        return

    if plugins_dir is None:
        plugins_dir = user_data_path("plugins")
    plugins_dir.mkdir(parents=True, exist_ok=True)

    for file_path in plugins_dir.glob("*.py"):
        if file_path.name.startswith("_"):
            continue
        try:
            fp = _plugin_fingerprint(file_path)              # ← auditoría
            logger.info("Plugin candidato: %s", fp)            # ← a stderr
            source = file_path.read_text(encoding="utf-8")
            if not _is_safe_plugin(source):
                logger.warning("Plugin %s bloqueado por uso de APIs no permitidas (sha256=%s)",
                               file_path.name, fp.get("sha256"))
                continue
            spec = importlib.util.spec_from_file_location(file_path.stem, file_path)
            if spec is None or spec.loader is None:
                continue
            module = importlib.util.module_from_spec(spec)
            module_name = f"_plugin_{file_path.stem}"
            try:
                spec.loader.exec_module(module)
            except Exception:
                sys.modules.pop(module_name, None)
                raise
            sys.modules[module_name] = module
            if hasattr(module, "register"):
                registry = PluginRegistry(get_registry())
                module.register(registry)
                logger.info("Plugin cargado: %s (sha256=%s)", file_path.name, fp.get("sha256"))
            else:
                logger.warning("Plugin %s no tiene función register()", file_path.name)
        except Exception as exc:
            logger.exception("Error cargando plugin %s: %s", file_path.name, exc)
```

`backend/main.py:198` no cambia (sigue llamando `load_plugins_from_dir()`).

**Endurecimiento recomendado (opcional, documentado):** si el equipo quiere opt-in en lugar de default-on, cambiar la guarda a:
```python
if os.environ.get("ANTARES_PLUGINS_ENABLED", "").lower() not in ("1", "true", "yes"):
    logger.info("Plugins no habilitados (set ANTARES_PLUGINS_ENABLED=1)")
    return
```
Esto sí cambia el default (off). Evaluar si hay usuarios reales usando plugins hoy; como `user_data_path("plugins")` no se puebla con nada shipped, lo más seguro es que no haya usuarios dependientes. **Decisión del equipo** — el fix base (auditoría + kill switch) no cambia el default y es el que se recomienda aplicar para respetar "conservar toda la funcionalidad".

## Testing (sin romper nada)

1. **Tests existentes:** `tests/test_plugins.py` — debe seguir pasando (carga normal de un plugin válido; bloqueo de uno con APIs prohibidas).
2. **Nuevo test aditivo — kill switch:**
   ```python
   def test_plugins_disabled_env(monkeypatch, tmp_path):
       monkeypatch.setenv("ANTARES_PLUGINS_DISABLED", "1")
       load_plugins_from_dir(tmp_path)  # tmp_path contiene un plugin válido
       # assert: no se cargó nada (registry vacío)
   ```
3. **Nuevo test — fingerprint/auditoría:** cargar un plugin válido y verificar que se loguea su `sha256` (capurar `caplog`).
4. **Sin env var:** comportamiento idéntico al actual (carga plugins). `tests/test_plugins.py` ya cubre el happy path.
