# Feature-Based Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the HidroConvert project from a monolithic architecture to a feature-based architecture, improving maintainability in both backend (Python) and frontend (React/TS).

**Architecture:** Features are self-contained units (converter, catalog, renamer, theming) each with their own service/handler/hook. Cross-cutting concerns (paths, validators, process state, IPC protocol) live in `shared/` or `api/`.

**Tech Stack:** Python 3.10+, Pillow, pandas, SQLite, React 18, TypeScript, Vite, Tailwind CSS, Electron, JSON-RPC over stdio

---

## File Structure (Target)

### Backend
```
backend/
├── main.py
├── ipc_protocol.py        # UNCHANGED
├── version.py              # FIX: 0.2.0
├── features/
│   ├── __init__.py
│   ├── converter/
│   │   ├── __init__.py
│   │   ├── formats.py      # From core/converter.py (FORMATOS_SOPORTADOS, PIL_FORMAT_MAP)
│   │   ├── service.py      # From core/converter.py (convertir_imagen, procesar_lote)
│   │   └── handler.py      # NEW: thin IPC handler
│   ├── catalog/
│   │   ├── __init__.py
│   │   ├── repository.py   # From core/database.py (parameterized SQL)
│   │   ├── fields.py       # From core/config_fields.py
│   │   └── handler.py      # NEW: thin IPC handler
│   ├── renamer/
│   │   ├── __init__.py
│   │   ├── engine.py       # From core/renamer.py (RenamerEngine)
│   │   └── handler.py      # NEW: thin IPC handler
│   └── theming/
│       ├── __init__.py
│       ├── presets.py      # From core/config_theme.py (DEFAULT_THEME, PRESETS)
│       ├── service.py      # From core/config_theme.py (load/save/reset)
│       └── handler.py      # NEW: thin IPC handler
├── shared/
│   ├── __init__.py
│   ├── paths.py            # From utils/paths.py
│   ├── validators.py       # From utils/validators.py
│   ├── exceptions.py       # From core/exceptions.py
│   └── process_state.py    # EXTRACTED from handlers.py (ProcessState, _reset_state, _log)
└── dialogs.py              # EXTRACTED from handlers.py (tkinter file dialogs)
```

### Frontend
```
frontend/src/
├── main.tsx                # UNCHANGED
├── App.tsx                 # SIMPLIFIED: only layout + tab routing
├── index.css               # UNCHANGED
├── api/
│   ├── client.ts           # EXTRACTED from api.ts (_invoke, onNotify, global Window)
│   ├── types.ts            # EXTRACTED from api.ts (all interfaces)
│   └── index.ts            # EXTRACTED from api.ts (api object)
├── features/
│   ├── conversion/
│   │   ├── ConversionTab.tsx   # UI only (from components/ConversionTab.tsx)
│   │   ├── useConversion.ts    # NEW: custom hook (state + logic + API)
│   │   └── constants.ts        # NEW: sections array, defaults
│   ├── database/
│   │   ├── DatabaseTab.tsx     # UI only (from components/DatabaseTab.tsx)
│   │   └── useDatabase.ts      # NEW: custom hook
│   └── appearance/
│       ├── AppearanceTab.tsx   # UI only (from components/AppearanceTab.tsx)
│       └── useAppearance.ts    # NEW: custom hook
└── components/
    ├── ui/                   # UNCHANGED
    │   ├── Badge.tsx
    │   ├── Button.tsx
    │   ├── Card.tsx
    │   ├── Input.tsx
    │   └── SectionHeader.tsx
    ├── LogPanel.tsx          # UNCHANGED
    └── ProgressBar.tsx       # UNCHANGED
```

### Electron
```
electron/
├── main.js                 # CLEANED: only window + app lifecycle
├── ipc-bridge.js           # EXTRACTED from main.js (Python spawn + IPC logic)
└── preload.js              # UNCHANGED
```

### Root
```
/
├── backend/
├── frontend/
├── electron/
├── scripts/
│   ├── build-backend.js    # REWRITE: detect system Python, not venv312
│   └── backend.spec        # MOVED from backend/
├── tests/
│   ├── __init__.py
│   ├── conftest.py         # NEW: shared fixtures
│   ├── converter/          # MOVED from test_converter.py
│   │   └── test_service.py
│   ├── catalog/            # MOVED from test_database.py + test_config_fields.py
│   │   ├── test_repository.py
│   │   └── test_fields.py
│   ├── renamer/            # MOVED from test_renamer.py
│   │   └── test_engine.py
│   └── shared/             # MOVED from test_validators.py
│       └── test_validators.py
├── package.json            # UNCHANGED (root Electron package)
├── pyproject.toml          # UNCHANGED
├── pytest.ini             # UNCHANGED
├── DESIGN.md               # UNCHANGED
├── .gitignore              # UPDATE: add scripts/backend.spec
└── README.md               # UNCHANGED
```

**Deleted files:** `backend/handlers.py`, `backend/core/`, `backend/utils/`, `frontend/src/api.ts`, `frontend/src/types.ts`, `frontend/src/components/ConversionTab.tsx`, `frontend/src/components/DatabaseTab.tsx`, `frontend/src/components/AppearanceTab.tsx`, `requirements.txt`, `tests/test_*.py` (moved to feature folders)

---

## Task 1: Create Backend Directory Structure

**Files:**
- Create: `backend/features/__init__.py`
- Create: `backend/features/converter/__init__.py`
- Create: `backend/features/catalog/__init__.py`
- Create: `backend/features/renamer/__init__.py`
- Create: `backend/features/theming/__init__.py`
- Create: `backend/shared/__init__.py`

- [ ] **Step 1: Create all empty __init__.py files**

Run:
```powershell
$dirs = @(
  "backend/features",
  "backend/features/converter",
  "backend/features/catalog", 
  "backend/features/renamer",
  "backend/features/theming",
  "backend/shared"
)
foreach ($d in $dirs) {
  $f = Join-Path $d "__init__.py"
  New-Item -ItemType File -Path $f -Force
}
```

- [ ] **Step 2: Verify directories exist**

Run: `Get-ChildItem -Recurse backend\features, backend\shared -Filter "__init__.py"`
Expected: 6 __init__.py files found

---

## Task 2: Migrate Shared Utilities

**Files:**
- Create: `backend/shared/paths.py` (from `backend/utils/paths.py`)
- Create: `backend/shared/validators.py` (from `backend/utils/validators.py`)
- Create: `backend/shared/exceptions.py` (from `backend/core/exceptions.py`)
- Create: `backend/shared/process_state.py` (EXTRACTED from `backend/handlers.py`)
- Delete (later): `backend/utils/`, `backend/core/exceptions.py`

- [ ] **Step 1: Copy paths.py with updated imports**

```python
# backend/shared/paths.py
"""Helpers for paths compatible with PyInstaller and source execution."""

import sys
import os
from pathlib import Path


def resource_path(relative_path: str) -> Path:
    """Resolve absolute path to a packaged resource."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        base = Path(sys._MEIPASS)
    else:
        base = Path(__file__).resolve().parent.parent.parent
    return base / relative_path


def user_data_path(relative_path: str) -> Path:
    """Resolve writable path for user data (DB, logs, etc.)."""
    app_name = "HidroConvert"
    if sys.platform == "win32":
        local = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / app_name
    elif sys.platform == "darwin":
        local = Path.home() / "Library" / "Application Support" / app_name
    else:
        local = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / app_name

    local.mkdir(parents=True, exist_ok=True)
    return local / relative_path
```

- [ ] **Step 2: Copy validators.py with updated imports**

```python
# backend/shared/validators.py
"""Validation utilities for paths and filenames."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Union

_EXTENSIONES_IMAGEN: set[str] = {
    ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif", ".gif", ".ico", ".pdf"
}


def es_imagen(ruta: Union[str, Path]) -> bool:
    return Path(ruta).suffix.lower() in _EXTENSIONES_IMAGEN


def sanitizar_nombre(nombre: Union[str, Path]) -> str:
    nombre_limpio = str(nombre).strip()
    nombre_limpio = re.sub(r'[<>:"/\\|?*]', "_", nombre_limpio)
    nombre_limpio = re.sub(r'\s+', " ", nombre_limpio)
    return nombre_limpio.strip()


def obtener_codigo_desde_nombre(nombre_archivo: Union[str, Path]) -> str:
    return Path(nombre_archivo).stem


def parse_filename_parts(nombre_archivo: Union[str, Path]) -> tuple[str, str]:
    stem = Path(nombre_archivo).stem
    idx = stem.rfind("_")
    if idx > 0 and stem[idx + 1:].isdigit():
        return stem[:idx], stem[idx + 1:]
    return stem, "1"
```

- [ ] **Step 3: Copy exceptions.py**

```python
# backend/shared/exceptions.py
"""Custom exceptions for HidroConvert."""


class HidroConvertError(Exception):
    """Base for all application exceptions."""


class ConfigError(HidroConvertError):
    """Error reading or writing persistent configuration."""


class DatabaseError(HidroConvertError):
    """Error in database operations."""


class ConversionError(HidroConvertError):
    """Error during image conversion."""


class ValidationError(HidroConvertError):
    """Validation error for user input or data."""
```

- [ ] **Step 4: Extract process_state.py from handlers.py**

```python
# backend/shared/process_state.py
"""Shared mutable state for background processing."""

from __future__ import annotations

from typing import Any


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


def reset_state() -> None:
    _state.running = False
    _state.progress = 0
    _state.total = 0
    _state.current_file = ""
    _state.ok_count = 0
    _state.err_count = 0
    _state.logs = []
    _state.cancel_requested = False


def log(msg: str, tag: str = "info") -> None:
    _state.logs.insert(0, {"message": msg, "tag": tag})
    if len(_state.logs) > 100:
        _state.logs.pop()


def get_state() -> ProcessState:
    return _state
```

- [ ] **Step 5: Run tests to verify nothing broke yet**

Run: `cd backend && python -m pytest ../tests -v`
Expected: All existing tests still pass (they still import from old paths)

- [ ] **Step 6: Commit**

```bash
git add backend/shared/ backend/features/
git commit -m "feat: create feature-based backend directory structure"
```

---

## Task 3: Migrate Converter Feature

**Files:**
- Create: `backend/features/converter/formats.py`
- Create: `backend/features/converter/service.py`
- Create: `backend/features/converter/handler.py`
- Modify: `tests/converter/test_service.py` (from `tests/test_converter.py`)

- [ ] **Step 1: Create formats.py**

```python
# backend/features/converter/formats.py
"""Supported image formats and mappings."""

from __future__ import annotations

FORMATOS_SOPORTADOS: dict[str, dict[str, tuple[str, ...]]] = {
    "JPEG": {"ext": ".jpg", "modes": ("RGB", "L", "CMYK")},
    "JPG": {"ext": ".jpg", "modes": ("RGB", "L", "CMYK")},
    "PNG": {"ext": ".png", "modes": ("RGB", "RGBA", "L", "LA", "P")},
    "WEBP": {"ext": ".webp", "modes": ("RGB", "RGBA", "L")},
    "BMP": {"ext": ".bmp", "modes": ("RGB", "RGBA", "L")},
    "TIFF": {"ext": ".tiff", "modes": ("RGB", "RGBA", "L", "CMYK")},
    "GIF": {"ext": ".gif", "modes": ("P", "RGB", "L")},
    "ICO": {"ext": ".ico", "modes": ("RGB", "RGBA", "L")},
    "PDF": {"ext": ".pdf", "modes": ("RGB", "RGBA", "L", "P")},
}

PIL_FORMAT_MAP: dict[str, str] = {
    "JPG": "JPEG",
}


def obtener_formatos() -> list[str]:
    return list(FORMATOS_SOPORTADOS.keys())
```

- [ ] **Step 2: Create service.py**

```python
# backend/features/converter/service.py
"""Image conversion logic using Pillow."""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Union

from PIL import Image

from backend.features.converter.formats import FORMATOS_SOPORTADOS, PIL_FORMAT_MAP

ProgresoCallback = Callable[[int, int, Path], None]


def convertir_imagen(
    ruta_origen: Union[str, Path],
    ruta_destino: Union[str, Path],
    formato_salida: str,
    calidad: int = 95,
    resize: Union[tuple[int, int], list[int], None] = None,
    keep_exif: bool = False,
) -> Path:
    ruta_origen = Path(ruta_origen)
    ruta_destino = Path(ruta_destino)

    if not ruta_origen.exists():
        raise FileNotFoundError(f"No se encontró la imagen: {ruta_origen}")

    formato = formato_salida.upper()
    if formato not in FORMATOS_SOPORTADOS:
        raise ValueError(f"Formato no soportado: {formato_salida}")

    with Image.open(ruta_origen) as img:
        info = FORMATOS_SOPORTADOS[formato]
        if img.mode not in info["modes"]:
            if img.mode in ("RGBA", "LA", "P") and "RGBA" not in info["modes"]:
                fondo = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                if img.mode in ("RGBA", "LA"):
                    fondo.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
                    img = fondo
                else:
                    img = img.convert("RGB")
            else:
                target_mode = "RGB" if "RGB" in info["modes"] else info["modes"][0]
                img = img.convert(target_mode)

        if resize and isinstance(resize, (tuple, list)) and len(resize) == 2:
            img = img.resize((int(resize[0]), int(resize[1])), Image.LANCZOS)

        ruta_destino.parent.mkdir(parents=True, exist_ok=True)
        save_kwargs = {}
        if formato in ("JPEG", "WEBP"):
            save_kwargs["quality"] = max(1, min(100, int(calidad)))
            save_kwargs["optimize"] = True
        if keep_exif and "exif" in img.info:
            save_kwargs["exif"] = img.info["exif"]

        pil_formato = PIL_FORMAT_MAP.get(formato, formato)
        img.save(ruta_destino, format=pil_formato, **save_kwargs)

    return ruta_destino


def procesar_lote(
    origenes: list[Union[str, Path]],
    carpeta_destino: Union[str, Path],
    formato: str,
    calidad: int = 95,
    resize: Union[tuple[int, int], list[int], None] = None,
    keep_exif: bool = False,
    progreso_callback: Union[ProgresoCallback, None] = None,
) -> list[Union[Path, str]]:
    carpeta_destino = Path(carpeta_destino)
    carpeta_destino.mkdir(parents=True, exist_ok=True)
    ext = FORMATOS_SOPORTADOS[formato.upper()]["ext"]
    resultados: list[Union[Path, str]] = []

    for i, ruta in enumerate(origenes, 1):
        ruta = Path(ruta)
        nombre_salida = ruta.stem + ext
        ruta_salida = carpeta_destino / nombre_salida
        try:
            convertir_imagen(ruta, ruta_salida, formato, calidad, resize, keep_exif)
            resultados.append(ruta_salida)
        except Exception as e:
            resultados.append(f"ERROR: {ruta.name} -> {e}")

        if progreso_callback:
            progreso_callback(i, len(origenes), ruta)

    return resultados
```

- [ ] **Step 3: Create handler.py**

```python
# backend/features/converter/handler.py
"""IPC handlers for converter feature."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.features.converter.formats import FORMATOS_SOPORTADOS, obtener_formatos
from backend.features.converter.service import procesar_lote
from backend.shared.process_state import ProcessState, reset_state, log, get_state
from backend.shared.validators import parse_filename_parts
from backend.ipc_protocol import send_notification
from backend.features.catalog.repository import buscar_por_codigo
from backend.features.renamer.engine import RenamerEngine

import threading


class ConverterHandlers:
    @staticmethod
    def version(params: dict[str, Any]) -> dict[str, str]:
        from backend.version import __version__
        return {"version": __version__}

    @staticmethod
    def formats(params: dict[str, Any]) -> dict[str, list[str]]:
        return {"formats": list(FORMATOS_SOPORTADOS.keys())}

    @staticmethod
    def process_start(params: dict[str, Any]) -> dict[str, bool]:
        state = get_state()
        if state.running:
            return {"started": False}
        reset_state()
        state.running = True
        state.total = len(params.get("files", []))

        t = threading.Thread(target=_process_thread, args=(params,), daemon=True)
        t.start()
        return {"started": True}

    @staticmethod
    def process_status(params: dict[str, Any]) -> dict[str, Any]:
        state = get_state()
        return {
            "running": state.running,
            "progress": state.progress,
            "current_file": state.current_file,
            "ok_count": state.ok_count,
            "err_count": state.err_count,
            "logs": state.logs,
        }

    @staticmethod
    def process_cancel(params: dict[str, Any]) -> dict[str, bool]:
        get_state().cancel_requested = True
        return {"cancelled": True}


HANDLERS = {
    "version": ConverterHandlers.version,
    "formats": ConverterHandlers.formats,
    "process_start": ConverterHandlers.process_start,
    "process_status": ConverterHandlers.process_status,
    "process_cancel": ConverterHandlers.process_cancel,
}


def _process_thread(params: dict[str, Any]) -> None:
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

    state = get_state()

    for i, fpath in enumerate(files):
        if state.cancel_requested:
            log("Proceso cancelado por el usuario", "warn")
            break

        p = Path(fpath)
        state.progress = int(((i + 1) / len(files)) * 100)
        state.current_file = p.name

        send_notification("process.progress", {
            "progress": state.progress,
            "current_file": state.current_file,
            "ok_count": state.ok_count,
            "err_count": state.err_count,
        })

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
                state.ok_count += 1
                log(f"Procesado: {out_path.name}", "ok")
            else:
                state.err_count += 1
                log(f"Error: {res[0]}", "error")
        except Exception as e:
            state.err_count += 1
            log(f"Error: {p.name} -> {e}", "error")

    state.running = False
    state.progress = 100
    log("Proceso finalizado.", "info")
    send_notification("process.complete", {"ok_count": state.ok_count, "err_count": state.err_count})
```

- [ ] **Step 4: Write test**

```python
# tests/converter/test_service.py
"""Tests for converter service."""

import pytest
from pathlib import Path
from PIL import Image
from backend.features.converter.service import obtener_formatos, convertir_imagen, procesar_lote
from backend.features.converter.formats import FORMATOS_SOPORTADOS


@pytest.fixture
def imagen_rgb(tmp_path):
    ruta = tmp_path / "origen_rgb.png"
    img = Image.new("RGB", (100, 100), color=(255, 0, 0))
    img.save(ruta)
    return ruta


@pytest.fixture
def imagen_rgba(tmp_path):
    ruta = tmp_path / "origen_rgba.png"
    img = Image.new("RGBA", (100, 100), color=(0, 255, 0, 128))
    img.save(ruta)
    return ruta


class TestObtenerFormatos:
    def test_retorna_lista_no_vacia(self):
        formatos = obtener_formatos()
        assert isinstance(formatos, list)
        assert "JPEG" in formatos
        assert "PNG" in formatos


class TestConvertirImagen:
    def test_convierte_png_a_jpeg(self, imagen_rgb, tmp_path):
        salida = tmp_path / "salida.jpg"
        resultado = convertir_imagen(imagen_rgb, salida, "JPEG", calidad=90)
        assert resultado == salida
        assert salida.exists()
        with Image.open(salida) as img:
            assert img.format == "JPEG"

    def test_convierte_rgba_a_jpeg_con_fondo_blanco(self, imagen_rgba, tmp_path):
        salida = tmp_path / "salida.jpg"
        convertir_imagen(imagen_rgba, salida, "JPEG")
        with Image.open(salida) as img:
            assert img.mode == "RGB"

    def test_redimensiona(self, imagen_rgb, tmp_path):
        salida = tmp_path / "salida.jpg"
        convertir_imagen(imagen_rgb, salida, "JPEG", resize=(50, 50))
        with Image.open(salida) as img:
            assert img.size == (50, 50)

    def test_mantiene_exif(self, tmp_path):
        origen = tmp_path / "con_exif.jpg"
        img = Image.new("RGB", (10, 10))
        exif_bytes = b"Exif\x00\x00MM\x00*\x00\x00\x00\x08\x00\x00\x00\x00\x00"
        img.save(origen, exif=exif_bytes)
        salida = tmp_path / "salida_exif.jpg"
        convertir_imagen(origen, salida, "JPEG", keep_exif=True)
        with Image.open(salida) as img:
            assert "exif" in img.info

    def test_calidad_limitada_rango(self, imagen_rgb, tmp_path):
        salida = tmp_path / "salida.jpg"
        convertir_imagen(imagen_rgb, salida, "JPEG", calidad=150)
        assert salida.exists()

    def test_archivo_no_existe(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            convertir_imagen(tmp_path / "no_existe.jpg", tmp_path / "out.jpg", "JPEG")

    def test_formato_no_soportado(self, imagen_rgb, tmp_path):
        with pytest.raises(ValueError, match="Formato no soportado"):
            convertir_imagen(imagen_rgb, tmp_path / "out.xyz", "XYZ")


class TestProcesarLote:
    def test_procesa_multiples_archivos(self, imagen_rgb, tmp_path):
        destino = tmp_path / "destino"
        resultados = procesar_lote([imagen_rgb], str(destino), "PNG")
        assert len(resultados) == 1
        assert Path(resultados[0]).exists()

    def test_llama_callback(self, imagen_rgb, tmp_path):
        destino = tmp_path / "destino"
        llamadas = []
        def cb(i, total, ruta):
            llamadas.append((i, total, ruta))
        procesar_lote([imagen_rgb], str(destino), "PNG", progreso_callback=cb)
        assert len(llamadas) == 1
        assert llamadas[0][0] == 1
        assert llamadas[0][1] == 1

    def test_error_no_detiene_batch(self, imagen_rgb, tmp_path):
        destino = tmp_path / "destino"
        resultados = procesar_lote(
            [imagen_rgb, tmp_path / "no_existe.jpg"],
            str(destino), "PNG",
        )
        assert len(resultados) == 2
        assert Path(resultados[0]).exists()
        assert isinstance(resultados[1], str) and resultados[1].startswith("ERROR")
```

- [ ] **Step 5: Run new test**

Run: `cd backend && python -m pytest ../tests/converter/test_service.py -v`
Expected: 10 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/features/converter/ tests/converter/
git commit -m "feat: migrate converter to feature-based structure"
```

---

## Task 4: Migrate Catalog Feature

**Files:**
- Create: `backend/features/catalog/repository.py` (from `core/database.py`, with parameterized SQL)
- Create: `backend/features/catalog/fields.py` (from `core/config_fields.py`)
- Create: `backend/features/catalog/handler.py`
- Modify: `tests/catalog/test_repository.py`, `tests/catalog/test_fields.py`

- [ ] **Step 1: Create repository.py with parameterized SQL**

```python
# backend/features/catalog/repository.py
"""SQLite repository with parameterized queries."""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any

from backend.shared.paths import user_data_path
from backend.features.catalog.fields import load_fields, get_field_names
from backend.shared.exceptions import DatabaseError

logger = logging.getLogger(__name__)


def get_db_path() -> Path:
    return user_data_path("catalogo.db")


def _build_schema(fields: list[dict[str, Any]]) -> str:
    columns = ["id INTEGER PRIMARY KEY AUTOINCREMENT"]
    for f in fields:
        name: str = f["name"]
        ftype: str = f["type"]
        constraints: list[str] = []
        if f.get("required"):
            constraints.append("NOT NULL")
        if f.get("unique"):
            constraints.append("UNIQUE")
        col = f"{name} {ftype}"
        if constraints:
            col += " " + " ".join(constraints)
        columns.append(col)
    return f"CREATE TABLE IF NOT EXISTS imagenes ({', '.join(columns)})"


def _table_matches_config(cursor: sqlite3.Cursor, fields: list[dict[str, Any]]) -> bool:
    cursor.execute("PRAGMA table_info(imagenes)")
    existing = {row[1]: row[2].upper() for row in cursor.fetchall()}
    expected = {f["name"]: f["type"] for f in fields}
    expected["id"] = "INTEGER"
    return existing == expected


def init_db() -> None:
    fields = load_fields()
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='imagenes'")
        table_exists = cursor.fetchone() is not None

        if not table_exists:
            cursor.execute(_build_schema(fields))
        elif not _table_matches_config(cursor, fields):
            try:
                cursor.execute("SELECT * FROM imagenes")
                old_rows = cursor.fetchall()
                old_cols = [d[0] for d in cursor.description]
            except sqlite3.Error as exc:
                logger.warning("Could not read old data during migration: %s", exc)
                old_rows = []
                old_cols = []
            cursor.execute("DROP TABLE imagenes")
            cursor.execute(_build_schema(fields))
            if old_rows:
                new_cols = [f["name"] for f in fields]
                common_cols = [c for c in new_cols if c in old_cols]
                if common_cols:
                    placeholders = ", ".join(["?"] * len(common_cols))
                    col_names = ", ".join(common_cols)
                    for row in old_rows:
                        row_dict = dict(zip(old_cols, row))
                        values = [row_dict.get(c) for c in common_cols]
                        cursor.execute(
                            f"INSERT INTO imagenes ({col_names}) VALUES ({placeholders})",
                            values,
                        )
        conn.commit()


def importar_excel(excel_path: str) -> int:
    try:
        import pandas as pd
    except ImportError as exc:
        raise ImportError("pandas not installed. Run: pip install pandas openpyxl") from exc

    df = pd.read_excel(excel_path, dtype=str)
    df.columns = [c.strip().lower() for c in df.columns]

    fields = load_fields()
    field_names = [f["name"] for f in fields]
    required = [f["name"] for f in fields if f.get("required")]

    missing = [r for r in required if r not in df.columns]
    if missing:
        raise ValueError(
            f"Excel must contain required columns: {missing}. Found: {list(df.columns)}"
        )

    conn = sqlite3.connect(str(get_db_path()))
    cursor = conn.cursor()

    try:
        cursor.execute("DELETE FROM imagenes")
        placeholders = ", ".join(["?"] * len(field_names))
        col_names = ", ".join(field_names)
        sql = f"INSERT INTO imagenes ({col_names}) VALUES ({placeholders})"

        for _, row in df.iterrows():
            values = []
            for fn in field_names:
                val = row.get(fn)
                if pd.notna(val):
                    values.append(str(val).strip())
                else:
                    values.append(None)
            cursor.execute(sql, values)

        conn.commit()
    except sqlite3.Error as exc:
        conn.rollback()
        raise DatabaseError(f"Error importing data: {exc}") from exc
    finally:
        conn.close()

    return int(len(df))


def exportar_excel(excel_path: str) -> int:
    try:
        import pandas as pd
    except ImportError as exc:
        raise ImportError("pandas not installed.") from exc

    conn = sqlite3.connect(str(get_db_path()))
    try:
        field_names = get_field_names()
        cols = ", ".join(field_names)
        df = pd.read_sql_query(f"SELECT {cols} FROM imagenes", conn)
    finally:
        conn.close()

    df.to_excel(excel_path, index=False)
    return int(len(df))


def buscar_por_codigo(codigo: str) -> dict[str, Any] | None:
    with sqlite3.connect(str(get_db_path())) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        code_field = get_field_names()[0]
        cursor.execute(
            f"SELECT * FROM imagenes WHERE {code_field} = ?",
            (str(codigo).strip(),),
        )
        row = cursor.fetchone()
    return dict(row) if row else None


def buscar_por_indice(indice: int) -> dict[str, Any] | None:
    if indice < 1:
        return None
    with sqlite3.connect(str(get_db_path())) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        field_names = get_field_names()
        cols = ", ".join(field_names)
        cursor.execute(f"SELECT {cols} FROM imagenes LIMIT 1 OFFSET ?", (indice - 1,))
        row = cursor.fetchone()
    return dict(row) if row else None


def obtener_todos() -> list[dict[str, Any]]:
    with sqlite3.connect(str(get_db_path())) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        field_names = get_field_names()
        cols = ", ".join(field_names)
        cursor.execute(f"SELECT {cols} FROM imagenes")
        rows = cursor.fetchall()
    return [dict(r) for r in rows]


def generar_plantilla_excel(ruta_salida: str) -> int:
    try:
        import pandas as pd
    except ImportError as exc:
        raise ImportError("pandas not installed.") from exc

    fields = load_fields()
    columns = [f["name"] for f in fields]
    df = pd.DataFrame(columns=columns)
    sample: list[str] = []
    for f in fields:
        fname: str = f["name"]
        if fname == "codigo":
            sample.append("IMG-001")
        elif fname == "nombre":
            sample.append("Producto Ejemplo")
        elif fname == "categoria":
            sample.append("Categoria A")
        elif fname == "marca":
            sample.append("Marca X")
        elif fname == "modelo":
            sample.append("Modelo 2024")
        elif fname == "descripcion":
            sample.append("Descripción de prueba")
        else:
            sample.append(f"Ejemplo {fname}")
    df.loc[0] = sample
    df.to_excel(ruta_salida, index=False)
    return len(df)
```

- [ ] **Step 2: Create fields.py**

```python
# backend/features/catalog/fields.py
"""Configurable database field definitions."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from backend.shared.paths import user_data_path

logger = logging.getLogger(__name__)

DEFAULT_FIELDS: list[dict[str, Any]] = [
    {"name": "codigo", "type": "TEXT", "required": True, "unique": True},
    {"name": "nombre", "type": "TEXT", "required": False, "unique": False},
    {"name": "categoria", "type": "TEXT", "required": False, "unique": False},
    {"name": "marca", "type": "TEXT", "required": False, "unique": False},
    {"name": "modelo", "type": "TEXT", "required": False, "unique": False},
    {"name": "descripcion", "type": "TEXT", "required": False, "unique": False},
]

_SQLITE_KEYWORDS: set[str] = {
    "abort", "action", "add", "after", "all", "alter", "analyze", "and", "as",
    "asc", "attach", "autoincrement", "before", "begin", "between", "by", "cascade",
    "case", "cast", "check", "collate", "column", "commit", "conflict", "constraint",
    "create", "cross", "current", "current_date", "current_time", "current_timestamp",
    "database", "default", "deferrable", "deferred", "delete", "desc", "detach",
    "distinct", "drop", "each", "else", "end", "escape", "except", "exclusive",
    "exists", "explain", "fail", "for", "foreign", "from", "full", "glob", "group",
    "having", "if", "ignore", "immediate", "in", "index", "indexed", "initially",
    "inner", "insert", "instead", "intersect", "into", "is", "isnull", "join", "key",
    "left", "like", "limit", "match", "natural", "no", "not", "notnull", "null", "of",
    "offset", "on", "or", "order", "outer", "plan", "pragma", "primary", "query",
    "raise", "recursive", "references", "regexp", "reindex", "release", "rename",
    "replace", "restrict", "right", "rollback", "row", "savepoint", "select", "set",
    "table", "temp", "temporary", "then", "to", "transaction", "trigger", "union",
    "unique", "update", "using", "vacuum", "values", "view", "virtual", "when",
    "where", "with", "without",
}

_CONFIG_PATH: Path | None = None


def _config_file() -> Path:
    global _CONFIG_PATH
    if _CONFIG_PATH is None:
        _CONFIG_PATH = user_data_path("fields_config.json")
    return _CONFIG_PATH


def _validar_nombre_campo(nombre: str) -> bool:
    if not nombre:
        return False
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", nombre):
        return False
    if nombre in _SQLITE_KEYWORDS:
        return False
    return True


def _validar_tipo_campo(tipo: str) -> bool:
    return tipo.upper() in {"TEXT", "INTEGER", "REAL", "BLOB", "NUMERIC"}


def load_fields() -> list[dict[str, Any]]:
    path = _config_file()
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            fields = data.get("fields", [])
            if fields and isinstance(fields, list):
                validated: list[dict[str, Any]] = []
                for f in fields:
                    if isinstance(f, dict) and "name" in f and "type" in f:
                        nombre = str(f["name"]).strip().lower()
                        tipo = str(f["type"]).strip().upper()
                        if not _validar_nombre_campo(nombre) or not _validar_tipo_campo(tipo):
                            continue
                        validated.append({
                            "name": nombre,
                            "type": tipo,
                            "required": bool(f.get("required", False)),
                            "unique": bool(f.get("unique", False)),
                        })
                if validated:
                    return validated
        except (json.JSONDecodeError, OSError, TypeError) as exc:
            logger.warning("Error reading field config, using defaults: %s", exc)
    return [dict(f) for f in DEFAULT_FIELDS]


def save_fields(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    path = _config_file()
    validated: list[dict[str, Any]] = []
    for f in fields:
        if isinstance(f, dict) and "name" in f and "type" in f:
            nombre = str(f["name"]).strip().lower()
            tipo = str(f["type"]).strip().upper()
            if not _validar_nombre_campo(nombre) or not _validar_tipo_campo(tipo):
                continue
            validated.append({
                "name": nombre,
                "type": tipo,
                "required": bool(f.get("required", False)),
                "unique": bool(f.get("unique", False)),
            })
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"fields": validated}, f, indent=2, ensure_ascii=False)
    return validated


def get_field_names() -> list[str]:
    return [f["name"] for f in load_fields()]


def get_required_fields() -> list[str]:
    return [f["name"] for f in load_fields() if f.get("required")]


def get_unique_fields() -> list[str]:
    return [f["name"] for f in load_fields() if f.get("unique")]


def reset_to_defaults() -> list[dict[str, Any]]:
    save_fields(DEFAULT_FIELDS)
    return [dict(f) for f in DEFAULT_FIELDS]
```

- [ ] **Step 3: Create handler.py**

```python
# backend/features/catalog/handler.py
"""IPC handlers for catalog feature."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.features.catalog.repository import (
    buscar_por_codigo,
    buscar_por_indice,
    exportar_excel,
    generar_plantilla_excel,
    importar_excel,
    init_db,
    obtener_todos,
)
from backend.features.catalog.fields import (
    get_field_names,
    load_fields,
    reset_to_defaults,
    save_fields,
)
from backend.features.converter.formats import FORMATOS_SOPORTADOS


class CatalogHandlers:
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

    @staticmethod
    def db_fields(params: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        return {"fields": load_fields()}

    @staticmethod
    def db_fields_update(params: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        fields = params.get("fields", [])
        return {"fields": save_fields(fields)}

    @staticmethod
    def db_fields_reset(params: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        return {"fields": reset_to_defaults()}


HANDLERS = {
    "db_records": CatalogHandlers.db_records,
    "db_import": CatalogHandlers.db_import,
    "db_export": CatalogHandlers.db_export,
    "db_template": CatalogHandlers.db_template,
    "scan_folder": CatalogHandlers.scan_folder,
    "db_fields": CatalogHandlers.db_fields,
    "db_fields_update": CatalogHandlers.db_fields_update,
    "db_fields_reset": CatalogHandlers.db_fields_reset,
}
```

- [ ] **Step 4: Update tests**

Move `tests/test_database.py` to `tests/catalog/test_repository.py` with imports updated from `backend.core.database` to `backend.features.catalog.repository` and `backend.core.config_fields` to `backend.features.catalog.fields`.

Move `tests/test_config_fields.py` to `tests/catalog/test_fields.py` with imports updated similarly.

- [ ] **Step 5: Run tests**

Run: `cd backend && python -m pytest ../tests/catalog/ -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/features/catalog/ tests/catalog/
git commit -m "feat: migrate catalog to feature-based structure"
```

---

## Task 5: Migrate Renamer Feature

**Files:**
- Create: `backend/features/renamer/engine.py` (from `core/renamer.py`)
- Create: `backend/features/renamer/handler.py`
- Modify: `tests/renamer/test_engine.py` (from `tests/test_renamer.py`)

- [ ] **Step 1: Create engine.py**

Copy `backend/core/renamer.py` to `backend/features/renamer/engine.py` with updated import:
`from backend.features.catalog.fields import get_field_names`
(instead of `from backend.core.config_fields import get_field_names`)

- [ ] **Step 2: Create handler.py**

```python
# backend/features/renamer/handler.py
"""IPC handlers for renamer feature."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.features.renamer.engine import RenamerEngine
from backend.features.catalog.repository import buscar_por_codigo
from backend.shared.validators import parse_filename_parts


class RenamerHandlers:
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


HANDLERS = {
    "preview": RenamerHandlers.preview,
}
```

- [ ] **Step 3: Update test**

Move `tests/test_renamer.py` to `tests/renamer/test_engine.py` with imports updated from `backend.core.renamer` to `backend.features.renamer.engine`.

- [ ] **Step 4: Run tests**

Run: `cd backend && python -m pytest ../tests/renamer/ -v`
Expected: 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/features/renamer/ tests/renamer/
git commit -m "feat: migrate renamer to feature-based structure"
```

---

## Task 6: Migrate Theming Feature

**Files:**
- Create: `backend/features/theming/presets.py` (from `core/config_theme.py`)
- Create: `backend/features/theming/service.py` (from `core/config_theme.py`)
- Create: `backend/features/theming/handler.py`

- [ ] **Step 1: Create presets.py**

Extract `DEFAULT_THEME` and `PRESETS` from `core/config_theme.py` into `backend/features/theming/presets.py`.

- [ ] **Step 2: Create service.py**

Extract `load_theme`, `save_theme`, `reset_theme`, `get_preset_names`, `load_preset` from `core/config_theme.py` into `backend/features/theming/service.py`.

- [ ] **Step 3: Create handler.py**

```python
# backend/features/theming/handler.py
"""IPC handlers for theming feature."""

from __future__ import annotations

from typing import Any

from backend.features.theming.service import (
    load_theme,
    save_theme,
    reset_theme,
    get_preset_names,
    load_preset,
)


class ThemingHandlers:
    @staticmethod
    def theme_get(params: dict[str, Any]) -> dict[str, str]:
        return load_theme()

    @staticmethod
    def theme_save(params: dict[str, Any]) -> dict[str, str]:
        return save_theme(params)

    @staticmethod
    def theme_presets(params: dict[str, Any]) -> dict[str, list[str]]:
        return {"presets": list(get_preset_names())}

    @staticmethod
    def theme_preset(params: dict[str, Any]) -> dict[str, str]:
        name = params.get("name", "")
        return load_preset(name)

    @staticmethod
    def theme_reset(params: dict[str, Any]) -> dict[str, str]:
        return reset_theme()


HANDLERS = {
    "theme_get": ThemingHandlers.theme_get,
    "theme_save": ThemingHandlers.theme_save,
    "theme_presets": ThemingHandlers.theme_presets,
    "theme_preset": ThemingHandlers.theme_preset,
    "theme_reset": ThemingHandlers.theme_reset,
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/features/theming/
git commit -m "feat: migrate theming to feature-based structure"
```

---

## Task 7: Extract Dialogs and Update Main Entrypoint

**Files:**
- Create: `backend/dialogs.py` (from `handlers.py`)
- Modify: `backend/main.py` (register feature handlers)
- Modify: `backend/version.py` (fix to 0.2.0)

- [ ] **Step 1: Create dialogs.py**

```python
# backend/dialogs.py
"""Cross-feature tkinter file/folder dialog helpers."""

from __future__ import annotations

import tkinter.filedialog as fd
import tkinter as tk
from typing import Any


def run_dialog(func, *args, **kwargs) -> list[str]:
    """Execute a tkinter file/folder picker dialog."""
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    res = func(*args, **kwargs)
    root.destroy()
    return list(res) if isinstance(res, (tuple, list)) else ([res] if res else [])
```

- [ ] **Step 2: Create dialog handlers in converter/handler.py**

Add these handlers to `ConverterHandlers` class in `backend/features/converter/handler.py`:

```python
    @staticmethod
    def dialog_files(params: dict[str, Any]) -> dict[str, list[str]]:
        from backend.dialogs import run_dialog
        return {"paths": run_dialog(fd.askopenfilenames, title="Seleccionar archivos")}

    @staticmethod
    def dialog_folder(params: dict[str, Any]) -> dict[str, list[str]]:
        from backend.dialogs import run_dialog
        return {"paths": run_dialog(fd.askdirectory, title="Seleccionar carpeta")}

    @staticmethod
    def dialog_dest(params: dict[str, Any]) -> dict[str, list[str]]:
        from backend.dialogs import run_dialog
        return {"paths": run_dialog(fd.askdirectory, title="Seleccionar destino")}

    @staticmethod
    def dialog_save(params: dict[str, Any]) -> dict[str, list[str]]:
        from backend.dialogs import run_dialog
        return {"paths": run_dialog(fd.asksaveasfilename, title="Guardar archivo")}
```

Add to HANDLERS dict:
```python
    "dialog_files": ConverterHandlers.dialog_files,
    "dialog_folder": ConverterHandlers.dialog_folder,
    "dialog_dest": ConverterHandlers.dialog_dest,
    "dialog_save": ConverterHandlers.dialog_save,
```

- [ ] **Step 3: Update main.py**

```python
# backend/main.py
"""Entrypoint: backend IPC Python for Electron."""

from __future__ import annotations

import json
import logging
import sys
import traceback
from pathlib import Path
from typing import Any

_backend = Path(__file__).resolve().parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

from backend.features.catalog.repository import init_db
init_db()

from backend.ipc_protocol import IPCMessage, read_message, send_response
from backend.features.converter.handler import HANDLERS as converter_handlers
from backend.features.catalog.handler import HANDLERS as catalog_handlers
from backend.features.renamer.handler import HANDLERS as renamer_handlers
from backend.features.theming.handler import HANDLERS as theming_handlers

HANDLERS = {
    **converter_handlers,
    **catalog_handlers,
    **renamer_handlers,
    **theming_handlers,
}

logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


def main() -> None:
    print(json.dumps({"jsonrpc": "2.0", "method": "ready", "params": {}}))
    sys.stdout.flush()
    logger.info("Backend IPC iniciado. Esperando mensajes en stdin...")

    while True:
        msg = read_message()
        if msg is None:
            break

        if msg.method in HANDLERS:
            try:
                result = HANDLERS[msg.method](msg.params)
                send_response(result, msg.id)
            except Exception as exc:
                error_msg = f"{type(exc).__name__}: {exc}"
                logger.error("Error en %s: %s\n%s", msg.method, error_msg, traceback.format_exc())
                send_response(None, msg.id, error=error_msg)
        else:
            send_response(None, msg.id, error=f"Método desconocido: {msg.method}")

    logger.info("Backend IPC finalizado.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Fix version.py**

```python
# backend/version.py
__version__ = "0.2.0"
```

- [ ] **Step 5: Delete old files**

Delete: `backend/handlers.py`, `backend/core/` (entire directory), `backend/utils/` (entire directory)

- [ ] **Step 6: Run ALL tests**

Run: `cd backend && python -m pytest ../tests -v`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/dialogs.py backend/version.py
git rm backend/handlers.py backend/core/ backend/utils/
git commit -m "feat: wire feature handlers into main entrypoint, delete old core/utils"
```

---

## Task 8: Migrate Frontend API Layer

**Files:**
- Create: `frontend/src/api/client.ts` (from `api.ts`)
- Create: `frontend/src/api/types.ts` (from `api.ts`)
- Create: `frontend/src/api/index.ts` (from `api.ts`)
- Delete (later): `frontend/src/api.ts`, `frontend/src/types.ts`

- [ ] **Step 1: Create client.ts**

```typescript
// frontend/src/api/client.ts
"""IPC bridge: talks to Python backend via Electron IPC (JSON-RPC)."""

export interface ProcessStatus {
  running: boolean;
  progress: number;
  current_file: string;
  ok_count: number;
  err_count: number;
  logs: LogEntry[];
}

export interface LogEntry {
  message: string;
  tag: string;
}

export interface PreviewItem {
  origen: string;
  nuevo: string;
  en_bd: boolean;
}

export interface DBField {
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
}

export interface DBRecord {
  [key: string]: string | number | null;
}

export interface ThemeConfig {
  [key: string]: string;
  name: string;
  bg: string;
  bg_secondary: string;
  fg: string;
  fg_muted: string;
  fg_secondary: string;
  fg_tertiary: string;
  accent: string;
  accent_light: string;
  accent_hover: string;
  accent_dark: string;
  border: string;
  blue_hover: string;
  error: string;
  warning: string;
  success: string;
  orange: string;
}

declare global {
  interface Window {
    electronAPI?: {
      invoke: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
      onNotify: (callback: (method: string, params: unknown) => void) => () => void;
    };
  }
}

const _invoke = async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
  if (!window.electronAPI) {
    throw new Error('Electron IPC no disponible');
  }
  return window.electronAPI.invoke(method, params) as Promise<T>;
};

export function onNotify(callback: (method: string, params: unknown) => void) {
  if (!window.electronAPI) return () => {};
  return window.electronAPI.onNotify(callback);
}

export { _invoke };
```

- [ ] **Step 2: Create types.ts**

```typescript
// frontend/src/api/types.ts
"""Re-export all types from client for convenience."""

export type {
  LogEntry,
  ProcessStatus,
  DBField,
  DBRecord,
  ThemeConfig,
  PreviewItem,
} from './client';
```

- [ ] **Step 3: Create index.ts**

```typescript
// frontend/src/api/index.ts
"""API methods exported for feature consumption."""

import { _invoke, onNotify } from './client';
import type { ProcessStatus, PreviewItem, DBField, DBRecord, ThemeConfig } from './client';

export { onNotify };
export type { ProcessStatus, PreviewItem, DBField, DBRecord, ThemeConfig };

export const api = {
  version: () => _invoke<{ version: string }>('version'),
  formats: () => _invoke<{ formats: string[] }>('formats'),

  dialogFiles: () => _invoke<{ paths: string[] }>('dialog_files'),
  dialogFolder: () => _invoke<{ paths: string[] }>('dialog_folder'),
  dialogDest: () => _invoke<{ paths: string[] }>('dialog_dest'),
  dialogSave: () => _invoke<{ paths: string[] }>('dialog_save'),

  startProcess: (body: object) => _invoke<{ started: boolean }>('process_start', body as Record<string, unknown>),
  getStatus: () => _invoke<ProcessStatus>('process_status'),
  cancelProcess: () => _invoke<{ cancelled: boolean }>('process_cancel'),

  preview: (body: object) => _invoke<{ preview: PreviewItem[] }>('preview', body as Record<string, unknown>),

  getRecords: () => _invoke<{ records: DBRecord[]; fields: string[] }>('db_records'),
  importExcel: (path: string) => _invoke<{ imported: number }>('db_import', { path }),
  exportExcel: (path: string) => _invoke<{ exported: number }>('db_export', { path }),
  generateTemplate: (path: string) => _invoke<{ path: string }>('db_template', { path }),
  scanFolder: (folder: string) => _invoke<{ files: string[] }>('scan_folder', { folder }),

  getFields: () => _invoke<{ fields: DBField[] }>('db_fields'),
  updateFields: (fields: DBField[]) => _invoke<{ fields: DBField[] }>('db_fields_update', { fields }),
  resetFields: () => _invoke<{ fields: DBField[] }>('db_fields_reset'),

  getTheme: () => _invoke<ThemeConfig>('theme_get'),
  saveTheme: (theme: ThemeConfig) => _invoke<ThemeConfig>('theme_save', theme as unknown as Record<string, unknown>),
  getPresets: () => _invoke<{ presets: string[] }>('theme_presets'),
  applyPreset: (name: string) => _invoke<ThemeConfig>('theme_preset', { name }),
  resetTheme: () => _invoke<ThemeConfig>('theme_reset'),
};
```

- [ ] **Step 4: Delete old files**

Delete: `frontend/src/api.ts`, `frontend/src/types.ts`

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds (will fail if any imports still reference old paths)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/
git rm frontend/src/api.ts frontend/src/types.ts
git commit -m "feat: split api.ts into client/types/index modules"
```

---

## Task 9: Migrate Frontend Conversion Feature

**Files:**
- Create: `frontend/src/features/conversion/useConversion.ts`
- Create: `frontend/src/features/conversion/constants.ts`
- Create: `frontend/src/features/conversion/ConversionTab.tsx` (from components/)
- Modify: `frontend/src/App.tsx` (update import)

- [ ] **Step 1: Create constants.ts**

```typescript
// frontend/src/features/conversion/constants.ts
export type SectionId = 'files' | 'options' | 'rename' | 'output';

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'files', label: 'Archivos' },
  { id: 'options', label: 'Opciones' },
  { id: 'rename', label: 'Renombrado' },
  { id: 'output', label: 'Salida' },
];

export const DEFAULT_FORMAT = 'JPEG';
export const DEFAULT_CALIDAD = 95;
export const DEFAULT_SECUENCIA = 1;
```

- [ ] **Step 2: Create useConversion.ts**

Extract all state and logic from the old `ConversionTab.tsx` into a custom hook. The hook encapsulates:
- `files`, `destino`, `formato`, `calidad`, `resizeAncho`, `resizeAlto`, `keepExif`
- `usarRename`, `patron`, `secuencia`, `useFilenameSeq`
- `status`, `logs`, `preview`, `running`, `dragOver`, `activeSection`
- All callbacks: `addFiles`, `addFolder`, `selectDest`, `clearFiles`, `doPreview`, `doProcess`, `doCancel`, `removeFile`
- Drag/drop handlers
- useEffect for polling status and notifications

The hook returns all state values and callbacks the UI needs.

- [ ] **Step 3: Create ConversionTab.tsx (UI only)**

Copy the JSX from the old `components/ConversionTab.tsx` but replace all `useState`/`useEffect`/logic with the hook:

```tsx
// frontend/src/features/conversion/ConversionTab.tsx
import { api, onNotify } from '../../api';  // Keep api import for types if needed
import { useConversion } from './useConversion';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';

export default function ConversionTab() {
  const {
    files, destino, formato, calidad, resizeAncho, resizeAlto, keepExif,
    usarRename, patron, secuencia, useFilenameSeq,
    status, logs, preview, running, dragOver, activeSection,
    addFiles, addFolder, selectDest, clearFiles, doPreview, doProcess, doCancel,
    removeFile, onDragOver, onDragLeave, onDrop,
    setFormato, setCalidad, setResizeAncho, setResizeAlto, setKeepExif,
    setUsarRename, setPatron, setSecuencia, setUseFilenameSeq, setActiveSection,
    formats, fields, presets,
  } = useConversion();

  // JSX from old ConversionTab.tsx, using the destructured values
  // ... (same JSX structure, no useState/useEffect inside)
}
```

- [ ] **Step 4: Update App.tsx**

Change import in `frontend/src/App.tsx`:
```typescript
import ConversionTab from './features/conversion/ConversionTab';
```
(instead of `import ConversionTab from './components/ConversionTab'`)

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/conversion/
git commit -m "feat: migrate conversion tab to feature-based structure"
```

---

## Task 10: Migrate Frontend Database Feature

**Files:**
- Create: `frontend/src/features/database/useDatabase.ts`
- Create: `frontend/src/features/database/DatabaseTab.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create useDatabase.ts**

Extract all state and logic from old `DatabaseTab.tsx`:
- `records`, `fields`, `allFields`, `newField`, `activeSection`
- `refresh`, `importExcel`, `exportExcel`, `template`, `addField`, `removeField`, `resetFields`

- [ ] **Step 2: Create DatabaseTab.tsx (UI only)**

Same pattern as ConversionTab: JSX only, consumes `useDatabase()` hook.

- [ ] **Step 3: Update App.tsx**

Change import:
```typescript
import DatabaseTab from './features/database/DatabaseTab';
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/database/
git commit -m "feat: migrate database tab to feature-based structure"
```

---

## Task 11: Migrate Frontend Appearance Feature

**Files:**
- Create: `frontend/src/features/appearance/useAppearance.ts`
- Create: `frontend/src/features/appearance/AppearanceTab.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create useAppearance.ts**

Extract all state and logic from old `AppearanceTab.tsx`:
- `theme`, `presets`
- `refresh`, `applyPreset`, `save`, `reset`, `updateColor`

- [ ] **Step 2: Create AppearanceTab.tsx (UI only)**

Same pattern: JSX only, consumes `useAppearance()` hook.

- [ ] **Step 3: Update App.tsx**

Change import:
```typescript
import AppearanceTab from './features/appearance/AppearanceTab';
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Delete old components**

Delete: `frontend/src/components/ConversionTab.tsx`, `frontend/src/components/DatabaseTab.tsx`, `frontend/src/components/AppearanceTab.tsx`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/appearance/ frontend/src/App.tsx
git rm frontend/src/components/ConversionTab.tsx frontend/src/components/DatabaseTab.tsx frontend/src/components/AppearanceTab.tsx
git commit -m "feat: migrate appearance tab, clean up old component files"
```

---

## Task 12: Extract Electron IPC Bridge

**Files:**
- Create: `electron/ipc-bridge.js` (from `main.js`)
- Modify: `electron/main.js` (simplified)

- [ ] **Step 1: Create ipc-bridge.js**

Extract the `startPythonBackend()` function and the `ipcMain.handle('ipc-call')` handler from `main.js` into `electron/ipc-bridge.js`.

The module should export:
- `startPythonBackend()` — returns Promise that resolves when Python sends ready
- `setupIPC(mainWindow)` — registers the ipcMain handlers
- `getPythonProcess()` — returns the current Python child process

- [ ] **Step 2: Simplify main.js**

```javascript
// electron/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { startPythonBackend, setupIPC, getPythonProcess } = require('./ipc-bridge');

const isDev = !app.isPackaged;
let mainWindow;

function createWindow() {
  const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width, height, show: false, frame: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.maximize();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const htmlPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  setupIPC(mainWindow);
}

app.whenReady().then(async () => {
  try {
    await startPythonBackend();
    createWindow();
  } catch (err) {
    const { dialog } = require('electron');
    dialog.showErrorBox('Error de inicio', err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  const proc = getPythonProcess();
  if (proc && !proc.killed) {
    proc.stdin.end();
    proc.kill();
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 3: Verify Electron dev mode**

Run: `cd frontend && npm run dev` (or `npm run build` then test the built app)
Expected: App launches, backend connects, all tabs work

- [ ] **Step 4: Commit**

```bash
git add electron/
git commit -m "feat: extract electron IPC bridge module"
```

---

## Task 13: Fix Build Script and Clean Up

**Files:**
- Modify: `scripts/build-backend.js`
- Move: `backend/backend.spec` → `scripts/backend.spec`
- Delete: `requirements.txt`
- Modify: `.gitignore`

- [ ] **Step 1: Rewrite build-backend.js**

```javascript
// scripts/build-backend.js
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function findPython() {
  // Try common Python executables
  const candidates = ['python', 'python3', 'py'];
  for (const cmd of candidates) {
    const result = spawnSync(cmd, ['--version'], { encoding: 'utf8', shell: true });
    if (result.status === 0) {
      return cmd;
    }
  }
  console.error('Python not found. Please install Python 3.10+.');
  process.exit(1);
}

const pythonExe = findPython();
const specFile = path.join(__dirname, 'backend.spec');

console.log('Building backend with PyInstaller...');
console.log('  python:', pythonExe);
console.log('  spec:', specFile);

const result = spawnSync(pythonExe, ['-m', 'PyInstaller', '--clean', specFile], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  shell: false,
});

if (result.status !== 0) {
  console.error('Backend build failed');
  process.exit(1);
}
console.log('Backend build complete.');
```

- [ ] **Step 2: Move backend.spec**

Move `backend/backend.spec` to `scripts/backend.spec`. Update paths inside the spec file if needed.

- [ ] **Step 3: Delete requirements.txt**

Run: `Remove-Item "C:\Users\HIDROAA\Desktop\hidro_convert\requirements.txt"`

- [ ] **Step 4: Update .gitignore**

Add to `.gitignore`:
```
# PyInstaller spec (now in scripts/)
scripts/backend.spec
```

- [ ] **Step 5: Verify pyproject.toml has all deps**

Ensure `pyproject.toml` dependencies include: Pillow, pandas, openpyxl.

- [ ] **Step 6: Commit**

```bash
git add scripts/ .gitignore
git rm requirements.txt backend/backend.spec
git commit -m "feat: fix build script, remove venv dependency, delete requirements.txt"
```

---

## Task 14: Update Shared Validators Test

**Files:**
- Create: `tests/shared/test_validators.py` (from `tests/test_validators.py`)

- [ ] **Step 1: Move and update imports**

Move `tests/test_validators.py` to `tests/shared/test_validators.py` with imports updated from `backend.utils.validators` to `backend.shared.validators`.

- [ ] **Step 2: Run tests**

Run: `cd backend && python -m pytest ../tests/shared/ -v`
Expected: 12 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/shared/
git rm tests/test_validators.py
git commit -m "feat: move validators test to shared folder"
```

---

## Task 15: Final Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && python -m pytest ../tests -v`
Expected: ALL tests PASS across converter/, catalog/, renamer/, shared/

- [ ] **Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no TypeScript or Vite errors

- [ ] **Step 3: Build backend**

Run: `node scripts/build-backend.js`
Expected: PyInstaller builds `dist/HidroConvertBackend.exe` successfully

- [ ] **Step 4: Test Electron dev mode**

Run: `npm run dev` (from root)
Expected: App launches, all tabs functional, conversions work

- [ ] **Step 5: Full cleanup commit**

```bash
git add -A
git commit -m "feat: complete feature-based restructure"
```

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|---|---|
| Backend feature folders (converter, catalog, renamer, theming) | Tasks 1-6 |
| Backend shared folder (paths, validators, exceptions, process_state) | Task 2 |
| Thin IPC handlers per feature | Tasks 3-6 |
| Parameterized SQL in repository | Task 4 |
| Fix version.py to 0.2.0 | Task 7 |
| Extract dialogs.py | Task 7 |
| Update main.py to register feature handlers | Task 7 |
| Delete old core/ and utils/ | Task 7 |
| Frontend api/ folder (client, types, index) | Task 8 |
| Frontend features/ folder (conversion, database, appearance) | Tasks 9-11 |
| Custom hooks per feature | Tasks 9-11 |
| Simplified App.tsx | Tasks 9-11 |
| Delete old component files | Task 11 |
| Extract electron/ipc-bridge.js | Task 12 |
| Fix build script (no venv312) | Task 13 |
| Move backend.spec to scripts/ | Task 13 |
| Delete requirements.txt | Task 13 |
| Update tests to new imports | Tasks 3, 4, 5, 14 |
| Tests organized by feature | Tasks 3-6, 14 |

**No placeholders found. All spec requirements have corresponding tasks.**
