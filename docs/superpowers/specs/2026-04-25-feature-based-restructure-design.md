# Feature-Based Restructure Design

**Date:** 2026-04-25  
**Status:** Approved  
**Approach:** Dominio primero (Opción B)

## Problem

Both backend and frontend have maintainability issues:

- `handlers.py` is a 200+ line God Object mixing global mutable state, threading, business logic, and IPC routing
- `main.py` mixes sys.path hacks with initialization
- Import inconsistencies (some use `from core.config_fields` without `backend.` prefix)
- `database.py` constructs SQL with f-strings (injection risk)
- `version.py` says `0.1.0` but project is `0.2.0`
- `ConversionTab.tsx` is 600+ lines with logic, state, UI and API all mixed
- No separation of custom hooks, services, or constants in frontend
- `electron` and `frontend` duplicate `electron` as devDependency
- `build-backend.js` references `venv312` which no longer exists
- `requirements.txt` is redundant with `pyproject.toml`

## Design

### Backend: Feature-based architecture

```
backend/
├── main.py                    # Entrypoint: inicia IPC, registra handlers
├── ipc_protocol.py            # Unchanged — works well
├── version.py                 # Fixed: 0.2.0
├── features/
│   ├── __init__.py
│   ├── converter/
│   │   ├── __init__.py
│   │   ├── service.py         # Pure logic: convertir_imagen, procesar_lote
│   │   ├── formats.py         # FORMATOS_SOPORTADOS, PIL_FORMAT_MAP
│   │   └── handler.py         # Thin IPC handler: formats, process_start/status/cancel
│   ├── catalog/
│   │   ├── __init__.py
│   │   ├── repository.py      # SQLite: init_db, buscar, importar, exportar (parameterized SQL)
│   │   ├── fields.py          # Field config (was config_fields.py)
│   │   └── handler.py         # IPC handler: db_records, db_import, scan_folder, db_fields*
│   ├── renamer/
│   │   ├── __init__.py
│   │   ├── engine.py          # RenamerEngine (pure, no direct BD dependency)
│   │   └── handler.py         # IPC handler: preview
│   └── theming/
│       ├── __init__.py
│       ├── presets.py          # DEFAULT_THEME, PRESETS
│       ├── service.py         # load/save/reset/load_preset
│       └── handler.py         # IPC handler: theme_get/save/presets/reset
├── shared/
│   ├── __init__.py
│   ├── paths.py               # resource_path, user_data_path
│   ├── validators.py          # sanitizar, parse_filename_parts
│   ├── exceptions.py          # Exception hierarchy
│   └── process_state.py       # ProcessState (extracted from handlers)
└── dialogs.py                 # tkinter helpers (cross-feature)
```

**Key changes:**
- `handlers.py` deleted → each feature has its own thin handler (~30-50 lines)
- `ProcessState` extracted to `shared/process_state.py`
- `database.py` → `catalog/repository.py` with parameterized SQL queries
- Handlers registered in `main.py` by importing each feature's handler
- Each feature is independently testable

### Frontend: Feature-based architecture

```
frontend/src/
├── main.tsx                   # Unchanged
├── App.tsx                    # Simplified: layout + tab routing only
├── index.css                  # Unchanged
├── api/
│   ├── client.ts              # IPC bridge: _invoke, onNotify
│   ├── types.ts               # Shared interfaces
│   └── index.ts               # api object re-exporting all methods
├── features/
│   ├── conversion/
│   │   ├── ConversionTab.tsx  # UI only
│   │   ├── useConversion.ts   # Custom hook: state + logic + API calls
│   │   └── constants.ts       # Sections, defaults
│   ├── database/
│   │   ├── DatabaseTab.tsx    # UI only
│   │   └── useDatabase.ts     # Custom hook: records, fields, import/export
│   └── appearance/
│       ├── AppearanceTab.tsx  # UI only
│       └── useAppearance.ts   # Custom hook: theme, presets, save/reset
└── components/
    └── ui/                    # Primitive components (unchanged)
        ├── Badge.tsx
        ├── Button.tsx
        ├── Card.tsx
        ├── Input.tsx
        └── SectionHeader.tsx
```

**Key changes:**
- Each tab component shrinks from 500-600 to ~150-200 lines (JSX only)
- Custom hooks encapsulate all state + API logic
- `api.ts` split into `client.ts`, `types.ts`, `index.ts`
- Root `types.ts` removed (was just re-exports)
- `LogPanel.tsx` and `ProgressBar.tsx` integrated into `conversion/` or `ui/`

### Build & Infrastructure

**Simplified build:**
- `scripts/build-backend.js` rewritten to detect system Python (not `venv312`)
- `backend/backend.spec` → `scripts/backend.spec`
- `requirements.txt` deleted — `pyproject.toml` is single source of truth

**Electron cleanup:**
- `electron/main.js` cleaned: IPC bridge logic extracted to `electron/ipc-bridge.js`
- `electron/preload.js` unchanged

**Root structure:**
```
/
├── backend/           # Python feature-based
├── frontend/          # React+TS feature-based
├── electron/
│   ├── main.js
│   ├── ipc-bridge.js  # Extracted IPC communication logic
│   └── preload.js
├── scripts/
│   ├── build-backend.js
│   └── backend.spec
├── assets/
├── data/
├── tests/
│   ├── converter/
│   ├── catalog/
│   ├── renamer/
│   └── conftest.py
├── package.json
├── pyproject.toml
├── DESIGN.md
├── .gitignore
└── pytest.ini
```

**Additional fixes:**
- `version.py` → `0.2.0`
- SQL in `repository.py` parameterized (no f-strings in queries)
- Delete `requirements.txt`
- Update `.gitignore` for `scripts/backend.spec`

### Migration Strategy

1. Create new directory structure (empty `__init__.py` files)
2. Move backend modules to new locations (one feature at a time)
3. Update all imports
4. Extract frontend custom hooks from tab components
5. Split `api.ts` into `client.ts` + `types.ts` + `index.ts`
6. Extract `electron/ipc-bridge.js`
7. Fix `version.py`, SQL parameterization, build script
8. Delete obsolete files (`requirements.txt`, old `types.ts`)
9. Run tests to verify nothing broke

### Handler Registration Pattern

Each feature's `handler.py` exports a `HANDLERS` dict:

```python
# backend/features/converter/handler.py
HANDLERS = {
    "formats": Handlers.formats,
    "process_start": Handlers.process_start,
    "process_status": Handlers.process_status,
    "process_cancel": Handlers.process_cancel,
}
```

`main.py` merges all feature handlers:

```python
from backend.features.converter.handler import HANDLERS as converter_handlers
from backend.features.catalog.handler import HANDLERS as catalog_handlers
from backend.features.renamer.handler import HANDLERS as renamer_handlers
from backend.features.theming.handler import HANDLERS as theming_handlers

ALL_HANDLERS = {**converter_handlers, **catalog_handlers, **renamer_handlers, **theming_handlers}
```

### Custom Hook Pattern

Each feature's hook encapsulates state and API:

```typescript
// frontend/src/features/conversion/useConversion.ts
export function useConversion() {
  const [files, setFiles] = useState<string[]>([]);
  const [status, setStatus] = useState<ProcessStatus | null>(null);
  // ... all state and logic

  return { files, setFiles, status, doProcess, doCancel, doPreview, ... };
}
```

Tab component becomes pure UI:

```tsx
// frontend/src/features/conversion/ConversionTab.tsx
export default function ConversionTab() {
  const { files, status, doProcess, ... } = useConversion();
  return <div>...</div>;  // Only JSX
}
```
