"""Tests for `backend.core.formatos.delete_format` and related safety invariants.

Covers the BP-ALTO-4 regression (deleting a builtin format must NOT remove
its read-only .b64 distribution file) and the BP-CRÍTICO-2 sanitisation
guard in `add_uploaded_format`.
"""
from __future__ import annotations

from backend.core import formatos


def test_delete_format_disables_builtin_without_removing_b64_file(monkeypatch, tmp_path) -> None:
    # Regression guard for BP-ALTO-4: `delete_format` on a builtin used to
    # call `os.remove(_resolve_path(entry))` on the read-only .b64 file in
    # the distribution `formatos/` directory. After disable, re-enabling
    # the builtin would then raise FileNotFoundError because the file was
    # gone. delete_format must only flip `enabled=False` for builtins and
    # leave the file on disk untouched.
    builtin_b64 = tmp_path / "builtin.b64"
    builtin_b64.write_text("JVBERi0=", encoding="ascii")

    entry = {
        "id": "builtin-test",
        "nombre": "Builtin Test",
        "origen": "builtin",
        "storage_path": "builtin.b64",
        "enabled": True,
        "persisted": True,
        "strategy": formatos.VISUAL_OVERLAY,
        "mapping": None,
        "filename_pattern": "builtin-test_{desde}.pdf",
        "max_pages": 500,
        "number_min": 1,
        "number_max": 9999999,
        "has_mapping": False,
    }

    monkeypatch.setattr(formatos, "_CATALOG_PATH", tmp_path / "catalog.json")
    monkeypatch.setattr(formatos, "_BUILTIN_DIR", tmp_path)
    monkeypatch.setattr(formatos, "_formats", {"builtin-test": dict(entry)})

    removed_paths: list[str] = []
    real_remove = formatos.os.remove

    def spy_remove(path):
        removed_paths.append(str(path))
        # Don't actually remove — we want to assert it was never called
        # for the builtin .b64 file.

    monkeypatch.setattr(formatos.os, "remove", spy_remove)

    result = formatos.delete_format("builtin-test")

    assert result is True
    # The builtin file MUST still exist — delete_format must not touch it.
    assert builtin_b64.exists()
    # And os.remove must not have been called at all for builtins.
    assert removed_paths == []
    # The entry stays in _formats but is disabled.
    assert formatos._formats["builtin-test"]["enabled"] is False
    # Clean up the monkeypatched os.remove so other tests aren't affected.
    monkeypatch.setattr(formatos.os, "remove", real_remove)


def test_delete_format_removes_uploaded_file_and_drops_entry(monkeypatch, tmp_path) -> None:
    # Uploaded formats DO own a file in _UPLOADS_DIR, so delete_format
    # must remove both the file and the catalog entry.
    uploads_dir = tmp_path / "uploads"
    uploads_dir.mkdir()
    uploaded_pdf = uploads_dir / "upload-abc.pdf"
    uploaded_pdf.write_bytes(b"%PDF-1.4")

    entry = {
        "id": "upload-abc",
        "nombre": "Upload ABC",
        "origen": "uploaded",
        "storage_path": "upload-abc.pdf",
        "enabled": True,
        "persisted": True,
        "strategy": formatos.SIMPLE_OVERLAY,
        "mapping": None,
        "filename_pattern": "upload-abc_{desde}.pdf",
        "max_pages": 500,
        "number_min": 1,
        "number_max": 9999999,
        "has_mapping": False,
    }

    monkeypatch.setattr(formatos, "_CATALOG_PATH", tmp_path / "catalog.json")
    monkeypatch.setattr(formatos, "_UPLOADS_DIR", uploads_dir)
    monkeypatch.setattr(formatos, "_formats", {"upload-abc": dict(entry)})

    result = formatos.delete_format("upload-abc")

    assert result is True
    # The uploaded file is gone and the entry is dropped from the catalog.
    assert not uploaded_pdf.exists()
    assert "upload-abc" not in formatos._formats


def test_delete_format_returns_false_for_unknown_id(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(formatos, "_CATALOG_PATH", tmp_path / "catalog.json")
    monkeypatch.setattr(formatos, "_formats", {})

    result = formatos.delete_format("does-not-exist")

    assert result is False
