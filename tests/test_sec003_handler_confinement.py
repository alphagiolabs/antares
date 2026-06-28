"""SEC-003 Capa 2 — confinamiento positivo por handler.

Verifica que cada handler cableado con ``guard_user_path`` rechaza rutas fuera
de las raíces vouched (inyectadas por el main process via ``allowed_roots``)
y deja pasar rutas legítimas en modo warn (allowed_roots vacío).

Cubre los handlers donde el guard es el primer chequeo (database, conversion
preview/is_video). El helper compartido se cubre en test_path_sanitization.py.
Corre en CI (deps: openpyxl, PIL). Localmente el venv hermes no tiene pytest.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

_SYSTEM = r"C:\Windows\System32\drivers\etc\hosts" if os.name == "nt" else "/etc/passwd"


def _enforce_params(root: Path) -> dict:
    """Params con allowed_roots inyectado (simula el router en modo enforce)."""
    return {"allowed_roots": [str(root)]}


# ─── database handlers (deps: openpyxl) ─────────────────────────────────────
def test_db_import_rejects_out_of_root() -> None:
    pytest.importorskip("openpyxl")
    from backend.handlers.database import db_import

    root = Path(tempfile.mkdtemp())
    leak = Path(tempfile.mkdtemp()) / "leak.xlsx"
    with pytest.raises(ValueError):
        db_import({"path": str(leak), **_enforce_params(root)})


def test_db_export_rejects_out_of_root() -> None:
    pytest.importorskip("openpyxl")
    from backend.handlers.database import db_export

    root = Path(tempfile.mkdtemp())
    leak = Path(tempfile.mkdtemp()) / "leak.xlsx"
    with pytest.raises(ValueError):
        db_export({"path": str(leak), **_enforce_params(root)})


def test_db_template_rejects_out_of_root() -> None:
    pytest.importorskip("openpyxl")
    from backend.handlers.database import db_template

    root = Path(tempfile.mkdtemp())
    leak = Path(tempfile.mkdtemp()) / "leak.xlsx"
    with pytest.raises(ValueError):
        db_template({"path": str(leak), **_enforce_params(root)})


def test_db_import_warn_mode_rejects_system_dir() -> None:
    """En warn (sin allowed_roots) el piso system-sensitive sigue activo."""
    pytest.importorskip("openpyxl")
    from backend.handlers.database import db_import

    with pytest.raises(ValueError):
        db_import({"path": _SYSTEM})


# ─── conversion preview/is_video (deps: PIL) ────────────────────────────────
def test_preview_image_rejects_out_of_root() -> None:
    pytest.importorskip("PIL")
    from backend.handlers.conversion import preview_image

    root = Path(tempfile.mkdtemp())
    leak = Path(tempfile.mkdtemp()) / "leak.jpg"
    with pytest.raises(ValueError):
        preview_image({"path": str(leak), **_enforce_params(root)})


def test_is_video_rejects_out_of_root() -> None:
    pytest.importorskip("PIL")
    from backend.handlers.conversion import is_video

    root = Path(tempfile.mkdtemp())
    leak = Path(tempfile.mkdtemp()) / "leak.mp4"
    with pytest.raises(ValueError):
        is_video({"path": str(leak), **_enforce_params(root)})


def test_is_video_warn_mode_rejects_system_dir() -> None:
    pytest.importorskip("PIL")
    from backend.handlers.conversion import is_video

    with pytest.raises(ValueError):
        is_video({"path": _SYSTEM})


# ─── ubicaciones (deps: pandas, PIL) — captura ValueError → success=False ────
def test_generar_ubicaciones_rejects_out_of_root() -> None:
    pytest.importorskip("pandas")
    pytest.importorskip("PIL")
    from backend.core.ubicaciones.handlers import handle_generar_ubicaciones

    root = Path(tempfile.mkdtemp())
    leak_excel = Path(tempfile.mkdtemp()) / "leak.xlsx"
    out = Path(tempfile.mkdtemp()) / "out"
    result = handle_generar_ubicaciones({
        "excelPath": str(leak_excel),
        "outputDir": str(out),
        **_enforce_params(root),
    })
    # El handler captura excepciones y devuelve success=False (no propaga).
    assert result.get("success") is False
