# Repository Guidelines

ANTARES is a desktop image converter and renamer. This document explains how to work on it efficiently.

## Project Structure & Module Organization

- `backend/` — Python service (IPC + image processing): `main.py`, `ipc_protocol.py`, `bootstrap.py`, with `core/`, `handlers/`, `utils/`, `locales/`, `templates/`.
- `frontend/` — React + TypeScript + Vite + TailwindCSS UI in `frontend/src/` (`components/`, `hooks/`, `locales/`, `utils/`, `api.ts`, `App.tsx`).
- `electron/` — Electron main process: `main.js`, `ipc-router.js`, `backend-spawner.js`, `dialog-handlers.js`, `preload.js`, `window-manager.js`, `auto-updater.js`.
- `tests/` — Python suites (`test_*.py`, run via `pytest`) plus Node integration scripts (`test-*.js`).
- `scripts/` — Build/clean/version helpers and `generate_brand_assets.py`.
- `docs/`, `assets/`, `data/`, `formatos/`, `scratch/` — reference data and generated assets.

## Build, Test, and Development Commands

Run from repo root (Node 18+, Python 3.10+ required).

- `npm run dev` — Vite dev server on `:5173` + Electron main process.
- `npm run build:frontend` / `npm run build:backend` — Bundle the renderer and PyInstaller-pack the Python backend.
- `npm run build:win` (or `build:mac` / `build:linux` / `build:all`) — Full installer build via `electron-builder`.
- `npm test` — Runs `pytest` and every Node integration test in `tests/`.
- `npm run lint:python` / `npm run lint:fix` — Ruff checks.
- `npm run typecheck:frontend` — `tsc --noEmit`.
- `npm run bump:patch|minor|major` — Version bump (triggers release workflow on push).

## Coding Style & Naming Conventions

- Python: 4-space indent, Ruff (`E,F,W,I,UP,B,SIM,RUF`), line-length 120, type hints on new code. Mypy in lenient mode. `snake_case` modules/functions, `PascalCase` classes.
- TypeScript/React: 2-space indent, strict TS, function components with PascalCase files (`ConversionView.tsx`), `use*` hooks in `frontend/src/hooks/`.
- TailwindCSS utility classes; avoid ad-hoc global CSS.
- Commits use Conventional Commits: `feat:`, `feat(scope):`, `fix:`, `refactor:`, `perf:`, `chore:`. Releases: `release: vX.Y.Z`.

## Testing Guidelines

- Python tests in `tests/test_*.py` (config in `pyproject.toml`, testpaths = `tests`).
- Node integration tests (`tests/test-*.js`) are executed by `npm test` after pytest.
- Frontend unit tests use Vitest + Testing Library (`frontend/src/__tests__/`).
- Add or update tests for every behavior change; cover IPC contract changes in both Python and TS layers.

## Commit & Pull Request Guidelines

- One logical change per commit; reference issues in the body when relevant.
- PRs target `main`. Include: purpose summary, linked issue, test evidence (`npm test` output), and screenshots for UI changes.
- Ensure `npm run lint:python`, `npm run typecheck:frontend`, and `npm test` pass locally before requesting review.
- Never commit secrets, `.env`, or build artifacts (`dist/`, `release/`, `__pycache__/`).
