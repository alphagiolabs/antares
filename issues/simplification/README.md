# Issues de Simplificación y Saneamiento Estructural — Antares

**Fecha:** 2026-06-27
**Versión auditada:** `0.10.13` (frontend `0.10.13`)
**Branch:** `fix/test-timeout-file-parallelism`
**Metodología:** Doubt-Driven Development + Code Review (5 ejes) + Simplification + Frontend Engineering + Security + Performance + Deprecation + Observability
**Skills invocados:** `code-review`, `simplification`, `security`, `performance`, `frontend`, `deprecation`, `observability`, `doubt-driven`.

## Restricción fundamental (verificada por issue)

TODO cambio propuesto mantiene la funcionalidad existente al 100%. Específicamente:

- No se rompe el contrato IPC JSON-RPC (stdin/stdout).
- No se altera el schema de la base de datos SQLite.
- No se elimina endpoint/ruta sin verificar zero consumers ACTIVOS (runtime + tests).
- No se renombra export/import público sin alias backward-compat.
- No se cambia el formato de salida de archivos (PDF, Excel, imágenes, mapeos).
- **Cualquier cambio en tipos/comportamiento se verifica con los tests existentes SIN MODIFICARLOS.**

Cada issue incluye verificación de consumers (runtime + tests) y la lista exacta de comandos a correr.

## Convención de nombres

`simplification-NNN-<topic>-<short-slug>.md`

- `NNN`: número secuencial, asignado por severidad de complejidad (no criticidad).
- `<topic>`: skill dominante (`simplification`, `deprecation`, `frontend`, `security`, `performance`, `observability`, `doubt`).
- `<slug>`: descripción corta.

## Cómo se verificó la "no regresión funcional"

Por cada issue se ejecutó en paralelo:

1. Búsqueda exhaustiva de consumers runtime: `grep -r "<símbolo>" backend frontend electron tests scripts` con variantes (`from X import`, `X.`, parches de monkeypatch).
2. Búsqueda de consumers en tests: revisión manual de `tests/test_*.py` y `frontend/src/**/*.test.tsx` buscando imports, assertions, y `monkeypatch.setattr` sobre los símbolos afectados.
3. Comparación de contracts: leer la firma de funciones afectadas, shape de dicts IPC, y nombres de clases/notificaciones IPC para detectar cambios de behavior.

Issues marcados como **DESCARTADO** se descartaron porque rompían tests existentes sin modificación o introducían cambios de comportamiento. Se listan al final del índice por transparencia.

## Índice

### A — Quick Wins (1-5 líneas, riesgo bajo, sin tocar tests)

| # | Archivo | Riesgo |
|---|---------|--------|
| 01 | `simplification-001-simplification-dead-notify-complete-alias.md` | ninguno |
| 02 | `simplification-002-simplification-conversion-local-duplicate-imports.md` | ninguno |
| 03 | `simplification-003-simplification-ubicaciones-race-cache-key.md` | ninguno |
| 04 | `simplification-004-observability-consecutive-errors-dataclass.md` | ninguno |
| 05 | `simplification-005-simplification-repository-unreachable-helpers.md` | ninguno |
| 06 | `simplification-006-simplification-ubicaciones-asset-caches-lru_cache.md` | bajo |
| 07 | `simplification-007-deprecation-formatos-catalog-not-read.md` | bajo |
| 08 | `simplification-008-frontend-css-login-decor-extract.md` | bajo |
| 09 | `simplification-009-frontend-date-picker-css-doc-fragility.md` | bajo |
| 10 | `simplification-010-simplification-long-running-methods-triplet-sync-test.md` | ninguno |
| 11 | `simplification-011-deprecation-templates-html-spaces-legacy.md` | bajo |
| 12 | `simplification-012-simplification-spawner-clean-scripts-merge.md` | ninguno |
| 13 | `simplification-013-simplification-system-sensitive-paths-denylist-unify.md` | bajo |
| 14 | `simplification-014-simplification-hardware-limit-detectors-unify.md` | bajo |

### B — Simplificaciones Medias (10-50 líneas, refactor)

| # | Archivo | Riesgo |
|---|---------|--------|
| 15 | `simplification-015-simplification-loop-scripts-helpers-extract.md` | medio |
| 16 | `simplification-016-simplification-ubicaciones-module-split-package.md` | medio |
| 17 | `simplification-017-simplification-conversion-run-job-extract.md` | medio |
| 18 | `simplification-018-deprecation-history-run-type-constants-replace.md` | medio |
| 19 | `simplification-019-simplification-process-state-legacy-singleton-phaseout.md` | alto |
| 20 | `simplification-020-frontend-job-progress-migration-full.md` | medio |
| 21 | `simplification-021-deprecation-ubicaciones-composed-cache-mtime-key.md` | medio |
| 22 | `simplification-022-simplification-conversion-key-column-triplet-consolidate.md` | alto (preserve signature) |

### C — Refactors Estructurales (reescritura parcial de módulos)

| # | Archivo | Riesgo |
|---|---------|--------|
| 23 | `simplification-023-simplification-formatos-triple-source-of-truth-builtin.md` | alto |
| 24 | `simplification-024-deprecation-backend-plugins-usage-question.md` | alto (decisión) |
| 25 | `simplification-025-deprecation-format-strategy-legacy-xobject-question.md` | alto (decisión) |
| 26 | `simplification-026-deprecation-jobs-dual-modern-legacy-layer.md` | alto |

### Z — Descartados (rompen tests sin modificación o cambio de behavior)

| # | Razón de descarte |
|---|------------------|
| Z1 | Eliminar clase `Handlers` legacy: rompe `tests/test_handlers.py` que usa `Handlers.process_start`, `handlers._state.logs[0]` y `handlers._reset_state()` (3 símbolos, no 1). |
| Z2 | Eliminar aliases `_state`/`_reset_state` de `handlers/__init__.py`: `tests/test_race_condition.py:6` y `test_handlers.py` los importan y asertan. |
| Z3 | Eliminar constantes `RUN_TYPE_*` de `history.py`: es el `default` del parámetro `save_run` y test_run_types las importa vía `ALL_RUN_TYPES` (re-exportada con # noqa: F401 a propósito). |
| Z4 | Eliminar `_notify_complete = ...` alias en `conversion.py`: 3 archivos de test (`test_rename_audit.py`, `test_conversion_record_sequence.py`, `test_conversion_mapping.py`) hacen `monkeypatch.setattr(conversion, "_notify_complete", ...)` sobre este alias. |
| Z5 | Reemplazar `time.sleep(0.5)` fijo por backoff exponencial: cambio de comportamiento observable (timing recovery 10x). No es refactor, es cambio de UX. |
| Z6 | Mover bloque CSS `.lg-*` fuera de `index.css` apuntando a `LoginScreen.tsx`: las clases se consumen en `auth/loginDecor.tsx` (no en `LoginScreen.tsx`; el decorativo es un componente separado). Propuesta imprecisa. |
| Z7 | Mover bloque CSS `.app-date-picker-*` a CSS module: rompe la cascada porque `components/padron/vpad-styles.css` declara overrides `.vpad-field .app-date-picker-trigger` que dependen del orden de cascada global. |
| Z8 | Eliminar `_detect_best_key_column`: NO es zombie, se usa en `conversion.preview` cuando `key_column` vacío. Reemplazo por `_resolve_key_column` plausible pero cambiaría el algoritmo de auto-detección (rama else del if-chain). |

Los issues Z1-Z4 son descartados por la restricción "tests sin modificar". Z5-Z8 son descartados como propuestas, pero Z6/Z7/Z8 reaparecen reformulados en 08, 09 y 22 respectivamente, con la restricción explícita preservada.

## Verificación global

Después de aplicar TODOS los issues aceptados, correr:

```bash
# Formato
ruff check backend tests scripts
# Types
npm run typecheck:backend
npm run typecheck:frontend
# Tests (todos sin modificación)
npm test
```

`npm test` corre la cadena completa: `node tests/test-version-sync.js && node tests/test-push-loop.js && node tests/test-pr-fix-loop.js && cd backend && python -m pytest ../tests -v && node ../tests/test-electron-*.js && ... && cd ../frontend && npx vitest run`. Si algo de eso falla SIN haber modificado los tests, el refactor introdujo regresión.
