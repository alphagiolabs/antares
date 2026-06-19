# Flexible ID → Nombre Mapping Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the conversion mapping rename support Excel files with more than 2 columns, letting the user choose which column is the ID and which column is the new name, with auto-detection and history support.

**Architecture:** Extend the backend parser to accept arbitrary column names (not just ID/RENOMBRE), add `id_column` and `rename_column` parameters to the parser, preview, and conversion handlers, and expose column selectors in the frontend `RenameCard` when mapping mode is active. Persist the chosen columns in the conversion history for re-execution.

**Tech Stack:** Python 3.10+ (pandas + openpyxl), Electron + React + TypeScript + Vite, pytest, Vitest.

---

## Current state

- `backend/core/database.py` `parse_id_rename_mapping` requires exactly 2 columns (`ID` and `RENOMBRE`/`Rename`).
- `backend/handlers/database.py` `db_parse_mapping` calls `parse_id_rename_mapping` and computes stats via `MappingIndex`.
- `backend/handlers/conversion.py` `preview` and `_run_conversion_job` receive a `mapping` dict (ID → new name) and use `MappingIndex`.
- `frontend/src/components/conversion/ConversionView.tsx` has `mappingData`, `mappingPath`, `renameSource = 'mapping'`, and calls `api.dbParseMapping(path, files)`.
- `frontend/src/components/conversion/RenameCard.tsx` shows mapping mode summary but has no column selectors.
- `frontend/src/types.ts` already defines `MappingResult` and `MappingCollision`.
- `backend/core/mapping_index.py` already handles tolerant lookup and collision detection.

---

## Task 1: Backend parser — accept arbitrary ID and rename columns

**Files:**
- Modify: `backend/core/database.py`
- Modify: `backend/handlers/database.py`
- Test: `tests/test_database_mapping.py`

- [ ] Refactor `parse_id_rename_mapping` signature:
  ```python
  def parse_id_rename_mapping(
      excel_path: str,
      id_column: str | None = None,
      rename_column: str | None = None,
  ) -> dict[str, str]:
  ```
- [ ] Remove the strict "exactly 2 columns" requirement. Allow any number of columns.
- [ ] Normalize headers using existing `_normalize_excel_columns`.
- [ ] Define `ID_COLUMN_ALIASES = {"id", "codigo", "code", "filename", "nombre original", "archivo"}` and `RENAME_COLUMN_ALIASES = {"renombre", "rename", "nombre", "new_name", "newname", "nombre nuevo"}` for auto-detection.
- [ ] If `id_column` is not provided, pick the first column whose normalized name is in `ID_COLUMN_ALIASES`. If `rename_column` is not provided, pick the first column whose normalized name is in `RENAME_COLUMN_ALIASES`. If ambiguous or missing, raise `ValueError` listing the available columns.
- [ ] Validate that the chosen columns exist in the Excel. Raise `ValueError` if not.
- [ ] Keep existing validation: empty ID, empty rename, duplicate IDs (within the chosen ID column), and sanitize the rename value.
- [ ] Add a helper `_normalize_header_for_alias(header: str) -> str` that lowercases, strips accents, and replaces spaces/underscores with a single space.
- [ ] In `db_parse_mapping(params)`, accept optional `id_column` and `rename_column` parameters and pass them to `parse_id_rename_mapping`. Return the chosen columns in the response:
  ```python
  return {
      "mapping": mapping,
      "id_column": chosen_id,
      "rename_column": chosen_rename,
      "columns": list(df.columns),
      **stats,
  }
  ```
- [ ] Tests:
  - Test: Excel with 4 columns (ID, NOMBRE, CATEGORIA, RENOMBRE) auto-detects ID and RENOMBRE and returns correct mapping.
  - Test: Excel with custom columns (Codigo, NuevoNombre) returns correct mapping when `id_column` and `rename_column` are explicitly passed.
  - Test: Excel with no recognizable columns raises `ValueError` listing available columns.
  - Test: Duplicate ID in the chosen column raises `ValueError` with row number.
  - Test: Empty rename in the chosen column raises `ValueError` with row number.
  - Test: Unmatched files keep original name (covered by conversion handler tests).

**Acceptance criteria:**
- `parse_id_rename_mapping` accepts arbitrary column names and auto-detects when not provided.
- `db_parse_mapping` returns `id_column`, `rename_column`, and `columns` alongside the mapping.
- All existing tests continue to pass.

---

## Task 2: Backend preview and conversion — accept id_column and rename_column

**Files:**
- Modify: `backend/handlers/conversion.py`
- Test: `tests/test_conversion_mapping.py`

- [ ] In `preview(params)`, when `mapping` is provided, read `id_column` and `rename_column` from params and pass them to `parse_id_rename_mapping` if `mapping_path` is provided instead of inline `mapping`. For inline `mapping` dict, behavior stays the same.
- [ ] In `_run_conversion_job`, when `mapping_path` is provided, read `id_column` and `rename_column` from `params` and call `parse_id_rename_mapping(mapping_path, id_column, rename_column)`. Validate the mapping is non-empty and each value is a non-empty string.
- [ ] In `doProcess` (frontend) and `process_start` (backend), accept `id_column` and `rename_column` in the body.
- [ ] Ensure precedence: `mapping` (inline dict) > `mapping_path` + `id_column`/`rename_column` > `key_column` catalog lookup.
- [ ] Tests:
  - Test: `preview` with `mapping_path`, `id_column="Codigo"`, `rename_column="NuevoNombre"` returns correct mapping.
  - Test: `_run_conversion_job` with `mapping_path` and explicit columns renames correctly.
  - Test: `_run_conversion_job` with `mapping_path` and no columns auto-detects.
  - Test: Unmatched files keep original name when mapping mode is active.

**Acceptance criteria:**
- Backend accepts `id_column` and `rename_column` in preview and conversion.
- Re-execution from history works if `mapping_path`, `id_column`, and `rename_column` are saved.

---

## Task 3: Frontend API types — expose id_column and rename_column

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/types.ts`

- [ ] Extend `MappingResult` in `types.ts` to include optional `id_column` and `rename_column`:
  ```ts
  export interface MappingResult {
    mapping: Record<string, string>;
    totalEntries: number;
    matchedFiles: number;
    unmatchedFiles: string[];
    orphanEntries: string[];
    collisions: MappingCollision[];
    id_column?: string;
    rename_column?: string;
    columns?: string[];
  }
  ```
- [ ] Update `PreviewBody` in `api.ts` to include `id_column?`, `rename_column?`, and `mapping_path?`:
  ```ts
  export interface PreviewBody {
    files: string[];
    patron: string;
    secuencia: number;
    use_filename_seq: boolean;
    mapping?: Record<string, string>;
    mapping_path?: string;
    id_column?: string;
    rename_column?: string;
    key_column?: string;
  }
  ```
- [ ] Update `ProcessBody` in `api.ts` to include the same fields.
- [ ] Update `dbParseMapping` signature to accept `id_column?` and `rename_column?` and pass them to `db_parse_mapping`.
- [ ] Add a new API method `dbParseMappingFile(path, id_column, rename_column, files)` that returns `MappingResult`.

**Acceptance criteria:**
- TypeScript compiles without errors.
- `api.dbParseMapping` and `api.preview` accept optional column parameters.

---

## Task 4: Frontend ConversionView — store selected mapping columns

**Files:**
- Modify: `frontend/src/components/conversion/ConversionView.tsx`

- [ ] Add state:
  ```ts
  const [mappingIdColumn, setMappingIdColumn] = useState('');
  const [mappingRenameColumn, setMappingRenameColumn] = useState('');
  ```
- [ ] In `loadMappingExcel`, after parsing, store `id_column` and `rename_column` from the result. If the backend did not return them, infer them from the Excel columns using the same alias logic as the backend (or rely on the backend to always return them).
- [ ] In the preview `useEffect` for mapping mode, pass `id_column` and `rename_column` to `api.preview` if `mapping_path` is used (or if `mappingData` came from a file). For inline `mappingData`, omit them.
- [ ] In `doProcess`, pass `id_column` and `rename_column` when `mappingPath` is set.
- [ ] In the history restore effect, when restoring a mapping run, also restore `id_column` and `rename_column` from `options`.
- [ ] Update `currentConfig`/`handleLoadConfig` if needed to include mapping columns for presets (optional, out of scope if presets are per conversion settings).

**Acceptance criteria:**
- `ConversionView` stores and passes the chosen mapping columns to the backend.
- History restore re-executes with the same columns.

---

## Task 5: Frontend RenameCard — show ID and rename column selectors

**Files:**
- Modify: `frontend/src/components/conversion/RenameCard.tsx`
- Modify: `frontend/src/components/conversion/helpers.ts`
- Test: `frontend/src/components/conversion/RenameCard.mapping.test.tsx` (existing)

- [ ] Add props:
  ```ts
  mappingColumns?: string[];
  mappingIdColumn?: string;
  mappingRenameColumn?: string;
  onMappingIdColumnChange?: (col: string) => void;
  onMappingRenameColumnChange?: (col: string) => void;
  ```
- [ ] In mapping mode, render two dropdowns: "Columna ID" and "Columna nuevo nombre" populated with `mappingColumns`.
- [ ] When `mappingColumns` is provided, auto-detect defaults using the same alias logic as the backend. Store the detected values and call the change handlers so `ConversionView` keeps the selected columns.
- [ ] Add a helper `detectMappingColumns(columns: string[]): { id_column?: string; rename_column?: string }` in `helpers.ts` that matches normalized aliases.
- [ ] Keep the existing mapping summary (matched/unmatched/orphan/collisions) and preview table.
- [ ] If `mappingColumns` has exactly 2 columns, auto-detect and do not require user interaction, but still show the selectors for transparency.
- [ ] Tests:
  - Test: with `mappingColumns = ['ID', 'RENOMBRE']`, selectors default to ID and RENOMBRE.
  - Test: with `mappingColumns = ['Codigo', 'Nombre', 'Categoria']`, selectors default to `Codigo` and `Nombre`.
  - Test: changing the rename column updates the preview table and calls `onMappingRenameColumnChange`.

**Acceptance criteria:**
- `RenameCard` shows selectors for ID and rename columns when mapping mode is active.
- Auto-detection works for common column names in Spanish and English.
- Selected columns are propagated to `ConversionView` and the backend.

---

## Task 6: History support — save and restore mapping columns

**Files:**
- Modify: `frontend/src/components/conversion/ConversionView.tsx`
- Modify: `backend/core/history.py` (if needed)
- Modify: `backend/handlers/history.py` (if needed)

- [ ] In `doProcess`, include `id_column` and `rename_column` in `options_json`:
  ```ts
  options_json: JSON.stringify({
    ...,
    mapping_path: mappingMode ? mappingPath : undefined,
    id_column: mappingMode ? mappingIdColumn : undefined,
    rename_column: mappingMode ? mappingRenameColumn : undefined,
  }),
  ```
- [ ] In the history restore effect, read `options.id_column` and `options.rename_column` and set them before calling `api.dbParseMapping`.
- [ ] Verify that `backend/core/history.py` and `backend/handlers/history.py` store and return `options_json` as-is (they likely do already).

**Acceptance criteria:**
- Re-executing a mapping run from history uses the same ID and rename columns.
- New mapping runs save the columns for future re-execution.

---

## Task 7: Integration and verification

**Files:**
- Run: `npm run typecheck:frontend`
- Run: `npm run lint:python`
- Run: `python -m pytest tests/test_database_mapping.py tests/test_conversion_mapping.py -v`
- Run: `cd frontend && npx vitest run src/components/conversion/RenameCard.mapping.test.tsx`
- Run: `python -m pytest -q` (full regression)

- [ ] All tests pass.
- [ ] TypeScript compiles.
- [ ] Python lint passes.
- [ ] Manual smoke test:
  1. Create an Excel with columns `ID`, `NOMBRE`, `CATEGORIA`, `RENOMBRE` and 3 rows.
  2. Load the mapping in the app.
  3. Verify selectors default to `ID` and `RENOMBRE`.
  4. Change the rename column to `NOMBRE` and verify the preview updates.
  5. Run conversion and verify files are renamed using the chosen column.
  6. Re-execute from history and verify the same columns are used.

---

## Criterios de éxito globales

1. **Flexibilidad de columnas**: el usuario puede cargar un Excel con 2+ columnas y elegir cuál es el ID y cuál el nuevo nombre.
2. **Detección automática**: los selectores tienen valores por defecto sensibles para columnas comunes (`ID`, `RENOMBRE`, `NOMBRE`, `Codigo`, etc.).
3. **Fallback limpio**: archivos sin coincidencia conservan su nombre original.
4. **Historial**: las columnas elegidas se guardan y restauran al reejecutar.
5. **No-regresión**: el flujo actual de 2 columnas ID/RENOMBRE sigue funcionando exactamente igual.
