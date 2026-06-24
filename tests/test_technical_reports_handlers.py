import base64

from backend.handlers import HANDLERS


def test_technical_reports_handlers_are_registered(monkeypatch, tmp_path) -> None:
    from backend.core.technical_reports import database as db_module

    monkeypatch.setattr(db_module, "DEFAULT_DB_PATH", tmp_path / "technical_reports.json")
    assert "technical_reports_list" in HANDLERS
    assert "technical_reports_import_file" in HANDLERS


def test_import_file_handler_imports_csv(monkeypatch, tmp_path) -> None:
    from backend.core.technical_reports import database as db_module

    monkeypatch.setattr(db_module, "DEFAULT_DB_PATH", tmp_path / "technical_reports.json")
    content = base64.b64encode(b"Informe;CS;Codigo;Tipo\n1;SUR;RES-1;ELEVADO\n").decode("ascii")

    result = HANDLERS["technical_reports_import_file"]({"filename": "datos.csv", "content_b64": content})

    assert result["imported_count"] == 1
    assert HANDLERS["technical_reports_list"]({"summary": True})["reports"][0]["id"] == "RPT-0001"


def test_render_html_prefers_inline_report_over_database(monkeypatch, tmp_path) -> None:
    from backend.core.technical_reports import database as db_module
    from backend.handlers.technical_reports import HANDLERS

    monkeypatch.setattr(db_module, "DEFAULT_DB_PATH", tmp_path / "technical_reports.json")
    stored = HANDLERS["technical_reports_create"]({})["report"]
    stored["medidas"]["etiqueta_diametro"] = "DIAMETRO"
    stored["medidas"]["etiqueta_diametro_interno"] = "DIAMETRO INTERNO"
    stored["valvulas"]["aduccion"]["3"] = 3
    HANDLERS["technical_reports_update"]({"id": stored["id"], "report": stored})

    inline = dict(stored)
    inline["medidas"]["etiqueta_diametro"] = "LARGO"
    inline["medidas"]["etiqueta_diametro_interno"] = "ANCHO"
    inline["valvulas"]["aduccion"]["4"] = 1
    inline["valvulas"]["impulsion"]["4"] = 1
    inline["valvulas"]["aduccion"]["3"] = 0
    inline["valvulas"]["bypass"]["3"] = 0
    inline["valvulas"]["desague"]["3"] = 0

    result = HANDLERS["technical_reports_render_html"]({"id": stored["id"], "report": inline})

    assert '<td class="row-label">LARGO</td>' in result["html"]
    assert '<td class="row-label">ANCHO</td>' in result["html"]
    assert 'font-weight:bold;">2</td>' in result["html"]


def test_html_to_pdf_handler_removed_from_backend() -> None:
    """html_to_pdf is now handled entirely by Electron's dialog-handlers (NATIVE_METHODS).
    The backend handler was dead code that was never reachable.
    """
    assert "html_to_pdf" not in HANDLERS, "html_to_pdf should not be in backend HANDLERS (Electron handles it)"

