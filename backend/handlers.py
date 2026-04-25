"""Handlers IPC — exponen toda la lógica de negocio al frontend via JSON-RPC."""

from __future__ import annotations

import logging
import os
import tkinter.filedialog as fd
import tkinter as tk
from pathlib import Path
from typing import Any

from backend.core.converter import FORMATOS_SOPORTADOS, procesar_lote
from backend.core.database import (
    buscar_por_codigo,
    buscar_por_indice,
    exportar_excel,
    generar_plantilla_excel,
    importar_excel,
    init_db,
    obtener_todos,
)
from backend.core.config_fields import (
    get_field_names,
    load_fields,
    reset_to_defaults,
    save_fields,
)
from backend.core.config_theme import (
    DEFAULT_THEME,
    PRESETS,
    get_preset_names,
    load_preset,
    load_theme,
    reset_theme,
    save_theme,
)
from backend.core.renamer import RenamerEngine
from backend.utils.paths import resource_path, user_data_path
from backend.utils.validators import parse_filename_parts, sanitizar_nombre, obtener_codigo_desde_nombre
from backend.ipc_protocol import send_notification

logger = logging.getLogger(__name__)

# ─── Estado de procesamiento ────────────────────────────────────────────────

class ProcessState:
    running: bool = False
    progress: int = 0
    total: int = 0
    current_file: str = ""
    ok_count: int = 0
    err_count: int = 0
    logs: list[dict[str, str]] = []
    cancel_requested: bool = False

_state = ProcessState()


def _reset_state() -> None:
    _state.running = False
    _state.progress = 0
    _state.total = 0
    _state.current_file = ""
    _state.ok_count = 0
    _state.err_count = 0
    _state.logs = []
    _state.cancel_requested = False


def _log(msg: str, tag: str = "info") -> None:
    _state.logs.insert(0, {"message": msg, "tag": tag})
    if len(_state.logs) > 100:
        _state.logs.pop()


# ─── Helpers diálogo ────────────────────────────────────────────────────────

def _run_dialog(func, *args, **kwargs) -> list[str]:
    """Ejecuta un diálogo tkinter file/folder picker."""
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    res = func(*args, **kwargs)
    root.destroy()
    return list(res) if isinstance(res, (tuple, list)) else ([res] if res else [])


# ─── Handlers ─────────────────────────────────────────────────────────────────

class Handlers:
    """Todos los métodos IPC expuestos al frontend.
    Cada método recibe params: dict y retorna un dict/list/primitive.
    """

    # ─── Info ────────────────────────────────────────────────────────────────

    @staticmethod
    def version(params: dict[str, Any]) -> dict[str, str]:
        return {"version": "0.2.0"}

    @staticmethod
    def formats(params: dict[str, Any]) -> dict[str, list[str]]:
        return {"formats": list(FORMATOS_SOPORTADOS.keys())}

    # ─── Diálogos ────────────────────────────────────────────────────────────

    @staticmethod
    def dialog_files(params: dict[str, Any]) -> dict[str, list[str]]:
        return {"paths": _run_dialog(fd.askopenfilenames, title="Seleccionar archivos")}

    @staticmethod
    def dialog_folder(params: dict[str, Any]) -> dict[str, list[str]]:
        return {"paths": _run_dialog(fd.askdirectory, title="Seleccionar carpeta")}

    @staticmethod
    def dialog_dest(params: dict[str, Any]) -> dict[str, list[str]]:
        return {"paths": _run_dialog(fd.askdirectory, title="Seleccionar destino")}

    @staticmethod
    def dialog_save(params: dict[str, Any]) -> dict[str, list[str]]:
        return {"paths": _run_dialog(fd.asksaveasfilename, title="Guardar archivo")}

    # ─── Base de datos ───────────────────────────────────────────────────────

    @staticmethod
    def db_records(params: dict[str, Any]) -> dict[str, Any]:
        return {"records": obtener_todos(), "fields": get_field_names()}

    @staticmethod
    def db_import(params: dict[str, Any]) -> dict[str, int]:
        path = params.get("path", "")
        n = importar_excel(path)
        return {"imported": n}

    @staticmethod
    def db_export(params: dict[str, Any]) -> dict[str, int]:
        path = params.get("path", "")
        n = exportar_excel(path)
        return {"exported": n}

    @staticmethod
    def db_template(params: dict[str, Any]) -> dict[str, Any]:
        path = params.get("path", "")
        generar_plantilla_excel(path)
        return {"path": path}

    @staticmethod
    def scan_folder(params: dict[str, Any]) -> dict[str, list[str]]:
        folder = params.get("folder", "")
        path = Path(folder)
        if not path.is_dir():
            return {"files": []}
        exts = []
        for info in FORMATOS_SOPORTADOS.values():
            exts.extend([e.lower() for e in info["ext"]])
            exts.extend([e.upper() for e in info["ext"]])
        files = [str(f.resolve()) for f in path.rglob("*") if f.is_file() and f.suffix in exts]
        return {"files": files}

    # ─── Campos ─────────────────────────────────────────────────────────────

    @staticmethod
    def db_fields(params: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        return {"fields": load_fields()}

    @staticmethod
    def db_fields_update(params: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        fields = params.get("fields", [])
        return {"fields": save_fields(fields)}

    @staticmethod
    def db_fields_reset(params: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        from core.config_fields import reset_to_defaults
        return {"fields": reset_to_defaults()}

    # ─── Temas ───────────────────────────────────────────────────────────────

    @staticmethod
    def theme_get(params: dict[str, Any]) -> dict[str, str]:
        return load_theme()

    @staticmethod
    def theme_save(params: dict[str, Any]) -> dict[str, str]:
        return save_theme(params)

    @staticmethod
    def theme_presets(params: dict[str, Any]) -> dict[str, list[str]]:
        return {"presets": list(PRESETS.keys())}

    @staticmethod
    def theme_preset(params: dict[str, Any]) -> dict[str, str]:
        name = params.get("name", "")
        return load_preset(name)

    @staticmethod
    def theme_reset(params: dict[str, Any]) -> dict[str, str]:
        return reset_theme()

    # ─── Proceso y Vista Previa ────────────────────────────────────────────

    @staticmethod
    def preview(params: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        files = params.get("files", [])
        patron = params.get("patron", "")
        secuencia = params.get("secuencia", 1)
        use_filename_seq = params.get("use_filename_seq", True)

        engine = RenamerEngine(patron, secuencia)

        file_seqs = {}
        codigos_manuales = {}
        for f in files:
            code, seq = parse_filename_parts(Path(f).name)
            codigos_manuales[Path(f).name] = code
            if use_filename_seq:
                file_seqs[Path(f).name] = seq

        def lookup(codigo: str) -> dict[str, Any] | None:
            return buscar_por_codigo(codigo)

        res = engine.preview_lote(files, lookup_fn=lookup, codigos_manuales=codigos_manuales, file_seqs=file_seqs)
        preview = [{"origen": Path(orig).name, "nuevo": nuev, "en_bd": en_bd} for orig, nuev, en_bd in res]
        return {"preview": preview}

    @staticmethod
    def process_start(params: dict[str, Any]) -> dict[str, bool]:
        if _state.running:
            return {"started": False}
        _reset_state()
        _state.running = True
        _state.total = len(params.get("files", []))

        # Iniciar en un thread separado
        import threading
        t = threading.Thread(target=_process_thread, args=(params,), daemon=True)
        t.start()
        return {"started": True}

    @staticmethod
    def process_status(params: dict[str, Any]) -> dict[str, Any]:
        return {
            "running": _state.running,
            "progress": _state.progress,
            "current_file": _state.current_file,
            "ok_count": _state.ok_count,
            "err_count": _state.err_count,
            "logs": _state.logs,
        }

    @staticmethod
    def process_cancel(params: dict[str, Any]) -> dict[str, bool]:
        _state.cancel_requested = True
        return {"cancelled": True}

    @staticmethod
    def preview_image(params: dict[str, Any]) -> dict[str, str]:
        from backend.core.converter import convertir_a_preview
        path = params.get("path", "")
        formato = params.get("formato", "PNG")
        calidad = params.get("calidad", 85)
        resize = params.get("resize")
        preview = convertir_a_preview(path, formato, calidad, resize)
        return {"preview": preview}


def _process_thread(params: dict[str, Any]) -> None:
    """Thread de procesamiento en background."""
    files = params.get("files", [])
    destino = params.get("destino", "")
    formato = params.get("formato", "JPEG")
    calidad = params.get("calidad", 95)
    resize_ancho = params.get("resize_ancho")
    resize_alto = params.get("resize_alto")
    keep_exif = params.get("keep_exif", False)
    usar_rename = params.get("usar_rename", True)
    patron = params.get("patron", "")
    secuencia = params.get("secuencia", 1)
    use_filename_seq = params.get("use_filename_seq", True)

    engine = RenamerEngine(patron, secuencia) if usar_rename else None

    resize = None
    if resize_ancho and resize_alto:
        resize = (int(resize_ancho), int(resize_alto))

    for i, fpath in enumerate(files):
        if _state.cancel_requested:
            _log("Proceso cancelado por el usuario", "warn")
            break

        p = Path(fpath)
        _state.progress = int(((i + 1) / len(files)) * 100)
        _state.current_file = p.name

        send_notification("process.progress", {
            "progress": _state.progress,
            "current_file": _state.current_file,
            "ok_count": _state.ok_count,
            "err_count": _state.err_count,
        })

        # Renombrado
        if engine:
            codigo, seq = parse_filename_parts(p.name)
            datos = buscar_por_codigo(codigo)
            fseq = seq if use_filename_seq else None
            nuevo_nombre = engine.aplicar(p, datos_bd=datos, codigo_manual=codigo, file_seq=fseq)
            out_path = Path(destino) / nuevo_nombre
        else:
            ext = FORMATOS_SOPORTADOS[formato]["ext"]
            out_path = Path(destino) / (p.stem + ext)

        try:
            res = procesar_lote([fpath], Path(destino), formato, calidad, resize, keep_exif)
            if res and isinstance(res[0], Path):
                if engine and res[0].name != out_path.name:
                    res[0].rename(out_path)
                _state.ok_count += 1
                _log(f"Procesado: {out_path.name}", "ok")
            else:
                _state.err_count += 1
                _log(f"Error: {res[0]}", "error")
        except Exception as e:
            _state.err_count += 1
            _log(f"Error: {p.name} -> {e}", "error")

    _state.running = False
    _state.progress = 100
    _log("Proceso finalizado.", "info")
    send_notification("process.complete", {"ok_count": _state.ok_count, "err_count": _state.err_count})


# ─── Router ─────────────────────────────────────────────────────────────────

HANDLERS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "version": Handlers.version,
    "formats": Handlers.formats,
    "dialog_files": Handlers.dialog_files,
    "dialog_folder": Handlers.dialog_folder,
    "dialog_dest": Handlers.dialog_dest,
    "dialog_save": Handlers.dialog_save,
    "db_records": Handlers.db_records,
    "db_import": Handlers.db_import,
    "db_export": Handlers.db_export,
    "db_template": Handlers.db_template,
    "scan_folder": Handlers.scan_folder,
    "db_fields": Handlers.db_fields,
    "db_fields_update": Handlers.db_fields_update,
    "db_fields_reset": Handlers.db_fields_reset,
    "theme_get": Handlers.theme_get,
    "theme_save": Handlers.theme_save,
    "theme_presets": Handlers.theme_presets,
    "theme_preset": Handlers.theme_preset,
    "theme_reset": Handlers.theme_reset,
    "preview": Handlers.preview,
    "process_start": Handlers.process_start,
    "process_status": Handlers.process_status,
    "process_cancel": Handlers.process_cancel,
    "preview_image": Handlers.preview_image,
}
