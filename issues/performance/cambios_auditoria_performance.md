# Cambios — Auditoría de Performance (Antares)

**Fecha:** 2026-06-27
**Scope:** 19 issues de performance (`issues/perf-01` … `perf-19`)
**Reglas rectoras:** *Conservar TODA la funcionalidad (no eliminar funciones)* y *Medir antes de optimizar*.

---

## Resumen ejecutivo

| # | Issue | Severidad | Estado |
|---|---|---|---|
| perf-01 | Build roto: import dinámico de `xlsx` | P1 | ✅ Implementado |
| perf-02 | Formatos: reparseo de template PDF por página | P2 | ✅ Implementado |
| perf-03 | Ubicaciones: fetch de tiles OSM secuencial | P2 | ✅ Implementado |
| perf-04 | Ubicaciones: filas serial en export | P2 | ✅ Implementado |
| perf-05 | Login: video eager + PNG poster | P2 | ✅ Implementado |
| perf-06 | Lock global de SQLite serializa lecturas | P2 | ⚠️ Medido → cerrado sin fix |
| perf-07 | Technical reports: JSON único con rewrite completo | P2 | ⏸️ No implementado (pendiente) |
| perf-08 | Optimizador de imágenes en main thread | P2 | ⚠️ Medido → cerrado sin fix |
| perf-09 | Sellador: re-encodeo del sello por colocación | P2 | ✅ Implementado |
| perf-10 | Listas no virtualizadas | P2 | ✅ Implementado |
| perf-11 | Assets: favicons/logos sin optimizar | P2 | ✅ Implementado |
| perf-12 | Convertir: preview hace doble resize | P2 | ✅ Implementado |
| perf-13 | DB: key-column probing con N queries | P2 | ✅ Implementado |
| perf-14 | History: bulk delete con N commits | P2 | ✅ Implementado |
| perf-15 | LANCZOS sin `reducing_gap` | P2 | ✅ Implementado (medido) |
| perf-16 | IPC: stdout string concat en payloads grandes | P2 | ✅ Implementado |
| perf-17 | Stderr forwarding per-chunk a consola | P3 | ✅ Implementado |
| perf-18 | `html_to_pdf`: BrowserWindow por llamada | P3 | ⏸️ No implementado (medir-primero) |
| perf-19 | `React.memo` escaso | P3 | ⏸️ No implementado (medir-primero) |

**Totales:** 14 implementados · 2 medidos y cerrados sin fix · 3 no implementados.

**Commits:** cada issue implementado tiene commit en la rama (`perf(perf-NN)` / `test(perf-NN)`). Issues agrupados: perf-03/04/15 y simplification-003/006 → `simplification-016`; perf-15 código también en `perf-12`; perf-08/06 harness en un solo archivo de tests. Pendientes: `issues_pendientes_auditoria.md`.

---

## Re-verificación de funcionalidad (ejecutada antes de este documento)

| Verificación | Comando | Resultado |
|---|---|---|
| Typecheck frontend | `npm run typecheck:frontend` (`tsc --noEmit`) | ✅ Pass (0 errores) |
| Tests frontend (completo) | `npx vitest run` | ✅ 62 archivos, **257/257 tests**, 0 fallos |
| Tests backend (perf-related) | `python -m pytest tests/test_performance_audit.py tests/test_ubicaciones_compose.py tests/test_sellador_handler.py tests/test_converter.py tests/test_history_export.py` | ✅ **78/78** (16+25+13+13+11) |
| Harness slow (perf-06, perf-15) | `python -m pytest tests/test_perf_harness.py -m slow -s` | ✅ **2/2** |
| Electron: parser IPC (perf-16) | `node tests/test-electron-ipc-stdout-parser.js` | ✅ Pass |
| Electron: heavy-methods sync (perf-04) | `node tests/test-backend-heavy-methods-sync.js` | ✅ Pass (HEAVY 20 ⊆ LONG_RUNNING 21) |
| Electron: spawner lifecycle (perf-17) | `node tests/test-backend-spawner.js` | ✅ 2/2 (backend llega a `ready`, SIGTERM limpio) |

**Regresión encontrada y fixeada durante la re-verificación:** perf-10 (`RunList` + `DatabasePanel`) usaba `new ResizeObserver(...)` en `useLayoutEffect`, y jsdom no define `ResizeObserver` → 2 tests de `App.test.tsx` fallaban. Fix: guard `if (!el || typeof ResizeObserver === 'undefined') return;` (matchea el patrón existente en `MappingOverlay.tsx` / `MappingPreviewPanel.tsx`). Re-run vitest: 257/257 ✅. Detalle en la sección de perf-10.

**Limitaciones del entorno del agente (no son regresiones):**
- `ruff` no está en el PATH del agente (el del usuario sí); `npm run lint:python` no se pudo ejecutar aquí. Los fixes `ruff I001` ya se aplicaron en la sesión anterior.
- El `python` default del agente (venv hermes) no tiene `openpyxl`; por eso `test-backend-spawner` se corrió con Python 3.12 (que tiene las deps del backend)prependido al PATH. En el entorno del usuario (`npm test`) corre con el python del proyecto sin ajustes.

---

## Implementados (14)

### perf-01 — Build roto: import dinámico de `xlsx` (P1)
**Cambios:**
- 3 archivos migraron el import dinámico de `xlsx` a `@e965/xlsx`: `frontend/src/components/padron/excel.ts`, `frontend/src/components/preview-panel/PreviewPanelView.tsx`, `frontend/src/components/volantes/utils/import.ts`.
- `frontend/vite.config.ts`: `manualChunks` para `@e965/xlsx` (chunk dedicado, fuera del bundle inicial).
- `frontend/package.json`: dependencia actualizada a `@e965/xlsx`.
**Funcionalidad conservada:** lectura/escritura Excel idéntica (mismo motor, fork drop-in de SheetJS).
**Verificación:** tsc ✅, vitest ✅.

### perf-02 — Formatos: reparseo de template PDF por página (P2)
**Cambios:** `backend/core/format_strategies/visual_overlay.py` — el template PDF se parsea **una vez** y se reusa por página, en vez de re-parsearlo en cada página del overlay.
**Verificación:** `test_performance_audit.py` (test perf-02) ✅.

### perf-03 — Ubicaciones: fetch de tiles OSM secuencial (P2)
**Cambios:** `backend/handlers/ubicaciones.py` `_fetch_osm_tiles_map` refactorizado para **fetch paralelo** de tiles (`ThreadPoolExecutor`), en vez de secuencial.
**Verificación:** `test_ubicaciones_compose.py` (tests perf-03) ✅.

### perf-04 — Ubicaciones: filas serial en export (P2)
**Cambios:**
- `backend/handlers/ubicaciones.py` `handle_generar_ubicaciones` paraleliza el procesamiento de filas con `WorkScheduler.submit_heavy`.
- `generar_ubicaciones` agregado a `HEAVY_METHODS`.
**Verificación:** `test_ubicaciones_compose.py` (test perf-04) ✅; `test-backend-heavy-methods-sync.js` ✅ (HEAVY 20 ⊆ LONG_RUNNING 21).

### perf-05 — Login: video eager + PNG poster (P2)
**Cambios:**
- `frontend/src/auth/AntaresScene.tsx`: poster cambia a WebP y `preload` de `auto`/`metadata` alto a `preload="metadata"` (no descarga el video hasta interacción).
- `frontend/public/sign-up-image.png` → convertido a `sign-up-image.webp`; el PNG original se removió con `git rm`.
**Funcionalidad conservada:** mismo video y poster (formato WebP, menor peso).
**Verificación:** vitest (AntaresScene) ✅, tsc ✅.

### perf-09 — Sellador: re-encodeo del sello por colocación (P2)
**Cambios:** `backend/core/sellador.py` — **cache de la imagen del sello** procesada (se procesa una vez y se reusa por cada colocación), en vez de re-encodear por placement.
**Verificación:** `test_sellador_handler.py` ✅, `test_performance_audit.py` (test perf-09) ✅.

### perf-10 — Listas no virtualizadas (P2)
**Cambios:**
- `frontend/src/components/history/RunList.tsx` y `frontend/src/components/technical-reports/DatabasePanel.tsx` reescritos con `react-window` v2 `List` (`ITEM_HEIGHT` 88 y 76).
- `containerRef` + `ResizeObserver` miden dimensiones del contenedor; **fallback graceful** a lista plana si no hay dimensiones medidas o `ResizeObserver` no está definido (jsdom).
- Contenido del item extraído a componente memoizado (`RunRowContent` / `ReportRow`), compartido entre el path virtualizado y el fallback.
**Regresión fixeada en esta re-verificación:** `new ResizeObserver` en `useLayoutEffect` rompía jsdom (2 tests de `App.test.tsx` fallaban). Fix: guard `typeof ResizeObserver === 'undefined'` antes de instanciarlo, alineado al patrón de `MappingOverlay.tsx` / `MappingPreviewPanel.tsx`.
**Verificación:** vitest 257/257 ✅ (incluye `App.test.tsx` que monta `DatabasePanel`).

### perf-11 — Assets: favicons/logos sin optimizar (P2)
**Cambios:**
- 4 brand marks re-exportados a tamaños retina-safe **preservando los nombres** (0 edits en `BrandMark.tsx`): `favicon1.png`/`favicon2.png` 2000×2000 → 96×96; `logo1.png`/`logo2.png` 1749×400 → 525×120.
- 8 favicons boilerplate no referenciados borrados de `frontend/public/` (`favicon-16/48/57/72/120/144/192/228.png`).
- Ahorro: brand 325 KB → 52 KB (**84 %**), **~317 KB menos** en el installer.
**Verificación:** `BrandMark.test.tsx` ✅; assets referenciados por `index.html`/`BrandMark.tsx` confirmados presentes.

### perf-12 — Convertir: preview hace doble resize (P2)
**Cambios:** `backend/core/converter.py` — optimizado el resize de preview (se elimina el doble resize innecesario).
**Verificación:** `test_converter.py` (test perf-12) ✅.

### perf-13 — DB: key-column probing con N queries (P2)
**Cambios:**
- `backend/core/database.py`: nueva función `contar_matches_por_columna` (una query con `IN` que respeta el límite de 999 parámetros de SQLite).
- `backend/handlers/conversion.py`: las funciones de detección de columnas llave usan `contar_matches_por_columna` (reduce N queries — una por columna — a 1).
**Verificación:** `test_performance_audit.py` (tests perf-13) ✅.

### perf-14 — History: bulk delete con N commits (P2)
**Cambios:**
- `backend/core/history.py`: nueva `delete_runs` (borrado bulk en una sola transacción).
- `backend/handlers/history.py`: el borrado masivo usa `delete_runs` en vez de un commit por run.
**Verificación:** `test_history_export.py` ✅, `test_performance_audit.py` (test perf-14) ✅.

### perf-15 — LANCZOS sin `reducing_gap` (P2) — implementado con medición
**Cambios:** `backend/core/converter.py` (2 llamadas) y `backend/handlers/ubicaciones.py` (resize del mapa) → `Image.resize(..., Image.Resampling.LANCZOS, reducing_gap=2.0)`.
**Medición (harness `test_perf_harness.py`, slow):** downscale 6000×4000 → 400×267.
- Baseline LANCZOS: **269.0 ms** · LANCZOS + `reducing_gap=2.0`: **80.2 ms** → **gain 70.2 %**.
- PSNR entre salidas: **53.6 dB** (≥ 30 dB → calidad equivalente).
- Regla de decisión del issue (gain > 5 % **AND** PSNR ≥ 30 dB): **superada** → se aplica.
**Verificación:** `test_perf_harness.py::test_perf15_...` ✅.

### perf-16 — IPC: stdout string concat en payloads grandes (P2)
**Cambios:** la lógica de parseo de líneas se extrajo de `electron/ipc-router.js` a `electron/ipc-stdout-parser.js` — módulo puro JS sin dependencia de Electron (testeable unitariamente), con reassembly multibyte y split de chunks grandes.
**Verificación:** `test-electron-ipc-stdout-parser.js` ✅.

### perf-17 — Stderr forwarding per-chunk a consola (P3)
**Cambios:** `electron/backend-spawner.js` `_recordStderr` gatea `process.stderr.write(text)` tras `if (_isDev)` — en build empaquetado no hay CLI mirando stderr, así que el write per-chunk es overhead puro. El **buffer rolling de 30 líneas se mantiene siempre** (para `getStderrTail()` / reportes de error). Comentario `ponytail:` documenta el ceiling (prod stderr se droppea de la consola) y el upgrade path (loguear a archivo si hace falta).
**Verificación:** `test-backend-spawner.js` ✅ (con Python 3.12 en PATH: backend llega a `ready` y se limpia con SIGTERM); code-review del gating (path dev ejercitado, path prod trivial y correcto).

---

## Medidos y cerrados sin fix (2)

### perf-06 — Lock global de SQLite serializa lecturas (P2) — premisa desautorizada
**Medición (harness `test_perf_harness.py`, slow):** 8 lectores paralelos (`obtener_todos()`) sobre 20 000 filas, page cache caliente.
- `locked_wall` (RLock real, comportamiento actual): **282.9 ms**.
- `unlocked_wall` (no-op lock, lecturas concurrentes sin lock de app): **2273.7 ms**.
- **Speedup = 0.12×** — remover el lock es **~8× más lento** (el GIL + la contención interna de SQLite sobre la conexión WAL compartida penalizan fuerte).
- Regla de decisión del issue: implementar RWLock solo si `speedup >> 1`; **skip si ~1**.
**Razón de no implementar:** "Medir antes de optimizar". La métrica desautorizó la premisa: el `RLock` global **no** es el bottleneck; un RWLock empeoraría el rendimiento. Cerrado sin fix. Re-abrir solo si una carga real (no sintética) muestra serialización dominante.

### perf-08 — Optimizador de imágenes en main thread (P2) — premisa desautorizada
**Medición (Chromium real, mismo motor que el renderer de Electron, vía `browser_cdp`):** batch sintético de 6 imágenes de 8 MP (3264×2448) con ruido, replicando el loop iterativo de `compressImage` (8 calidades JPEG decrecientes).
- `drawImage` sync: **0.7 ms** avg (GPU-accelerated, despreciable).
- `toBlob` yield rate del event loop: **48/48 = 100 %** — el sentinel `setTimeout(0)` disparó antes de cada callback → el encoder JPEG corre off-thread y cede el event loop.
- Long tasks (>50 ms): 14, max 63 ms, ~127 ms/imagen de *hiccups* de <65 ms (overhead de handoff canvas/encoder; en la app real la imagen viene de un `File` decodificado off-thread, no se genera ruido sintético).
**Razón de no implementar:** los 8 re-encodes iterativos **no** bloquean el main thread; el bulk del trabajo ya corre off-thread. Una migración a Web Worker + `OffscreenCanvas` (nuevo archivo + protocolo de mensajes + fallback para jsdom + rework de tests) no se justifica para suprimir hiccups de <65 ms. Cerrado sin fix. Re-abrir solo si una traza real sobre 20×8 MP muestra long tasks sostenidos >100 ms o freeze perceptible.

---

## No implementados (3)

### perf-07 — Technical reports: JSON único con rewrite completo (P2) — pendiente
**Razón:** es la **única tarea implementable pendiente**. Es una migración de storage mayor (JSON único → SQLite reutilizando `repository.py`, con migración one-shot al arrancar y cambio detrás de la API pública del handler). Fue deprioritizada frente a los fixes core del cluster y queda pendiente de decisión. No se hizo especulativamente porque el propio issue propone medir (N=1000, tiempo de `list` y `update` antes/después) y la migración es más grande que los fixes core. Existe una opción B intermedia (caché en memoria de la lista normalizada, menor diff) si se quiere una ganancia rápida de `list` sin migrar el storage.

### perf-18 — `html_to_pdf`: BrowserWindow + partition por llamada (P3) — medir-primero
**Razón:** el issue es **P3** y explícitamente "medir primero". `html_to_pdf` se llama **1 vez por acción de export** (no en loop per-item); el costo de arranque de ventana es one-time (~100–300 ms), aceptable para el uso actual. El fix (reusar ventana oculta / pool de 2–3 partitions) sólo se aplica si la métrica muestra que el startup de ventana es >15 % del total de `renderHtmlToPdf`. Requiere perfilar el flujo de export en la app real (Electron), no factible desde el entorno del agente. Cambios especulativos prohibidos por "Medir antes de optimizar". Diferido.

### perf-19 — `React.memo` escaso (P3) — medir-primero
**Razón:** el issue es una **hipótesis** (no bottleneck confirmado) y explícitamente "no memoizar especulativamente". Requiere React DevTools Profiler en la app real para identificar componentes que re-renderizan sin cambio de salida y consumen tiempo de render no trivial, y solo entonces estabilizar props / `React.memo` selectivo. No factible desde el entorno del agente. Diferido.

---

## Notas de cumplimiento de reglas

- **Conservar funcionalidad:** ningún issue eliminó funciones públicas. perf-15 cambió un parámetro de resize (misma salida, PSNR 53.6 dB). perf-07 (no implementado) preservaría la API del handler. perf-10/11 preservaron UI/estados (fallback graceful a lista plana; mismos nombres de asset).
- **Medir antes de optimizar:** perf-06 y perf-08 se cerraron sin fix porque la medición desautorizó la premisa. perf-15 se aplicó porque la medición superó la regla de decisión (gain 70.2 %, PSNR 53.6 dB). perf-18/perf-19 no se tocaron por ser medir-primero y no poder perfilar desde el entorno del agente.
- **Ponytail / lazy senior:** perf-17 documenta el ceiling con `ponytail:`. perf-11 eligió re-exportar PNGs preservando nombres (0 edits de código) sobre convertir a WebP + cambiar referencias. perf-10 diseñó fallback graceful en vez de polyfill global de `ResizeObserver` en la infra de tests.
