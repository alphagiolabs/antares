"""Resolución lazy del shim público para puntos parcheables por tests.

Los tests hacen ``from backend.handlers import ubicaciones as ub`` y luego
``monkeypatch.setattr(ub, "_http_get", ...)`` /
``monkeypatch.setattr("backend.handlers.ubicaciones.ThreadPoolExecutor", ...)``.
Tras el split, si un módulo core bindea esos símbolos al importar (top-level),
el patch en el shim NO se ve (binding local ya fijado — fue el motivo por el
que simplification-002/017 se descartaron). Esta helper devuelve el módulo shim
en runtime, así los call sites resuelven los símbolos parcheables vía attribute
access y los patches atrapan.

Se llama dentro de funciones (runtime), nunca a import time, para evitar el
ciclo shim ↔ core.
"""
from __future__ import annotations

from types import ModuleType


def patch_module() -> ModuleType:
    import backend.handlers.ubicaciones as ub  # lazy: evita ciclo en import time

    return ub
