"""Tests de secuencia por fila de BD en preview y conversion."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.handlers import conversion


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"sequence_mode": "record", "use_filename_seq": False}, "record"),
        ({"sequence_mode": "global", "use_filename_seq": True}, "global"),
        ({"sequence_mode": "desconocido", "use_filename_seq": True}, "filename"),
        ({"use_filename_seq": False}, "global"),
    ],
)
def test_resuelve_modo_de_secuencia_con_compatibilidad(params, expected) -> None:
    assert conversion._resolve_sequence_mode(params) == expected


def test_preview_reinicia_secuencia_por_fila_en_orden_del_lote(monkeypatch, tmp_path) -> None:
    names = [
        "4210502 (7).jpg",
        "SIN_FILA.jpg",
        "4210544 (9).jpg",
        "4210502 (1).jpg",
        "4210544 (2).jpg",
        "4210544 (5).jpg",
    ]
    files = [str(tmp_path / name) for name in names]
    for path in files:
        Path(path).write_text("x")

    rows = {
        "4210502": {"nis": "4210502", "sgio": "69841274"},
        "4210544": {"nis": "4210544", "sgio": "69841278"},
    }
    monkeypatch.setattr(conversion, "_resolve_key_column", lambda key, _files, _columns: key)
    monkeypatch.setattr("backend.core.config_fields.get_field_names", lambda: ["nis", "sgio"])
    monkeypatch.setattr(
        "backend.core.database.buscar_por_columna",
        lambda codes, _column: {code: rows[code] for code in codes if code in rows},
    )

    result = conversion.preview({
        "files": files,
        "patron": "{sgio}_{seq}{ext}",
        "secuencia": 1,
        "sequence_mode": "record",
        "use_filename_seq": True,
        "key_column": "nis",
    })

    assert [item["nuevo"] for item in result["preview"]] == [
        "69841274_001.jpg",
        "SIN_FILA.jpg",
        "69841278_001.jpg",
        "69841274_002.jpg",
        "69841278_002.jpg",
        "69841278_003.jpg",
    ]
