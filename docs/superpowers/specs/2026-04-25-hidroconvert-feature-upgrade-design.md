# HidroConvert Feature Upgrade — Design Spec

**Date:** 2026-04-25
**Scope:** Enfoque C — Feature Upgrade (5-7 sesiones)
**Goal:** Transformar HidroConvert en un producto comercial listo con preview realtime, plugins, auto-updates, i18n, historial y CI/CD completo.

---

## 1. Fixes Críticos y Base Técnica

### 1.1 PyInstaller Spec (`backend/backend.spec`)
- **Problem:** `scripts/build-backend.js` references `backend/backend.spec` which does not exist. `npm run build:win` fails silently in production.
- **Fix:** Create `backend/backend.spec` with:
  - Entry point: `backend/main.py`
  - Hidden imports: `Pillow`, `pandas`, `openpyxl`, `backend.core.*`, `backend.utils.*`
  - Output: `dist/HidroConvertBackend.exe`
  - Console mode for IPC (stdio pipe must stay open)

### 1.2 Type Bug in `generar_plantilla_excel`
- **Problem:** Function declares `-> None` but returns `len(df)` (int). `handlers.py` caller does not handle return value.
- **Fix:** Change return type to `-> int`. Keep return value. `handlers.py` `db_template` handler: ignore return or log count.

### 1.3 Frontend Scroll / Overflow
- **Problem:** Multiple containers use `overflow-hidden` where content exceeds viewport:
  - `ConversionTab`: log panel, file list
  - `DatabaseTab`: records list
  - `AppearanceTab`: color grid
- **Fix:** Change `overflow-hidden` to `overflow-y-auto` on all `flex-1` containers that hold scrollable content.

### 1.4 Mastercard Cream Theme — Functional
- **Problem:** `config_theme.py` uses keys (`bg`, `fg`, `accent`) that do not map to Tailwind classes (`mc-canvas`, `mc-ink`, `mc-signal`). The Appearance tab changes values but the UI does not react because the CSS classes are static.
- **Fix:**
  - Add preset **"Mastercard Cream"** to `PRESETS` in `config_theme.py` with real DESIGN.md colors.
  - Add mapping: each theme key maps to a CSS custom property (`--mc-canvas`, `--mc-ink`, etc.).
  - Frontend: inject CSS variables from theme config into `:root` dynamically. Tailwind classes read from these variables.
  - This makes the Appearance tab actually work.

### 1.5 Electron Robustness — Backend Crash Recovery
- **Problem:** If the Python backend process crashes, the app becomes unresponsive. No retry, no user feedback.
- **Fix:**
  - In `electron/main.js`, wrap `startPythonBackend` in a retry loop: max 3 attempts with exponential backoff (1s, 2s, 4s).
  - On final failure, show a `dialog.showErrorBox` with actionable message: "El backend no pudo iniciar. Intenta reiniciar la aplicación."
  - On IPC timeout, send a toast notification to renderer via `ipc-notify` so frontend shows error inline instead of silent failure.
  - Add `uncaughtException` handler in renderer (preload) to prevent white-screen crashes.

---

## 2. Features Frontend

### 2.1 Thumbnails in File List
- **Location:** `ConversionTab` — file list area.
- **Behavior:**
  - For each loaded file, show a ~48x48px circular thumbnail.
  - Use Electron `file://` protocol to load local images directly (fast, no backend roundtrip).
  - Overlay original format badge (e.g., "JPG", "PNG") in bottom-right corner.
  - Fallback: generic image icon if file cannot be read.

### 2.2 Real-time Conversion Preview
- **Location:** New "Preview" panel inside `ConversionTab` (toggleable).
- **Behavior:**
  - User selects one image from the loaded list.
  - Backend handler `preview_image(params)`:
    - Takes: `path`, `formato`, `calidad`, `resize`, `keep_exif`.
    - Converts to a small PNG (~400px wide max) using Pillow.
    - Returns base64 data URI.
  - Frontend renders side-by-side:
    - Left: original image (`<img src="file://path" />`).
    - Right: preview result (`<img src="data:image/png;base64,..." />`).
  - Updates in real-time when user changes format, quality, or resize.
  - Debounce: 300ms to avoid flooding IPC.

### 2.3 Processing History with Re-execute
- **Location:** New tab **"Historial"` (4th tab in sidebar).
- **Backend (`database.py`):**
  - New table `historial` with columns: `id`, `timestamp`, `files_json`, `options_json`, `patron`, `formato`, `calidad`, `resize`, `ok_count`, `err_count`.
  - New handlers: `history_list`, `history_get(id)`, `history_delete(id)`.
- **Frontend:**
  - List of past executions sorted by timestamp (newest first).
  - Each entry shows: date, file count, format, result (ok/err badge).
  - Actions: "Re-ejecutar" (reloads same files + options), "Ver detalle" (expand to see file list), "Eliminar".
  - Re-execute: loads saved `files_json` and `options_json` back into ConversionTab state and starts process.

---

## 3. Plugins + Auto-updates + i18n

### 3.1 Plugin System for Formats
- **Location:** `backend/core/plugins.py`.
- **Architecture:**
  - Plugin directory: `data/plugins/*.py` (auto-created if missing).
  - On startup, `main.py` imports every `.py` in `data/plugins/` and calls `register()` if present.
  - Each plugin module defines:
    ```python
    def register(registry):
        registry.add_format("HEIF", ".heif", ("RGB", "RGBA"), encoder_fn=my_encoder)
    ```
  - `converter.py` refactored:
    - `FORMATOS_SOPORTADOS` becomes a class `FormatRegistry` (dict-like).
    - Default formats registered at init.
    - Plugins extend the registry.
    - All code that reads `FORMATOS_SOPORTADOS` reads from `registry` instead.
  - Security: plugins run in the same process. Document clearly that plugins are trusted code.

### 3.2 Auto-updates via electron-updater
- **Location:** `electron/main.js`, `package.json`.
- **Architecture:**
  - Add `electron-updater` as dependency.
  - Configure `publish` in `package.json` `build` block:
    ```json
    "publish": {
      "provider": "github",
      "owner": "HIDROAA",
      "repo": "hidro_convert"
    }
    ```
  - On app startup, check for updates silently.
  - If update available, send notification to renderer.
  - Renderer shows banner: "Nueva versión disponible: vX.Y.Z. Descargar ahora / Más tarde".
  - On "Descargar", `autoUpdater.downloadUpdate()`.
  - On download complete, banner changes to "Reiniciar para aplicar actualización".
  - Restore `.github/workflows/release.yml` (was deleted in working tree) to build and publish releases on tag push.

### 3.3 Internationalization (i18n)
- **Frontend:** `react-i18next` + `i18next`.
  - Translation files: `frontend/src/locales/es.json`, `frontend/src/locales/en.json`.
  - All UI strings extracted to translation keys.
  - Language switcher in Appearance tab (es / en).
  - Default: `es`.
- **Backend:**
  - Accept `locale` param in IPC messages (optional, default `es`).
  - Error messages and log strings translated via simple dict lookup.
  - Translation files: `backend/locales/es.json`, `backend/locales/en.json`.

---

## 4. CI/CD + Testing Completo

### 4.1 GitHub Actions Workflow
- **Restore** `.github/workflows/release.yml` (deleted in working tree, exists in commit `be4e753`).
- **Enhanced pipeline:**
  - **Job `test`:** Run Python tests (`pytest`), run frontend tests (`vitest run`), run lint (`ruff check .`, `tsc --noEmit`).
  - **Job `build`:** Depends on `test`. Build backend (`npm run build:backend`), build frontend (`npm run build:frontend`), package with `electron-builder`.
  - **Job `release`:** Depends on `build`. On tag push (`v*`), create GitHub Release draft with artifacts.
  - **Platforms:** Windows (NSIS + portable), macOS (DMG universal), Linux (AppImage).

### 4.2 Frontend Testing
- **Stack:** `vitest` (already installed), `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
- **Coverage target:** 60% on components (`Button`, `Card`, `Badge`, `ConversionTab` render, `App` tab switching).
- **Tests:**
  - `Button.test.tsx`: renders all variants, fires click.
  - `ConversionTab.test.tsx`: renders with mock API, switches sections.
  - `api.test.ts`: mock `window.electronAPI`, verifies JSON-RPC shape.

### 4.3 IPC Integration Testing
- **Stack:** Node.js test runner or `vitest` in a Node environment.
- **Approach:**
  - Spawn `python backend/main.py` as child process.
  - Write JSON-RPC requests to `stdin`, read responses from `stdout`.
  - Verify every handler returns valid JSON-RPC 2.0.
  - For `process_start`, verify notifications (`process.progress`, `process.complete`) are sent.
  - Cleanup: kill Python process after test.

---

## 5. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React + Vite)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │Conversión │ │  Base    │ │Apariencia│ │ Historial│             │
│  │ + Preview│ │  Datos   │ │ + i18n   │ │          │             │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘             │
│       └─────────────┴─────────────┴─────────────┘                │
│                         api.ts (IPC bridge)                         │
│                    window.electronAPI.invoke(...)                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Electron Main Process                            │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │ ipcMain      │  │ autoUpdater  │  │ Backend Manager        │   │
│  │ ('ipc-call') │  │ (GitHub      │  │ (spawn / retry / kill) │   │
│  └──────┬───────┘  │  Releases)   │  └───────────┬────────────┘   │
│         │          └──────────────┘              │                 │
│         │                                        │                 │
│         └────────────────────────────────────────┘                 │
│                          JSON-RPC over stdio                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Backend Python (JSON-RPC)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │handlers  │ │converter │ │database  │ │renamer   │ │plugins   │ │
│  │(router)  │ │(registry)│ │(catalogo │ │(engine)  │ │(loader)  │ │
│  └──────────┘ │          │ │+history) │ └──────────┘ └──────────┘ │
│               └──────────┘ └──────────┘                            │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                            │
│  │config_   │ │config_   │ │locales   │                            │
│  │fields    │ │theme     │ │(es/en)   │                            │
│  └──────────┘ └──────────┘ └──────────┘                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Flow: Conversion with Preview

1. User drops/selects files → frontend loads `files[]` state.
2. User clicks on one file in list → frontend calls `api.preview_image({path, formato, calidad, resize})`.
3. Electron main forwards JSON-RPC to Python backend.
4. Backend `preview_image` handler:
   - Calls `convertir_imagen` with same params, but output to temp file.
   - Reads temp file as base64.
   - Returns `{preview: "data:image/png;base64,..."}`.
5. Frontend renders side-by-side original vs preview.
6. User changes format/quality → debounced re-call → preview updates.
7. User clicks "Procesar Lote" → `process_start` → same pipeline as today, plus history save.
8. On `process.complete` notification → frontend saves entry to Historial tab.

---

## 7. Implementation Order

| Phase | Features | Est. Sessions |
|-------|----------|---------------|
| 1 | Fixes críticos (spec, type bug, scroll, theme, electron robustness) | 1 |
| 2 | Frontend features (thumbnails, preview realtime) | 1-2 |
| 3 | Historial tab + backend history table | 1 |
| 4 | Plugin system + refactor converter registry | 1-2 |
| 5 | Auto-updates (electron-updater + GitHub workflow) | 1 |
| 6 | i18n (frontend + backend translations) | 1 |
| 7 | CI/CD + frontend tests + IPC integration tests | 1 |

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| PyInstaller spec fails on Windows (antivirus, paths) | Test build in CI; use `--onefile` vs `--onedir` based on CI result |
| Plugin system security (arbitrary code execution) | Document "plugins are trusted"; sandbox not feasible for same-process Pillow |
| IPC integration tests flaky (Python spawn timing) | Use generous timeouts (10s); cleanup with `process.kill()` in `afterEach` |
| Auto-updater fails behind corporate proxy | Fallback: manual download link in error message |
| i18n maintenance overhead | Keep keys flat and namespaced; avoid dynamic string concatenation |
| Thumbnail generation slow for large batches | Only generate on-demand when user clicks file; lazy load |

---

## 9. Success Criteria

- [ ] `npm run build:win` produces a working `.exe` with backend bundled.
- [ ] All 44 existing Python tests pass + new IPC integration tests pass.
- [ ] Frontend tests (Vitest) run in CI with >60% component coverage.
- [ ] User can select an image and see a real-time preview of conversion result.
- [ ] User can re-execute a past batch from the Historial tab.
- [ ] A plugin `.py` in `data/plugins/` can add a new image format without code changes.
- [ ] App checks for updates on startup and prompts user if available.
- [ ] UI switches between Spanish and English without restart.
- [ ] GitHub Actions builds and drafts a release on tag push.
