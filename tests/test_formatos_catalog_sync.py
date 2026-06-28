"""Anti-drift guard for the built-in formats single source of truth (simplification-023).

`_BUILTIN_FORMATS` in `backend/core/formatos.py` is the canonical source of the
built-in format defaults (template-d, maquina, televisiva). The repo's
`data/formatos/catalog.json` is the persisted state (UI customizations + uploaded
formats) and may override built-in mappings at load time. To keep the two from
silently diverging again (the original 023 bug: maquina.x=535 in Python vs
531.47 on disk), this test asserts that every built-in entry present in the repo
catalog matches the Python defaults field-for-field.

The test reads the repo catalog.json directly from disk (independent of the
module's `_CATALOG_PATH`, which other tests monkeypatch) so it always reflects
the committed file. Uploaded entries in the catalog are ignored — only built-ins
must stay in sync.
"""
from __future__ import annotations

import json
from pathlib import Path

from backend.core import formatos

_REPO_ROOT = Path(__file__).resolve().parent.parent
_REPO_CATALOG = _REPO_ROOT / "data" / "formatos" / "catalog.json"

# Fields that define a built-in's identity and rendering behavior. `has_mapping`
# is derived from `mapping is not None` (both _load_catalog and list_formats
# recompute it), so we compare the derived value rather than the stored one.
_BUILTIN_FIELDS = (
    "nombre",
    "origen",
    "storage_path",
    "strategy",
    "filename_pattern",
    "max_pages",
    "number_min",
    "number_max",
)
_MAPPING_FIELDS = (
    "page",
    "x",
    "y",
    "width",
    "height",
    "font_size",
    "font_name",
    "color_r",
    "color_g",
    "color_b",
    "padding",
    "blank_x",
    "blank_y",
    "blank_width",
    "blank_height",
    "redraw_top_border",
    "redraw_ot_badge",
    "blank_mcids",
)


def _has_mapping(entry: dict) -> bool:
    return entry.get("mapping") is not None


def test_repo_catalog_builtins_match_python_defaults() -> None:
    """Every built-in entry in data/formatos/catalog.json must match _BUILTIN_FORMATS.

    If the repo catalog.json is absent (e.g. a fresh checkout that relies solely
    on Python defaults), there is no drift surface and the test passes trivially.
    """
    if not _REPO_CATALOG.exists():
        return

    catalog = json.loads(_REPO_CATALOG.read_text(encoding="utf-8"))
    catalog_by_id = {entry["id"]: entry for entry in catalog if "id" in entry}

    for builtin in formatos._BUILTIN_FORMATS:
        fid = builtin["id"]
        on_disk = catalog_by_id.get(fid)
        assert on_disk is not None, (
            f"Built-in {fid!r} missing from repo catalog.json "
            f"({_REPO_CATALOG}); add it or it will be shadowed by Python defaults only"
        )

        assert on_disk.get("origen") == "builtin", (
            f"catalog.json entry {fid!r} has origen={on_disk.get('origen')!r}, "
            f"expected 'builtin'"
        )

        for field in _BUILTIN_FIELDS:
            assert on_disk.get(field) == builtin.get(field), (
                f"Built-in {fid!r} field {field!r} drift: "
                f"catalog.json={on_disk.get(field)!r} vs Python={builtin.get(field)!r}"
            )

        assert _has_mapping(on_disk) == _has_mapping(builtin), (
            f"Built-in {fid!r} has_mapping drift: "
            f"catalog.json={_has_mapping(on_disk)} vs Python={_has_mapping(builtin)}"
        )

        py_mapping = builtin.get("mapping")
        disk_mapping = on_disk.get("mapping")
        if py_mapping is None:
            assert disk_mapping is None, (
                f"Built-in {fid!r} should have no mapping but catalog.json defines one"
            )
            continue

        for field in _MAPPING_FIELDS:
            assert disk_mapping.get(field) == py_mapping.get(field), (
                f"Built-in {fid!r} mapping field {field!r} drift: "
                f"catalog.json={disk_mapping.get(field)!r} vs "
                f"Python={py_mapping.get(field)!r}"
            )
