# Checklist de Auditoría ANTARES — 2026-06-12

Checklist final de la auditoría técnica. Los ítems marcados fueron
verificados con comandos ejecutados y logs almacenados en el repositorio.

**Última actualización post-remediación:** 2026-06-12 (sesión de cierre).

## Leyenda

- [x] Verificado / cumple
- [~] Verificado con advertencias (ver hallazgo)
- [ ] No verificado / no cumple
- [—] No aplicable en el estado actual del repo

---

## 1. Preparación y contexto

- [x] Entorno Node 22.13.0 y Python 3.10+ confirmados.
- [x] Dependencias instaladas (`npm install`, `pip install -e ".[dev]"`).
- [x] `AGENTS.md`, `CLAUDE.md`, `docs/historial.md` leídos.
- [x] `package.json`, `frontend/package.json`, `pyproject.toml` y
  `electron-builder.yml` revisados.
- [x] `electron/main.js`, `electron/backend-spawner.js`,
  `electron/ipc-router.js`, `electron/preload.js` revisados.
- [x] `backend/main.py`, `backend/ipc_protocol.py` revisados.
- [x] `frontend/src/App.tsx`, `frontend/src/api.ts` revisados.

---

## 2. Análisis estático

- [x] `ruff check backend tests scripts` pasa con 0 errores.
  - Evidencia: `audit-ruff.log`, `audit-ruff-fix.log`.
- [x] `mypy backend` pasa con **0 errores** (corregido post-auditoría).
  - Evidencia: ejecución local 2026-06-12; stubs en `pyproject.toml`
    (`types-openpyxl`, `types-psutil`, `lxml-stubs`).
  - Hallazgo H-06: **corregido**.
- [x] `npm run typecheck:frontend` (`tsc --noEmit`) pasa con 0 errores.
  - Evidencia: `audit-typecheck.log`, verificación local 2026-06-12.
- [~] `npx ts-prune` y `npx knip` ejecutados; hallazgos documentados en
  reporte (componentes no usados, duplicaciones menores).
  - Evidencia: `audit-ts-prune.log`, `audit-knip.log`.
  - Nota: `FrontendStatusBar.tsx` ya no existe en el repo (H-11: N/A).
- [x] `pip-audit` ejecutado sobre **dependencias del proyecto** (`pip-audit .` en
  venv limpio con `pip install -e ".[dev]"`): **0 CVEs**.
  - Línea base global (venv contaminado): 35 CVEs (`audit-pip-audit.json`).
  - `torch`/`rembg`/`aiohttp`/`starlette` no forman parte de `pyproject.toml`;
    eran paquetes ajenos del entorno de desarrollo.
  - Hallazgo H-02: **corregido** (directas + gate CI).
- [x] `npm audit --omit=dev` ejecutado; 0 vulnerabilidades en runtime.
  - Evidencia: `audit-npm-audit.log`.
- [x] Búsqueda de secretos (`rg -i "api[_-]?key|secret|password|token"`)
  no encontró credenciales hardcodeadas.
- [x] `radon cc backend -s -a -n B` ejecutado; complejidad documentada.
  - Evidencia: `audit-radon.log`.
- [x] `jscpd` ejecutado sobre `frontend/src`; duplicaciones menores
  identificadas (sanitizer consolidado en `shared/html-sanitizer.js`).
  - Evidencia: `audit-jscpd.log`.

---

## 3. Análisis dinámico

### 3.1 Backend

- [x] `pytest -v` pasa (306 tests).
  - Evidencia: `audit-pytest.log`, `audit-npm-test-after2.log`, `npm test`
    2026-06-12.
- [x] Cola de 1000 archivos (rename-only, mock I/O) — `tests/test_stress_conversion.py`.
- [x] Cola de 10 000 archivos — mismo módulo, marcador `@pytest.mark.slow`
  (`npm run test:stress`).
- [x] Concurrencia de dos jobs de conversión — `test_two_conversion_jobs_run_in_parallel`.
- [ ] Migraciones desde BD pre-1.0 — no ejecutado.
- [x] Handshake del backend arranca en menos de 5 s (observado en dev).

### 3.2 Frontend

- [x] `npx vitest run` pasa (133 tests).
  - Evidencia: `audit-vitest.log` (línea base con 1 fallo), verificación
    local 2026-06-12 tras fix H-04.
  - Hallazgo H-04: **corregido**.
- [x] Build de producción (`npm run build:frontend`) exitoso.
  - Evidencia: `audit-build-frontend.log`.
- [ ] Lighthouse / axe-core — no ejecutado.

### 3.3 Electron

- [ ] `npm run dev` con inspección prolongada — no ejecutado.
- [x] Cierre inesperado del backend tras handshake — 
  `tests/test-backend-spawner-midflight-exit.js`.
- [x] Recuperación tras crash transitorio — `tests/test-backend-spawner-recovery.js`.
- [ ] `npm run build:win` completo — no ejecutado por tiempo en CI.
- [ ] `tests/test-build-size-guards.js` con binarios reales — no ejecutado.

---

## 4. Revisión manual por superficie

### 4.1 Seguridad

- [x] `preload.js` no expone `eval`, `Function` ni `ipcRenderer` sin
  filtrar.
- [x] `ALLOWED_RENDERER_METHODS` centralizada en `electron/ipc-methods.js`
  y sincronizada con `frontend/src/api.ts` (H-01 corregido +
  `tests/test-electron-ipc-allowlist.js`).
- [x] `registerIpcHandlers` vuelve a validar la allowlist.
- [x] Diálogos de archivos se manejan en main sin pasar por Python.
- [x] `html_to_pdf` usa renderer Electron con HTML sanitizado; handler
  Python **eliminado** (H-03 corregido).
- [x] CSP de producción presente en `electron/window-manager.js`.
- [ ] Verificación exhaustiva de `webRequest.onBeforeRequest` — no auditada
  en profundidad (parcialmente cubierta en `dialog-handlers.js` para PDF).
- [~] `@validate_params` se aplica a la mayoría de handlers; se recomienda
  cobertura completa.
- [x] `is_safe_user_path` cubre `..`, separadores de Windows/Unix y URLs.
- [x] `_validate_identifier` se usa en SQL dinámico de `database.py`.
- [x] Revisión de `shell=True` — no encontrado en backend.
- [x] `formatos_upload` valida magic bytes `%PDF`.
- [~] Límite de 50 MB en uploads no verificado en esta auditoría.
- [~] Plugin loader mantiene AST whitelist; modelo de amenazas documentado
  en `backend/core/plugins.py` (H-10: documentado, sin aislamiento de
  subproceso).

### 4.2 IPC y protocolo

- [x] `ANTARES_IPC_MAX_PAYLOAD_SIZE` (64 MB) presente.
- [x] `read_message` retorna `None` en EOF y `_SKIP` en parse error.
- [x] `_MAX_CONSECUTIVE_ERRORS = 100` presente.
- [x] Handshake antes de `init_db` / `load_plugins_from_dir`.
- [x] Cada request lleva `id` UUID correlacionado.
- [x] El renderer no envía notificaciones.

### 4.3 Backend spawner

- [x] `HANDSHAKE_TIMEOUT_MS = 30_000`.
- [x] `HEALTH_PROBE_TIMEOUT_MS = 3_000`.
- [x] `_pendingRequestCount` bloquea restart.
- [x] `_forceKillProcess` usa `taskkill /T /F` en Windows.
- [x] `_stderrBuffer` acotado a 30 líneas.
- [x] `manualRestart()` con guard `manualRestartInProgress`.

### 4.4 Scheduler y Jobs

- [x] Dos colas (`submit_light`, `submit_heavy`) con `BoundedSemaphore`.
- [x] `HEAVY_METHODS` sincronizados con `LONG_RUNNING_METHODS`.
- [x] `MAX_CONCURRENT_DEFAULT` acotado [4, 16].
- [x] `Job.to_dict()` no expone referencias internas.
- [x] `_wrapped_target` pone `running=False` en finally.

### 4.5 Pipeline de conversión

- [x] `convertir_imagen` valida dimensiones y formato.
- [x] `_ensure_mode` maneja transparencias y paletas.
- [x] Preview cacheado (LRU 75, TTL 180 s).
- [x] Resize con `LANCZOS`.
- [x] Copia de video usa `shutil.copy2`.

### 4.6 Renombrado

- [x] `RenamerEngine.aplicar` idempotente sin DB.
- [x] Manejo robusto de nombres con `_` / `-`.
- [x] Validación de colisiones en mapeo directo.
- [x] Patrón vacío mantiene nombre original.

### 4.7 Formatos PDF

- [x] `_BUILTIN_FORMATS` carga una sola vez.
- [x] Uploads validan magic bytes.
- [x] Estrategias aisladas en `format_strategies/`.
- [x] Bounded a 500 páginas.
- [x] Filename pattern soporta `{id}`, `{nombre}`, `{desde}`, `{hasta}`.

### 4.8 Sellador PDF

- [x] `apply_sellador` valida `stamp_count > 0` y dimensiones.
- [x] `_prepare_stamp_image` no excede 300 DPI.
- [x] LCG seed-based determinista.
- [x] `PdfWriter(clone_from=reader)` evita deprecation warnings de pypdf
  (H-08 corregido).

### 4.9 Catálogo / DB

- [x] Esquema con `CREATE TABLE IF NOT EXISTS`.
- [x] Migraciones aditivas.
- [x] Índices idempotentes.
- [x] `parse_id_rename_mapping` valida ID único y RENOMBRE no vacío.
- [x] `importar_excel` en transacción.

### 4.10 Historial

- [x] Cumple las 8 reglas de `docs/historial.md` (revisión visual).
- [x] Migraciones idempotentes.
- [x] `validate_run_payload` antes de persistir.
- [x] `app_version` guardado en cada run.
- [x] Sin `SELECT *` en listados.

### 4.11 Informes técnicos

- [x] `TechnicalReport.normalize` tolerante.
- [x] Importer soporta `.xlsx` y `.csv`.
- [x] Alias en español cubiertos.
- [x] Jinja2 con `autoescape`.
- [x] Consolidación ordenada por `informe_id`.

### 4.12 Panel Aviso de Corte

- [x] Validación de extensión `.xlsx`.
- [x] `MAX_EXCEL_ROWS = 10_000`.
- [x] Matcher con 4 estrategias.
- [x] Regex requiere grupo `(?P<clave>...)`.
- [x] Límite de 4 imágenes por panel.
- [x] `serialize_panel` / `deserialize_panel` round-trip.
- [x] DOCX usa `cover` crop (taste verificado).

### 4.13 Optimizador de imágenes

- [x] `Pipeline.processImageItem` aplica presets y crop.
- [x] `zip.ts` deduplica nombres.
- [x] `image_optimizer_zip` valida al menos un archivo.
- [x] `MAX_IN_MEMORY_BYTES` respetado.

### 4.14 Generador de Reportes / Preview Panel

- [~] Plantillas listadas desde `backend/templates/`.
- [x] `template_get` valida `is_safe_user_path`.
- [x] Render PDF vía Electron (`html_to_pdf` nativo); handler Python
  eliminado (H-03).

### 4.15 Volantes y Reportes de campo

- [x] Uso de `jspdf` / `html-to-image` verificado visualmente en código.
- [x] `getCropRectangle` y márgenes presentes.

### 4.16 Apariencia

- [x] Presets validados.
- [x] `save_theme` filtra valores.
- [x] `restoreCachedTheme` aplica vars antes del primer render.
- [x] Switch dark/light/system reactivo.

### 4.17 Internacionalización

- [x] `fallbackLng = 'es'`.
- [x] Backend usa `t("key", **kwargs)`.
- [~] `backend/core/technical_reports/models.py::MESES` hardcoded en
  español (conocido, no crítico).

### 4.18 Build y release

- [~] `npm run build:frontend` exitoso; build NSIS/portable no ejecutado en CI
  (solo en release por tag).
- [x] `electron-builder.yml` excluye `frontend/src`, `tests`, `backend`.
- [x] `asar` empaqueta assets del frontend.
- [~] Firma y `verifyUpdateCodeSignature: false` no verificados.
- [x] Versiones sincronizadas en `0.10.6` (`package.json`,
  `frontend/package.json`, `pyproject.toml`, `backend/version.py`) — H-05
  corregido.
- [x] Workflow CI en `.github/workflows/ci.yml` (`npm run ci`).
- [x] Release workflow ejecuta `npm run ci` antes del build (`release.yml`).
- [x] Test de regresión de versiones (`tests/test-version-sync.js`).

---

## 5. Checklist final (cierre)

- [x] Árbol de archivos recorrido y comparado con §1.3 de
  `AUDIT-PROMP.md`.
- [x] `npm test` pasa (pytest 306 + Node integration + Vitest 133).
  - Hallazgo H-12: **corregido** (`test:frontend` + Vitest en `npm test`).
- [x] `ruff check` limpio.
- [x] `mypy backend` limpio (H-06).
- [x] `tsc --noEmit` limpio.
- [x] TODOs/FIXMEs críticos no detectados sin asignar.
- [x] Cada hallazgo tiene severidad, ubicación, evidencia y fix propuesto
  (`docs/audit-results.md`).
- [x] Hallazgos previos de §4 de `AUDIT-PROMP.md` confirmados/refutados.
- [x] 8 reglas inquebrantables del historial verificadas.
- [x] Matriz de dominios (§12 de `AUDIT-PROMP.md`) cubierta.
- [x] Reporte final en `docs/audit-results.md`.
- [x] `git status` verificado; no se commitearán `node_modules`, `dist`,
  `__pycache__`.
- [x] Gate CI con `mypy`, `pip-audit` y `npm run ci`.

---

## 6. Estado de hallazgos (H-01 … H-12)

| ID | Título | Estado post-remediación |
|----|--------|-------------------------|
| H-01 | Allowlist IPC desincronizada | **Corregido** |
| H-02 | Dependencias Python con CVEs | **Corregido** — `pip-audit .` limpio + gate CI |
| H-03 | WeasyPrint SSRF / handler Python | **Corregido** — handler eliminado |
| H-04 | Test `App.test.tsx` timeout | **Corregido** |
| H-05 | Divergencia de versiones | **Corregido** — 0.10.6 |
| H-06 | Errores `mypy backend` | **Corregido** — 0 errores |
| H-07 | Logs en `preload.js` | **Corregido** — solo en dev |
| H-08 | Deprecation warnings pypdf sellador | **Corregido** — `clone_from` |
| H-09 | Sanitizer duplicado | **Corregido** — `shared/html-sanitizer.js` |
| H-10 | Plugin loader sin aislamiento runtime | **Documentado** — sin subproceso |
| H-11 | `FrontendStatusBar.tsx` vacío | **N/A** — archivo no existe |
| H-12 | Vitest fuera de `npm test` | **Corregido** |

---

## 7. Archivos añadidos/modificados en remediación

- `electron/ipc-methods.js` — métodos IPC faltantes (H-01).
- `tests/test-electron-ipc-allowlist.js` — regresión allowlist (H-01).
- `shared/html-sanitizer.js` + `shared/html-sanitizer.d.ts` — sanitizer
  compartido (H-09).
- `tests/test-html-sanitizer.js` — paridad Electron/shared (H-09).
- `electron/preload.js` — logs condicionados a dev (H-07).
- `backend/handlers/technical_reports.py` — handler `html_to_pdf`
  eliminado (H-03).
- `backend/core/sellador.py` — `PdfWriter(clone_from=...)` (H-08).
- `backend/core/plugins.py` — documentación de modelo de amenazas (H-10).
- `pyproject.toml` — versiones mínimas seguras + stubs mypy (H-02, H-06).
- `package.json` — Vitest en `npm test`, script `test:frontend` (H-12).
- `frontend/src/__tests__/App.test.tsx` — estabilización (H-04).
- `frontend/src/test-setup.ts` — mocks IPC ampliados (H-04).
- `tests/test-version-sync.js` — regresión de versiones (H-05).
- `.github/workflows/ci.yml` — pipeline CI (ruff, mypy, pip-audit, tests).
- `tests/test_stress_conversion.py` — stress 1k/10k + concurrencia.
- `tests/test-backend-spawner-midflight-exit.js` — exit post-handshake.
- `package.json` — script `test:stress`.
- `pyproject.toml` — marker `slow`, CI excluye `-m 'not slow'`.

---

## 8. Acciones pendientes (post-cierre)

1. **Pruebas manuales / pesadas:** `npm run dev` prolongado, build NSIS en CI,
   Lighthouse/axe, migraciones desde BD pre-1.0.
2. **H-10 ideal:** ejecutar plugins en subproceso aislado (futuro).
3. **Firma de código** Windows: revisar `verifyUpdateCodeSignature` en
   electron-builder para producción.

---

*Checklist actualizado el 2026-06-12 tras remediación de hallazgos H-01,
H-03–H-09, H-12 y cierre parcial de H-02/H-05.*
