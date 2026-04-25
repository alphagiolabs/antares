# HidroConvert Feature Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform HidroConvert into a commercial-ready desktop app with real-time preview, plugin-based format extensibility, auto-updates, i18n, processing history, and full CI/CD.

**Architecture:** Phase 1 fixes the critical build/runtime blockers. Phases 2-3 upgrade the frontend UX with thumbnails, real-time preview, and a history tab. Phases 4-6 add the plugin system, auto-updater, and internationalization. Phase 7 closes with CI/CD, frontend unit tests, and IPC integration tests.

**Tech Stack:** Electron + React + Vite + Tailwind (frontend) | Python + Pillow + pandas + SQLite (backend) | PyInstaller | electron-updater | react-i18next | Vitest + Testing Library | GitHub Actions

---

## File Structure

### New Files
- `backend/backend.spec` — PyInstaller spec for bundling the Python IPC backend
- `backend/core/format_registry.py` — `FormatRegistry` class extracted from converter.py
- `backend/core/plugins.py` — Plugin loader (`load_plugins_from_dir`) and registration
- `backend/core/history.py` — `HistoryStore` (SQLite table + CRUD)
- `backend/locales/es.json`, `backend/locales/en.json` — Backend translation dictionaries
- `frontend/src/i18n.ts` — i18next setup with `react-i18next`
- `frontend/src/locales/es.json`, `frontend/src/locales/en.json` — Frontend translation dictionaries
- `frontend/src/components/HistoryTab.tsx` — 4th app tab (processing history + re-execute)
- `frontend/src/components/ImagePreview.tsx` — Side-by-side original vs converted preview
- `frontend/src/components/Thumbnail.tsx` — Circular 48x48 thumbnail with format badge
- `tests/test_ipc.py` — Node/Vitest IPC integration tests (spawn Python, verify JSON-RPC)
- `tests/test_plugins.py` — Plugin loading and registration tests
- `tests/test_history.py` — HistoryStore CRUD tests
- `frontend/src/components/__tests__/Button.test.tsx` — Frontend component tests
- `.github/workflows/release.yml` — GitHub Actions: test → build → release

### Modified Files
- `backend/handlers.py` — Add handlers: `preview_image`, `history_list`, `history_get`, `history_delete`, `plugin_formats`
- `backend/core/converter.py` — Replace `FORMATOS_SOPORTADOS` dict with `FormatRegistry` instance; add `convertir_a_preview()` for base64 thumbnails
- `backend/core/database.py` — Add `historial` table creation in `init_db`; migrate existing data if schema changes
- `backend/core/config_theme.py` — Add "Mastercard Cream" preset with DESIGN.md colors
- `backend/core/config_fields.py` — `generar_plantilla_excel` return type `-> int` (fix bug)
- `backend/main.py` — Call `load_plugins_from_dir()` before IPC loop
- `backend/utils/paths.py` — Ensure `data/plugins/` dir exists on app start
- `electron/main.js` — Backend retry loop (3 attempts, backoff), auto-updater integration, crash recovery
- `electron/preload.js` — Expose `electronAPI.checkForUpdates`, `electronAPI.onUpdateAvailable`
- `frontend/src/api.ts` — Add `previewImage()`, `historyList()`, `historyGet()`, `historyDelete()`, `pluginFormats()`
- `frontend/src/App.tsx` — Add "Historial" tab; wrap with `I18nextProvider`
- `frontend/src/components/ConversionTab.tsx` — Thumbnails, preview panel, scroll fix (`overflow-y-auto`), debounced preview calls
- `frontend/src/components/DatabaseTab.tsx` — Scroll fix (`overflow-y-auto`)
- `frontend/src/components/AppearanceTab.tsx` — Scroll fix, language switcher
- `frontend/src/index.css` — CSS custom properties `--mc-canvas`, `--mc-ink`, etc.; default to Mastercard Cream
- `frontend/tailwind.config.js` — Point color tokens to CSS custom properties (e.g., `canvas: 'var(--mc-canvas)'`)
- `package.json` — Add `electron-updater`, `concurrently` already present
- `frontend/package.json` — Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `react-i18next`, `i18next`

---

## Phase 1: Critical Fixes & Foundation

### Task 1: PyInstaller Spec

**Files:**
- Create: `backend/backend.spec`
- Modify: `scripts/build-backend.js` (verify path)

- [ ] **Step 1: Write the PyInstaller spec**

Create `backend/backend.spec`:
```python
# -*- mode: python ; coding: utf-8 -*-
import sys
from pathlib import Path

block_cipher = None

backend_dir = Path(SPECFILE).parent.resolve()
project_dir = backend_dir.parent

a = Analysis(
    [str(backend_dir / 'main.py')],
    pathex=[str(backend_dir), str(project_dir)],
    binaries=[],
    datas=[],
    hiddenimports=[
        'backend.core.converter',
        'backend.core.database',
        'backend.core.renamer',
        'backend.core.config_fields',
        'backend.core.config_theme',
        'backend.core.plugins',
        'backend.core.history',
        'backend.utils.validators',
        'backend.utils.paths',
        'backend.ipc_protocol',
        'backend.handlers',
        'PIL',
        'PIL._imagingtk',
        'PIL.Image',
        'pandas',
        'pandas._libs.tslibs',
        'openpyxl',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='HidroConvertBackend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
```

- [ ] **Step 2: Verify build script references correct spec path**

Confirm `scripts/build-backend.js` line:
```javascript
const specFile = path.join(__dirname, '..', 'backend', 'backend.spec');
```

- [ ] **Step 3: Commit**

```bash
git add backend/backend.spec
git commit -m "build: Add PyInstaller spec for backend bundling"
```

---

### Task 2: Fix Type Bug in generar_plantilla_excel

**Files:**
- Modify: `backend/core/database.py`

- [ ] **Step 1: Update return type and keep return value**

In `backend/core/database.py`, change:
```python
def generar_plantilla_excel(ruta_salida: str) -> None:
```
to:
```python
def generar_plantilla_excel(ruta_salida: str) -> int:
```

The function already ends with `return len(df)`. No other change needed.

- [ ] **Step 2: Update handler if it uses return**

In `backend/handlers.py`, `db_template` handler currently does:
```python
path = params.get("path", "")
generar_plantilla_excel(path)
return {"path": path}
```
No change needed (it ignores the return value).

- [ ] **Step 3: Commit**

```bash
git add backend/core/database.py
git commit -m "fix: correct return type of generar_plantilla_excel to int"
```

---

### Task 3: Frontend Scroll Fixes

**Files:**
- Modify: `frontend/src/components/ConversionTab.tsx`
- Modify: `frontend/src/components/DatabaseTab.tsx`
- Modify: `frontend/src/components/AppearanceTab.tsx`

- [ ] **Step 1: ConversionTab — fix file list and log panel**

In `ConversionTab.tsx`, find the file list container:
```tsx
<div className="flex-1 p-2">
```
Change to:
```tsx
<div className="flex-1 p-2 overflow-y-auto">
```

Find the log panel container:
```tsx
<div className="flex-1 p-3 font-mono text-xs space-y-0.5 overflow-hidden">
```
Change `overflow-hidden` to `overflow-y-auto`.

- [ ] **Step 2: DatabaseTab — fix records list**

In `DatabaseTab.tsx`, find:
```tsx
<div className="flex-1 p-2">
```
Change to:
```tsx
<div className="flex-1 p-2 overflow-y-auto">
```

- [ ] **Step 3: AppearanceTab — fix color grid**

In `AppearanceTab.tsx`, find:
```tsx
<div className="flex-1 overflow-hidden">
```
Change to:
```tsx
<div className="flex-1 overflow-y-auto">
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ConversionTab.tsx frontend/src/components/DatabaseTab.tsx frontend/src/components/AppearanceTab.tsx
git commit -m "fix: add overflow-y-auto to scrollable panels across all tabs"
```

---

### Task 4: Mastercard Cream Theme (Functional)

**Files:**
- Modify: `backend/core/config_theme.py`
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/AppearanceTab.tsx`
- Modify: `frontend/src/App.tsx` or `frontend/src/main.tsx`

- [ ] **Step 1: Add Mastercard Cream preset to backend**

In `backend/core/config_theme.py`, add to `PRESETS`:
```python
"Mastercard Cream": {
    "name": "Mastercard Cream",
    "bg": "#F3F0EE",
    "bg_secondary": "#FCFBFA",
    "fg": "#141413",
    "fg_muted": "#696969",
    "fg_secondary": "#555555",
    "fg_tertiary": "#565656",
    "accent": "#CF4500",
    "accent_light": "#F37338",
    "accent_hover": "#9A3A0A",
    "accent_dark": "#9A3A0A",
    "border": "#D1CDC7",
    "blue_hover": "#3860BE",
    "error": "#EB001B",
    "warning": "#F79E1B",
    "success": "#76b900",
    "orange": "#F37338",
},
```

Also change `DEFAULT_THEME` to use the Mastercard Cream colors (matching keys above).

- [ ] **Step 2: Connect Tailwind colors to CSS variables**

In `frontend/tailwind.config.js`, update colors to use CSS vars:
```js
colors: {
  mc: {
    canvas: 'var(--mc-canvas)',
    lifted: 'var(--mc-lifted)',
    white: 'var(--mc-white)',
    bone: 'var(--mc-bone)',
    ink: 'var(--mc-ink)',
    charcoal: 'var(--mc-charcoal)',
    slate: 'var(--mc-slate)',
    granite: 'var(--mc-granite)',
    graphite: 'var(--mc-graphite)',
    dust: 'var(--mc-dust)',
    signal: 'var(--mc-signal)',
    signalLight: 'var(--mc-signalLight)',
    clay: 'var(--mc-clay)',
    linkBlue: 'var(--mc-linkBlue)',
    red: 'var(--mc-red)',
    yellow: 'var(--mc-yellow)',
    ghost: 'var(--mc-ghost)',
  }
}
```

- [ ] **Step 3: Set default CSS variables in index.css**

In `frontend/src/index.css`, add at the top:
```css
:root {
  --mc-canvas: #F3F0EE;
  --mc-lifted: #FCFBFA;
  --mc-white: #FFFFFF;
  --mc-bone: #F4F4F4;
  --mc-ink: #141413;
  --mc-charcoal: #262627;
  --mc-slate: #696969;
  --mc-granite: #555555;
  --mc-graphite: #565656;
  --mc-dust: #D1CDC7;
  --mc-signal: #CF4500;
  --mc-signalLight: #F37338;
  --mc-clay: #9A3A0A;
  --mc-linkBlue: #3860BE;
  --mc-red: #EB001B;
  --mc-yellow: #F79E1B;
  --mc-ghost: #E8E2DA;
}
```

- [ ] **Step 4: Apply theme dynamically when preset changes**

In `frontend/src/components/AppearanceTab.tsx`, after `applyPreset` success, inject CSS variables. Add a helper:
```typescript
function applyThemeToCSS(theme: Record<string, string>) {
  const root = document.documentElement;
  const mapping: Record<string, string> = {
    bg: '--mc-canvas',
    bg_secondary: '--mc-lifted',
    fg: '--mc-ink',
    fg_muted: '--mc-slate',
    accent: '--mc-signal',
    accent_light: '--mc-signalLight',
    border: '--mc-dust',
    error: '--mc-red',
    warning: '--mc-yellow',
  };
  for (const [key, cssVar] of Object.entries(mapping)) {
    if (theme[key]) root.style.setProperty(cssVar, theme[key]);
  }
}
```
Call `applyThemeToCSS(t)` in `refresh()` after setting theme.

- [ ] **Step 5: Commit**

```bash
git add backend/core/config_theme.py frontend/tailwind.config.js frontend/src/index.css frontend/src/components/AppearanceTab.tsx
git commit -m "feat: make Mastercard Cream theme functional with CSS variables"
```

---

### Task 5: Electron Backend Crash Recovery

**Files:**
- Modify: `electron/main.js`

- [ ] **Step 1: Wrap startPythonBackend in retry loop**

Replace `startPythonBackend` function with:
```javascript
async function startPythonBackend(attempt = 1) {
  try {
    await _startPythonBackend();
  } catch (err) {
    console.error(`Backend start attempt ${attempt} failed:`, err.message);
    if (attempt >= 3) {
      dialog.showErrorBox(
        'Error de inicio',
        'El backend no pudo iniciar después de 3 intentos. Intenta reiniciar la aplicación.'
      );
      app.quit();
      return;
    }
    const delay = Math.pow(2, attempt - 1) * 1000;
    await new Promise(r => setTimeout(r, delay));
    return startPythonBackend(attempt + 1);
  }
}
```
Rename current `startPythonBackend` to `_startPythonBackend`.

- [ ] **Step 2: Send timeout errors to renderer**

In the `ipcMain.handle('ipc-call', ...)` timeout handler, before rejecting:
```javascript
if (mainWindow && !mainWindow.isDestroyed()) {
  mainWindow.webContents.send('ipc-notify', 'ipc.error', { message: 'IPC timeout: backend no responde' });
}
```

- [ ] **Step 3: Add renderer uncaughtException handler in preload**

In `electron/preload.js`, add:
```javascript
window.addEventListener('error', (e) => {
  console.error('Renderer error:', e.error);
});
```

- [ ] **Step 4: Commit**

```bash
git add electron/main.js electron/preload.js
git commit -m "feat: add backend crash recovery with retry loop and IPC timeout notifications"
```

---

## Phase 2: Frontend Features — Thumbnails & Preview

### Task 6: Thumbnail Component

**Files:**
- Create: `frontend/src/components/Thumbnail.tsx`
- Modify: `frontend/src/components/ConversionTab.tsx`

- [ ] **Step 1: Create Thumbnail component**

```tsx
// frontend/src/components/Thumbnail.tsx
interface ThumbnailProps {
  path: string;
  size?: number;
}

export default function Thumbnail({ path, size = 48 }: ThumbnailProps) {
  const ext = path.split('.').pop()?.toUpperCase() ?? '';
  const src = path.startsWith('file://') ? path : `file://${path}`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <img
        src={src}
        alt=""
        className="w-full h-full rounded-full object-cover border border-mc-dust/40"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <span className="absolute -bottom-0.5 -right-0.5 bg-mc-ink text-mc-canvas text-[9px] font-bold px-1 py-0.5 rounded-pill">
        {ext}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Use Thumbnail in file list**

In `ConversionTab.tsx`, in the file list items (where `f.split('\\').pop()` is shown), replace the plain text row with:
```tsx
<div key={f} className={`flex items-center gap-2 px-3 py-2 rounded-btn text-xs ...`}>
  <Thumbnail path={f} />
  <span className="truncate pr-2 text-mc-ink font-medium">{f.split('\\').pop()}</span>
  <button onClick={() => removeFile(i)} ...>×</button>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Thumbnail.tsx frontend/src/components/ConversionTab.tsx
git commit -m "feat: add circular image thumbnails with format badge in file list"
```

---

### Task 7: Preview Image Handler (Backend)

**Files:**
- Modify: `backend/core/converter.py`
- Modify: `backend/handlers.py`

- [ ] **Step 1: Add preview conversion function**

In `backend/core/converter.py`, add:
```python
import base64
import tempfile

def convertir_a_preview(
    ruta_origen: Union[str, Path],
    formato_salida: str = "PNG",
    calidad: int = 85,
    resize: Union[tuple[int, int], list[int], None] = None,
) -> str:
    """Converts image to a small preview and returns base64 PNG data URI."""
    ruta_origen = Path(ruta_origen)
    if not ruta_origen.exists():
        raise FileNotFoundError(f"No se encontró: {ruta_origen}")

    with Image.open(ruta_origen) as img:
        # Max preview size 400px on longest side
        max_size = 400
        ratio = min(max_size / max(img.size), 1.0)
        preview_size = (int(img.width * ratio), int(img.height * ratio))
        img = img.resize(preview_size, Image.LANCZOS)

        # Convert to RGB for preview consistency
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")
        elif img.mode != "RGB":
            img = img.convert("RGB")

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            img.save(tmp.name, format="PNG", optimize=True)
            tmp_path = tmp.name

    with open(tmp_path, "rb") as f:
        data = base64.b64encode(f.read()).decode("ascii")
    Path(tmp_path).unlink(missing_ok=True)
    return f"data:image/png;base64,{data}"
```

- [ ] **Step 2: Add handler**

In `backend/handlers.py`, add to `Handlers`:
```python
@staticmethod
def preview_image(params: dict[str, Any]) -> dict[str, str]:
    from backend.core.converter import convertir_a_preview
    path = params.get("path", "")
    formato = params.get("formato", "PNG")
    calidad = params.get("calidad", 85)
    resize = params.get("resize")
    preview = convertir_a_preview(path, formato, calidad, resize)
    return {"preview": preview}
```

Register in `HANDLERS` dict:
```python
"preview_image": Handlers.preview_image,
```

- [ ] **Step 3: Commit**

```bash
git add backend/core/converter.py backend/handlers.py
git commit -m "feat: add preview_image handler for real-time conversion preview"
```

---

### Task 8: ImagePreview Component (Frontend)

**Files:**
- Create: `frontend/src/components/ImagePreview.tsx`
- Modify: `frontend/src/components/ConversionTab.tsx`
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Create ImagePreview component**

```tsx
// frontend/src/components/ImagePreview.tsx
import { useEffect, useState } from 'react';
import { api } from '../api';

interface ImagePreviewProps {
  path: string;
  formato: string;
  calidad: number;
  resizeAncho: string;
  resizeAlto: string;
}

export default function ImagePreview({ path, formato, calidad, resizeAncho, resizeAlto }: ImagePreviewProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const resize = resizeAncho && resizeAlto
          ? [parseInt(resizeAncho), parseInt(resizeAlto)]
          : null;
        const r = await api.previewImage({ path, formato, calidad, resize });
        if (!cancelled) setPreview(r.preview);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [path, formato, calidad, resizeAncho, resizeAlto]);

  const originalSrc = path.startsWith('file://') ? path : `file://${path}`;

  return (
    <div className="flex gap-4 h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <span className="text-xs font-bold uppercase tracking-eyebrow text-mc-slate mb-2">Original</span>
        <img src={originalSrc} alt="" className="flex-1 object-contain rounded-card bg-mc-ink" />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <span className="text-xs font-bold uppercase tracking-eyebrow text-mc-slate mb-2">Previsualización</span>
        {loading && <div className="flex-1 flex items-center justify-center text-mc-slate text-sm">Generando...</div>}
        {!loading && preview && <img src={preview} alt="" className="flex-1 object-contain rounded-card bg-mc-ink" />}
        {!loading && !preview && <div className="flex-1 flex items-center justify-center text-mc-dust text-sm">Selecciona una imagen</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add api.previewImage method**

In `frontend/src/api.ts`, add:
```typescript
previewImage: (body: { path: string; formato: string; calidad: number; resize?: number[] | null }) =>
  _invoke<{ preview: string }>('preview_image', body as Record<string, unknown>),
```

- [ ] **Step 3: Integrate into ConversionTab**

In `ConversionTab.tsx`:
- Add state: `const [selectedFile, setSelectedFile] = useState<string | null>(null);`
- When user clicks a file in the list, `setSelectedFile(f)`.
- In the right panel (or as an expandable section below file list), render:
```tsx
{selectedFile && (
  <div className="h-64 shrink-0 border-t border-mc-dust/20 pt-4">
    <ImagePreview
      path={selectedFile}
      formato={formato}
      calidad={calidad}
      resizeAncho={resizeAncho}
      resizeAlto={resizeAlto}
    />
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ImagePreview.tsx frontend/src/components/ConversionTab.tsx frontend/src/api.ts
git commit -m "feat: real-time conversion preview panel with debounced backend calls"
```

---

## Phase 3: History Tab

### Task 9: HistoryStore (Backend)

**Files:**
- Create: `backend/core/history.py`
- Modify: `backend/core/database.py`
- Modify: `backend/handlers.py`

- [ ] **Step 1: Create HistoryStore module**

```python
# backend/core/history.py
from __future__ import annotations
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from backend.core.database import get_db_path


def _ensure_table() -> None:
    db = get_db_path()
    with sqlite3.connect(str(db)) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS historial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                files_json TEXT NOT NULL,
                options_json TEXT NOT NULL,
                patron TEXT,
                formato TEXT,
                calidad INTEGER,
                resize TEXT,
                ok_count INTEGER DEFAULT 0,
                err_count INTEGER DEFAULT 0
            )
        """)


def save_run(
    files: list[str],
    options: dict[str, Any],
    patron: str,
    formato: str,
    calidad: int,
    resize: str | None,
    ok_count: int,
    err_count: int,
) -> int:
    _ensure_table()
    db = get_db_path()
    with sqlite3.connect(str(db)) as conn:
        cursor = conn.execute(
            """
            INSERT INTO historial (timestamp, files_json, options_json, patron, formato, calidad, resize, ok_count, err_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                datetime.now().isoformat(),
                json.dumps(files),
                json.dumps(options),
                patron,
                formato,
                calidad,
                resize,
                ok_count,
                err_count,
            ),
        )
        conn.commit()
        return cursor.lastrowid


def list_runs(limit: int = 50) -> list[dict[str, Any]]:
    _ensure_table()
    db = get_db_path()
    with sqlite3.connect(str(db)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM historial ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_run(run_id: int) -> dict[str, Any] | None:
    _ensure_table()
    db = get_db_path()
    with sqlite3.connect(str(db)) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM historial WHERE id = ?", (run_id,)).fetchone()
    return dict(row) if row else None


def delete_run(run_id: int) -> bool:
    _ensure_table()
    db = get_db_path()
    with sqlite3.connect(str(db)) as conn:
        cursor = conn.execute("DELETE FROM historial WHERE id = ?", (run_id,))
        conn.commit()
        return cursor.rowcount > 0
```

- [ ] **Step 2: Update database.py to ensure historial table on init**

In `backend/core/database.py`, add call to `_ensure_table()` inside `init_db()` or let `history.py` handle it lazily. Lazy is fine since `history.py` already calls `_ensure_table()`.

- [ ] **Step 3: Save history on process completion**

In `backend/handlers.py`, in `_process_thread`, at the end after `_state.running = False`:
```python
from backend.core.history import save_run
save_run(
    files=[str(f) for f in files],
    options={"formato": formato, "calidad": calidad, "resize": str(resize), "keep_exif": keep_exif, "usar_rename": usar_rename},
    patron=patron,
    formato=formato,
    calidad=calidad,
    resize=str(resize) if resize else None,
    ok_count=_state.ok_count,
    err_count=_state.err_count,
)
```

- [ ] **Step 4: Add handlers**

```python
@staticmethod
def history_list(params: dict[str, Any]) -> dict[str, Any]:
    from backend.core.history import list_runs
    limit = params.get("limit", 50)
    return {"runs": list_runs(limit)}

@staticmethod
def history_get(params: dict[str, Any]) -> dict[str, Any]:
    from backend.core.history import get_run
    run_id = params.get("id", 0)
    run = get_run(run_id)
    if run:
        run["files"] = json.loads(run["files_json"])
        run["options"] = json.loads(run["options_json"])
    return {"run": run}

@staticmethod
def history_delete(params: dict[str, Any]) -> dict[str, bool]:
    from backend.core.history import delete_run
    run_id = params.get("id", 0)
    return {"deleted": delete_run(run_id)}
```

Register in `HANDLERS`:
```python
"history_list": Handlers.history_list,
"history_get": Handlers.history_get,
"history_delete": Handlers.history_delete,
```

- [ ] **Step 5: Commit**

```bash
git add backend/core/history.py backend/core/database.py backend/handlers.py
git commit -m "feat: add history store and IPC handlers for processing runs"
```

---

### Task 10: HistoryTab (Frontend)

**Files:**
- Create: `frontend/src/components/HistoryTab.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Create HistoryTab**

```tsx
// frontend/src/components/HistoryTab.tsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import Button from './ui/Button';
import Badge from './ui/Badge';

interface HistoryRun {
  id: number;
  timestamp: string;
  formato: string;
  calidad: number;
  ok_count: number;
  err_count: number;
  patron: string;
  files: string[];
  options: Record<string, any>;
}

export default function HistoryTab() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [selected, setSelected] = useState<HistoryRun | null>(null);

  const refresh = async () => {
    const r = await api.historyList({ limit: 50 });
    setRuns(r.runs.map((run: any) => ({
      ...run,
      files: JSON.parse(run.files_json || '[]'),
      options: JSON.parse(run.options_json || '{}'),
    })));
  };

  useEffect(() => { refresh(); }, []);

  const reexecute = (run: HistoryRun) => {
    // Emit event or use global state to pass data back to ConversionTab
    // For now, we'll use a simple window.postMessage or callback
    // In a real app, use a context or state manager
    window.postMessage({ type: 'HISTORY_REEXECUTE', payload: run }, '*');
  };

  return (
    <div className="flex h-full w-full">
      <div className="w-[320px] shrink-0 flex flex-col border-r border-mc-dust/20 bg-mc-white">
        <div className="p-5 border-b border-mc-dust/20">
          <div className="mc-eyebrow mb-2">Registro</div>
          <h2 className="text-lg font-medium tracking-tight">Historial</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setSelected(run)}
              className={`w-full text-left px-4 py-3 rounded-btn text-sm transition-all ${
                selected?.id === run.id ? 'bg-mc-ink text-mc-canvas shadow-card' : 'hover:bg-mc-lifted'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{new Date(run.timestamp).toLocaleString()}</span>
                <Badge variant={run.err_count === 0 ? 'success' : 'warning'}>
                  {run.ok_count}/{run.ok_count + run.err_count}
                </Badge>
              </div>
              <div className="text-xs opacity-70 mt-1">{run.formato} · {run.files.length} archivos</div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col p-6 bg-mc-canvas overflow-y-auto">
        {selected ? (
          <div className="space-y-4">
            <div>
              <div className="mc-eyebrow mb-1">Detalle</div>
              <h3 className="text-lg font-medium">Ejecución #{selected.id}</h3>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-mc-white rounded-card p-3 border border-mc-dust/20">
                <div className="text-mc-slate text-xs uppercase">Formato</div>
                <div className="font-medium">{selected.formato}</div>
              </div>
              <div className="bg-mc-white rounded-card p-3 border border-mc-dust/20">
                <div className="text-mc-slate text-xs uppercase">Calidad</div>
                <div className="font-medium">{selected.calidad}</div>
              </div>
              <div className="bg-mc-white rounded-card p-3 border border-mc-dust/20">
                <div className="text-mc-slate text-xs uppercase">Patrón</div>
                <div className="font-medium truncate">{selected.patron || '—'}</div>
              </div>
            </div>
            <div className="bg-mc-white rounded-card border border-mc-dust/20 p-3">
              <div className="text-xs font-bold uppercase tracking-eyebrow text-mc-slate mb-2">Archivos</div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {selected.files.map((f, i) => (
                  <div key={i} className="text-xs text-mc-ink truncate">{f.split('\\').pop()}</div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => reexecute(selected)}>Re-ejecutar</Button>
              <Button variant="ghost" onClick={async () => { await api.historyDelete(selected.id); refresh(); setSelected(null); }}>Eliminar</Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-mc-slate">
            Selecciona una ejecución para ver detalles
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add to App.tsx**

Add history icon and tab:
```tsx
const tabs = [
  { id: 'convert' as const, label: 'Conversión', icon: convertIcon },
  { id: 'db' as const, label: 'Base de Datos', icon: dbIcon },
  { id: 'appearance' as const, label: 'Apariencia', icon: appearanceIcon },
  { id: 'history' as const, label: 'Historial', icon: historyIcon },
];
```

Add `historyIcon` SVG (clock icon). Add tab render:
```tsx
{activeTab === 'history' && <HistoryTab />}
```

Import `HistoryTab` at top.

- [ ] **Step 3: Add API methods**

In `frontend/src/api.ts`:
```typescript
historyList: (body?: { limit?: number }) => _invoke<{ runs: any[] }>('history_list', body as Record<string, unknown>),
historyGet: (id: number) => _invoke<{ run: any }>('history_get', { id }),
historyDelete: (id: number) => _invoke<{ deleted: boolean }>('history_delete', { id }),
```

- [ ] **Step 4: Handle re-execute in ConversionTab**

In `ConversionTab.tsx`, add `useEffect`:
```tsx
useEffect(() => {
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === 'HISTORY_REEXECUTE') {
      const run = e.data.payload as HistoryRun;
      setFiles(run.files);
      setFormato(run.options.formato || 'JPEG');
      setCalidad(run.options.calidad || 95);
      setPatron(run.patron || '');
      setActiveSection('files');
    }
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}, []);
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/HistoryTab.tsx frontend/src/App.tsx frontend/src/api.ts frontend/src/components/ConversionTab.tsx
git commit -m "feat: add History tab with re-execute and delete actions"
```

---

## Phase 4: Plugin System

### Task 11: Format Registry

**Files:**
- Create: `backend/core/format_registry.py`
- Modify: `backend/core/converter.py`
- Modify: `backend/handlers.py`

- [ ] **Step 1: Create FormatRegistry class**

```python
# backend/core/format_registry.py
from __future__ import annotations
from typing import Callable, Any

FormatEncoder = Callable[[Any, Any, str, Path], None]


class FormatRegistry:
    def __init__(self) -> None:
        self._formats: dict[str, dict[str, Any]] = {}

    def add_format(
        self,
        name: str,
        ext: str,
        modes: tuple[str, ...],
        encoder: FormatEncoder | None = None,
    ) -> None:
        self._formats[name.upper()] = {
            "ext": ext,
            "modes": modes,
            "encoder": encoder,
        }

    def get(self, name: str) -> dict[str, Any] | None:
        return self._formats.get(name.upper())

    def list_formats(self) -> list[str]:
        return list(self._formats.keys())

    def __contains__(self, name: str) -> bool:
        return name.upper() in self._formats

    def __getitem__(self, name: str) -> dict[str, Any]:
        return self._formats[name.upper()]


# Global registry instance
_registry = FormatRegistry()


def get_registry() -> FormatRegistry:
    return _registry
```

- [ ] **Step 2: Migrate converter.py to use registry**

In `backend/core/converter.py`:
- Replace `FORMATOS_SOPORTADOS` dict with:
```python
from backend.core.format_registry import get_registry

# Initialize default formats
_registry = get_registry()
_registry.add_format("JPEG", ".jpg", ("RGB", "L", "CMYK"))
_registry.add_format("JPG", ".jpg", ("RGB", "L", "CMYK"))
_registry.add_format("PNG", ".png", ("RGB", "RGBA", "L", "LA", "P"))
_registry.add_format("WEBP", ".webp", ("RGB", "RGBA", "L"))
_registry.add_format("BMP", ".bmp", ("RGB", "RGBA", "L"))
_registry.add_format("TIFF", ".tiff", ("RGB", "RGBA", "L", "CMYK"))
_registry.add_format("GIF", ".gif", ("P", "RGB", "L"))
_registry.add_format("ICO", ".ico", ("RGB", "RGBA", "L"))
_registry.add_format("PDF", ".pdf", ("RGB", "RGBA", "L", "P"))

FORMATOS_SOPORTADOS = _registry  # backward compat alias
```
- Update all references from `FORMATOS_SOPORTADOS[formato]` to `_registry[formato]` or `get_registry()[formato]`.
- Update `obtener_formatos()` to return `_registry.list_formats()`.

- [ ] **Step 3: Add handler to list plugin formats**

```python
@staticmethod
def plugin_formats(params: dict[str, Any]) -> dict[str, list[str]]:
    from backend.core.format_registry import get_registry
    return {"formats": get_registry().list_formats()}
```
Register in `HANDLERS`.

- [ ] **Step 4: Commit**

```bash
git add backend/core/format_registry.py backend/core/converter.py backend/handlers.py
git commit -m "refactor: extract FormatRegistry from converter.py for plugin extensibility"
```

---

### Task 12: Plugin Loader

**Files:**
- Create: `backend/core/plugins.py`
- Modify: `backend/main.py`
- Modify: `backend/utils/paths.py`

- [ ] **Step 1: Create plugin loader**

```python
# backend/core/plugins.py
from __future__ import annotations
import importlib.util
import logging
import sys
from pathlib import Path
from typing import Any

from backend.core.format_registry import FormatRegistry, get_registry
from backend.utils.paths import user_data_path

logger = logging.getLogger(__name__)


class PluginRegistry:
    def __init__(self, format_registry: FormatRegistry) -> None:
        self.formats = format_registry

    def add_format(self, name: str, ext: str, modes: tuple[str, ...], encoder=None) -> None:
        self.formats.add_format(name, ext, modes, encoder)


def load_plugins_from_dir(plugins_dir: Path | None = None) -> None:
    if plugins_dir is None:
        plugins_dir = user_data_path("plugins")
    plugins_dir.mkdir(parents=True, exist_ok=True)

    for file_path in plugins_dir.glob("*.py"):
        if file_path.name.startswith("_"):
            continue
        try:
            spec = importlib.util.spec_from_file_location(file_path.stem, file_path)
            if spec is None or spec.loader is None:
                continue
            module = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = module
            spec.loader.exec_module(module)
            if hasattr(module, "register"):
                registry = PluginRegistry(get_registry())
                module.register(registry)
                logger.info("Plugin cargado: %s", file_path.name)
            else:
                logger.warning("Plugin %s no tiene función register()", file_path.name)
        except Exception as exc:
            logger.error("Error cargando plugin %s: %s", file_path.name, exc)
```

- [ ] **Step 2: Load plugins on startup**

In `backend/main.py`, after `init_db()` and before IPC loop:
```python
from backend.core.plugins import load_plugins_from_dir
load_plugins_from_dir()
```

- [ ] **Step 3: Commit**

```bash
git add backend/core/plugins.py backend/main.py
git commit -m "feat: add dynamic plugin loader for format extensions"
```

---

### Task 13: Plugin Test

**Files:**
- Create: `tests/test_plugins.py`
- Create: `tests/fixtures/plugin_test.py` (test plugin)

- [ ] **Step 1: Write test plugin fixture**

```python
# tests/fixtures/plugin_test.py
def register(registry):
    registry.add_format("TESTFMT", ".tst", ("RGB", "RGBA"))
```

- [ ] **Step 2: Write test**

```python
# tests/test_plugins.py
import pytest
from pathlib import Path
from backend.core.format_registry import get_registry
from backend.core.plugins import load_plugins_from_dir


class TestPluginLoader:
    def test_loads_plugin_and_adds_format(self, tmp_path, monkeypatch):
        # Reset registry for test isolation
        from backend.core import format_registry
        registry = format_registry.FormatRegistry()
        monkeypatch.setattr(format_registry, "_registry", registry)

        plugins_dir = tmp_path / "plugins"
        plugins_dir.mkdir()
        (plugins_dir / "plugin_test.py").write_text(
            'def register(registry):\n    registry.add_format("HEICTST", ".heic", ("RGB", "RGBA"))\n'
        )
        load_plugins_from_dir(plugins_dir)
        assert "HEICTST" in registry.list_formats()
```

- [ ] **Step 3: Commit**

```bash
git add tests/test_plugins.py tests/fixtures/plugin_test.py
git commit -m "test: add plugin loader integration tests"
```

---

## Phase 5: Auto-Updates

### Task 14: electron-updater Integration

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `package.json`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Add electron-updater dependency**

```bash
cd C:\Users\HIDROAA\Desktop\hidro_convert && npm install electron-updater
```

- [ ] **Step 2: Configure publish in package.json**

In `package.json`, under `"build"`, add:
```json
"publish": {
  "provider": "github",
  "owner": "HIDROAA",
  "repo": "hidro_convert"
}
```

- [ ] **Step 3: Add auto-updater logic in main.js**

At top of `electron/main.js`:
```javascript
const { autoUpdater } = require('electron-updater');
```

After `app.whenReady()`:
```javascript
autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-available', (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});
```

- [ ] **Step 4: Expose in preload**

```javascript
onUpdateAvailable: (callback) => {
  const listener = (event, info) => callback(info);
  ipcRenderer.on('update-available', listener);
  return () => ipcRenderer.removeListener('update-available', listener);
},
onUpdateDownloaded: (callback) => {
  const listener = (event, info) => callback(info);
  ipcRenderer.on('update-downloaded', listener);
  return () => ipcRenderer.removeListener('update-downloaded', listener);
},
quitAndInstall: () => ipcRenderer.send('quit-and-install'),
```

Add handler in `main.js`:
```javascript
ipcMain.on('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});
```

- [ ] **Step 5: Add update banner in App.tsx**

Add state:
```tsx
const [updateInfo, setUpdateInfo] = useState<any>(null);
```

In `useEffect`:
```tsx
useEffect(() => {
  if (!window.electronAPI?.onUpdateAvailable) return;
  const unsub = window.electronAPI.onUpdateAvailable((info: any) => {
    setUpdateInfo({ ...info, status: 'available' });
  });
  return unsub;
}, []);
```

Render banner if `updateInfo`:
```tsx
{updateInfo && (
  <div className="absolute top-0 left-0 right-0 bg-mc-signal text-white px-4 py-2 flex items-center justify-between z-50">
    <span className="text-sm font-medium">Nueva versión disponible: {updateInfo.version}</span>
    <button onClick={() => window.electronAPI?.quitAndInstall?.()} className="text-sm underline">
      {updateInfo.status === 'downloaded' ? 'Reiniciar para actualizar' : 'Descargando...'}
    </button>
  </div>
)}
```

- [ ] **Step 6: Restore GitHub Actions workflow**

Create `.github/workflows/release.yml`:
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: pip install -r requirements.txt
      - run: cd backend && python -m pytest ../tests -v
      - run: cd frontend && npm ci
      - run: cd frontend && npx tsc --noEmit

  build:
    needs: test
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: pip install -r requirements.txt pyinstaller
      - run: npm ci
      - run: npm run build:backend
      - run: npm run build:frontend
      - run: npx electron-builder --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json electron/main.js electron/preload.js frontend/src/App.tsx .github/workflows/release.yml
git commit -m "feat: integrate electron-updater with GitHub Actions release pipeline"
```

---

## Phase 6: Internationalization (i18n)

### Task 15: Frontend i18n

**Files:**
- Create: `frontend/src/i18n.ts`
- Create: `frontend/src/locales/es.json`
- Create: `frontend/src/locales/en.json`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AppearanceTab.tsx`

- [ ] **Step 1: Install dependencies**

```bash
cd C:\Users\HIDROAA\Desktop\hidro_convert\frontend && npm install react-i18next i18next i18next-http-backend
```

- [ ] **Step 2: Create i18n setup**

```typescript
// frontend/src/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es.json';
import en from './locales/en.json';

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: 'es',
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

export default i18n;
```

- [ ] **Step 3: Create translation files**

`frontend/src/locales/es.json` (extract all UI strings from components):
```json
{
  "app.title": "HidroConvert",
  "app.subtitle": "Conversor y renombrador profesional de imágenes",
  "tab.convert": "Conversión",
  "tab.db": "Base de Datos",
  "tab.appearance": "Apariencia",
  "tab.history": "Historial",
  "convert.files": "Archivos de origen",
  "convert.drop": "Arrastra imágenes aquí",
  "convert.options": "Opciones de conversión",
  "convert.format": "Formato de salida",
  "convert.quality": "Calidad",
  "convert.resize": "Redimensionar",
  "convert.keepExif": "Preservar metadatos EXIF",
  "convert.rename": "Renombrado",
  "convert.pattern": "Patrón de nombre",
  "convert.process": "Procesar Lote",
  "convert.cancel": "Cancelar",
  "db.records": "Registros",
  "db.schema": "Esquema",
  "db.import": "Importar Excel",
  "db.export": "Exportar Excel",
  "appearance.presets": "Presets",
  "appearance.save": "Guardar tema",
  "appearance.reset": "Restaurar default",
  "history.empty": "Sin ejecuciones registradas",
  "history.reexecute": "Re-ejecutar",
  "history.delete": "Eliminar"
}
```

`frontend/src/locales/en.json` (same keys, English values).

- [ ] **Step 4: Wrap app with i18n**

In `frontend/src/main.tsx`:
```tsx
import './i18n';
```
Add at top of file.

- [ ] **Step 5: Replace strings with t()**

In `App.tsx`, `ConversionTab.tsx`, `DatabaseTab.tsx`, `AppearanceTab.tsx`, `HistoryTab.tsx`, replace hardcoded UI strings with:
```tsx
import { useTranslation } from 'react-i18next';
// ...
const { t } = useTranslation();
// ...
{t('tab.convert')}
```

- [ ] **Step 6: Add language switcher in AppearanceTab**

```tsx
<div className="mt-4">
  <label className="mc-label">Idioma</label>
  <select
    className="mc-input w-full"
    value={i18n.language}
    onChange={(e) => i18n.changeLanguage(e.target.value)}
  >
    <option value="es">Español</option>
    <option value="en">English</option>
  </select>
</div>
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/i18n.ts frontend/src/locales/es.json frontend/src/locales/en.json frontend/src/main.tsx frontend/src/App.tsx frontend/src/components/*.tsx
git commit -m "feat: add react-i18next with Spanish/English translations"
```

---

### Task 16: Backend i18n

**Files:**
- Create: `backend/locales/es.json`
- Create: `backend/locales/en.json`
- Modify: `backend/handlers.py`
- Modify: `backend/core/converter.py`
- Modify: `backend/core/history.py`

- [ ] **Step 1: Create backend translation module**

```python
# backend/utils/i18n.py
from __future__ import annotations
import json
from pathlib import Path
from typing import Any

_LOCALE_DIR = Path(__file__).parent.parent / "locales"
_current_locale = "es"
_translations: dict[str, dict[str, str]] = {}


def _load(locale: str) -> dict[str, str]:
    path = _LOCALE_DIR / f"{locale}.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def set_locale(locale: str) -> None:
    global _current_locale
    _current_locale = locale
    if locale not in _translations:
        _translations[locale] = _load(locale)


def t(key: str, **kwargs: Any) -> str:
    text = _translations.get(_current_locale, {}).get(key, key)
    return text.format(**kwargs) if kwargs else text
```

- [ ] **Step 2: Create backend locale files**

`backend/locales/es.json`:
```json
{
  "error.file_not_found": "No se encontró la imagen: {path}",
  "error.unsupported_format": "Formato no soportado: {format}",
  "error.process_failed": "Error procesando {file}: {error}",
  "info.process_complete": "Proceso finalizado. Exitosos: {ok}, Errores: {err}",
  "info.cancelled": "Proceso cancelado por el usuario"
}
```

`backend/locales/en.json` (same keys, English values).

- [ ] **Step 3: Use translations in handlers**

In `backend/handlers.py`, import `t` and `set_locale` from `backend.utils.i18n`.
In each handler that receives params, call:
```python
set_locale(params.get("locale", "es"))
```
Replace hardcoded error/info strings with `t("key", ...)`. For example:
```python
_log(t("info.cancelled"), "warn")
```

- [ ] **Step 4: Commit**

```bash
git add backend/utils/i18n.py backend/locales/es.json backend/locales/en.json backend/handlers.py
git commit -m "feat: add backend i18n with locale-per-request support"
```

---

## Phase 7: CI/CD & Testing

### Task 17: Frontend Unit Tests

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts`
- Create: `frontend/src/components/__tests__/Button.test.tsx`
- Create: `frontend/src/components/__tests__/Badge.test.tsx`
- Create: `frontend/src/components/__tests__/ConversionTab.test.tsx`

- [ ] **Step 1: Install test dependencies**

```bash
cd C:\Users\HIDROAA\Desktop\hidro_convert\frontend && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Configure Vitest**

In `frontend/vite.config.ts`, add:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

Create `frontend/src/test-setup.ts`:
```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 3: Mock electronAPI globally**

Create `frontend/src/__mocks__/electronAPI.ts`:
```typescript
export const mockElectronAPI = {
  invoke: vi.fn(async (method: string, params?: Record<string, unknown>) => {
    // Return mock responses based on method
    if (method === 'version') return { version: '0.2.0' };
    if (method === 'formats') return { formats: ['JPEG', 'PNG'] };
    if (method === 'db_records') return { records: [], fields: ['codigo'] };
    return {};
  }),
  onNotify: vi.fn(() => () => {}),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});
```

- [ ] **Step 4: Write Button test**

```tsx
// frontend/src/components/__tests__/Button.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from '../ui/Button';

describe('Button', () => {
  it('renders primary variant', () => {
    render(<Button variant="primary">Click</Button>);
    expect(screen.getByText('Click')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button variant="primary" onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Write ConversionTab render test**

```tsx
// frontend/src/components/__tests__/ConversionTab.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConversionTab from '../ConversionTab';

describe('ConversionTab', () => {
  it('renders file section by default', () => {
    render(<ConversionTab />);
    expect(screen.getByText('Archivos de origen')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/vite.config.ts frontend/src/test-setup.ts frontend/src/__mocks__/electronAPI.ts frontend/src/components/__tests__/
git commit -m "test: add Vitest + Testing Library for frontend component tests"
```

---

### Task 18: IPC Integration Tests

**Files:**
- Create: `tests/test_ipc.py`

- [ ] **Step 1: Spawn Python backend and verify JSON-RPC**

```python
# tests/test_ipc.py
import json
import subprocess
import sys
import time
from pathlib import Path

import pytest

BACKEND_SCRIPT = Path(__file__).parent.parent / "backend" / "main.py"


@pytest.fixture
def backend_process():
    proc = subprocess.Popen(
        [sys.executable, str(BACKEND_SCRIPT)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    # Wait for ready message
    buffer = ""
    start = time.time()
    while time.time() - start < 10:
        line = proc.stdout.readline()
        buffer += line
        try:
            msg = json.loads(line)
            if msg.get("method") == "ready":
                break
        except json.JSONDecodeError:
            continue
    else:
        proc.kill()
        pytest.fail("Backend did not send ready message")

    yield proc
    proc.stdin.close()
    proc.kill()


class TestIPC:
    def test_version(self, backend_process):
        req = {"jsonrpc": "2.0", "id": "1", "method": "version", "params": {}}
        backend_process.stdin.write(json.dumps(req) + "\n")
        backend_process.stdin.flush()

        line = backend_process.stdout.readline()
        resp = json.loads(line)
        assert "result" in resp
        assert resp["result"]["version"] == "0.2.0"

    def test_formats(self, backend_process):
        req = {"jsonrpc": "2.0", "id": "2", "method": "formats", "params": {}}
        backend_process.stdin.write(json.dumps(req) + "\n")
        backend_process.stdin.flush()

        line = backend_process.stdout.readline()
        resp = json.loads(line)
        assert "JPEG" in resp["result"]["formats"]

    def test_unknown_method(self, backend_process):
        req = {"jsonrpc": "2.0", "id": "3", "method": "nonexistent", "params": {}}
        backend_process.stdin.write(json.dumps(req) + "\n")
        backend_process.stdin.flush()

        line = backend_process.stdout.readline()
        resp = json.loads(line)
        assert "error" in resp
```

- [ ] **Step 2: Commit**

```bash
git add tests/test_ipc.py
git commit -m "test: add IPC integration tests spawning real Python backend"
```

---

## Final Verification Steps

After all phases are complete, run the full verification suite:

- [ ] **Step 1: Python tests**

```bash
cd C:\Users\HIDROAA\Desktop\hidro_convert && python -m pytest tests -v
```
Expected: all tests pass (44 original + new tests).

- [ ] **Step 2: Frontend tests**

```bash
cd C:\Users\HIDROAA\Desktop\hidro_convert\frontend && npx vitest run
```
Expected: all frontend component tests pass.

- [ ] **Step 3: Type check**

```bash
cd C:\Users\HIDROAA\Desktop\hidro_convert\frontend && npx tsc --noEmit
```
Expected: no TypeScript errors.

- [ ] **Step 4: Lint**

```bash
cd C:\Users\HIDROAA\Desktop\hidro_convert\backend && ruff check .
```
Expected: no lint errors.

- [ ] **Step 5: Build backend**

```bash
cd C:\Users\HIDROAA\Desktop\hidro_convert && npm run build:backend
```
Expected: `dist/HidroConvertBackend.exe` created.

- [ ] **Step 6: Build frontend**

```bash
cd C:\Users\HIDROAA\Desktop\hidro_convert && npm run build:frontend
```
Expected: `frontend/dist/` created with no errors.

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|---|---|
| PyInstaller spec | Task 1 |
| Fix type bug | Task 2 |
| Scroll fixes | Task 3 |
| Mastercard theme | Task 4 |
| Backend crash recovery | Task 5 |
| Thumbnails | Task 6 |
| Preview image handler | Task 7 |
| ImagePreview component | Task 8 |
| History backend | Task 9 |
| History frontend tab | Task 10 |
| FormatRegistry | Task 11 |
| Plugin loader | Task 12 |
| Plugin tests | Task 13 |
| Auto-updater | Task 14 |
| Frontend i18n | Task 15 |
| Backend i18n | Task 16 |
| Frontend unit tests | Task 17 |
| IPC integration tests | Task 18 |
