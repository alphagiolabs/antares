"""Helpers para rutas compatibles con PyInstaller y ejecución desde fuente."""

from __future__ import annotations

import os
import sys
from pathlib import Path

_config_path_cache: dict[str, Path] = {}


def resource_path(relative_path: str) -> Path:
    """
    Resuelve la ruta absoluta a un recurso empaquetado.
    En ejecución desde fuente usa la ruta del módulo.
    En PyInstaller onefile usa sys._MEIPASS (directorio temporal de extracción).
    """
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        base = Path(sys._MEIPASS)
    else:
        base = Path(__file__).resolve().parent.parent.parent
    return base / relative_path


def user_data_path(relative_path: str) -> Path:
    """
    Resuelve una ruta writable para datos de usuario (BD, logs, etc.).
    En Windows: %LOCALAPPDATA%\\ANTARES
    En macOS: ~/Library/Application Support/ANTARES
    En Linux: ~/.local/share/ANTARES
    """
    app_name = "Antares"
    if sys.platform == "win32":
        local = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / app_name
    elif sys.platform == "darwin":
        local = Path.home() / "Library" / "Application Support" / app_name
    else:
        local = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / app_name

    local.mkdir(parents=True, exist_ok=True)
    return local / relative_path


def cached_config_path(key: str, filename: str) -> Path:
    """Return and cache a user-data path for a config file.

    Avoids repeated filesystem resolution for the same config file.
    The *key* is a unique identifier (e.g. 'fields', 'patterns', 'theme').
    """
    cached = _config_path_cache.get(key)
    if cached is None:
        cached = user_data_path(filename)
        _config_path_cache[key] = cached
    return cached


# ─── Path confinement (SEC-003) ─────────────────────────────────────────────
# is_safe_user_path solo bloquea patrones ".."; NO bloquea paths absolutos
# como C:\Windows\System32 o /etc. Estas helpers anaden un piso duro (directorios
# sensibles del sistema siempre rechazados) + confinamiento positivo opcional a
# raices permitidas (allowed_roots). Con allowed_roots vacio solo aplica el piso
# de system-sensitive, preservando el comportamiento existente donde el renderer
# opera sobre archivos del usuario en cualquier parte legible del disco.
# ponytail: la denylist de system-dirs es la capa verificable que no rompe
# funcionalidad (Capa 1). El confinamiento positivo a raices vouchs por el
# dialogo nativo (Capa 2) requiere wiring del frontend y se documenta en
# issues/security-003; este helper ya lo soporta via allowed_roots.

# SEC-003: single canonical denylist (lowercase + forward-slash) shared with
# backend.utils.validators._is_system_sensitive_path_str. Adding a root here
# covers both the Path-based sellador check and the pure-string IPC screen, so
# the two defense-in-depth layers can no longer drift.
_SYSTEM_SENSITIVE_ROOTS: tuple[str, ...] = (
    "c:/windows", "c:/program files", "c:/program files (x86)", "c:/programdata",
    "/etc", "/usr", "/bin", "/sbin", "/proc", "/sys", "/dev", "/boot",
    "/lib", "/lib64", "/root",
)
_SYSTEM_SENSITIVE_ROOTS_PREFIXED: tuple[str, ...] = tuple(r + "/" for r in _SYSTEM_SENSITIVE_ROOTS)


def is_system_sensitive_path(resolved: Path) -> bool:
    """True si resolved es igual a o esta bajo un directorio system-sensitive."""
    norm = str(Path(resolved).resolve()).strip().lower().replace("\\", "/")
    if norm in _SYSTEM_SENSITIVE_ROOTS:
        return True
    return any(norm.startswith(p) for p in _SYSTEM_SENSITIVE_ROOTS_PREFIXED)


def assert_path_within_root(
    resolved: Path, allowed_roots: tuple[Path, ...] = (), *, label: str = "Ruta"
) -> None:
    """Confinar un path resuelto. Lanza ValueError si es system-sensitive o,
    cuando allowed_roots es no vacio, si no esta bajo alguna de ellas.

    Con allowed_roots vacio (default, backward compatible) solo se aplica el
    piso de system-sensitive, asi los flujos existentes que operan sobre
    archivos elegidos por el usuario en cualquier lado siguen funcionando.
    """
    r = Path(resolved).resolve()
    if is_system_sensitive_path(r):
        msg = f"{label} apunta a una ubicacion del sistema no permitida"
        raise ValueError(msg)
    for root in allowed_roots:
        try:
            r.relative_to(Path(root).resolve())
            return
        except ValueError:
            continue
    if allowed_roots:
        msg = f"{label} fuera de los directorios permitidos"
        raise ValueError(msg)


# ─── SEC-003 Capa 2: confinamiento positivo a raíces vouched ────────────────
# El main process (electron/ipc-router.js) strippea cualquier allowed_roots que
# venga del renderer y deriva los suyos del registro de vouchers de diálogos
# nativos (electron/vouched-paths.js). En modo warn el router NO inyecta
# allowed_roots, así resolve_allowed_roots devuelve () y guard_user_path solo
# aplica el piso system-sensitive (redundante con is_safe_user_path del límite
# IPC) — cero cambio de comportamiento. En modo enforce el router inyecta las
# raíces vouched y guard_user_path confina cada path a ellas.
def resolve_allowed_roots(params: dict) -> tuple[Path, ...]:
    """Raíces vouched inyectadas por el main process. Vacío (warn) => solo piso."""
    raw = (params or {}).get("allowed_roots") if isinstance(params, dict) else None
    if not isinstance(raw, list):
        return ()
    return tuple(Path(p).expanduser().resolve() for p in raw if isinstance(p, str) and p)


def guard_user_path(path_str: str, params: dict, *, label: str = "Ruta") -> Path:
    """Resuelve y confina un path de usuario al piso system-sensitive + raíces
    vouched (cuando el router las inyecta). Devuelve el Path resuelto."""
    resolved = Path(path_str).expanduser().resolve()
    assert_path_within_root(resolved, resolve_allowed_roots(params), label=label)
    return resolved
