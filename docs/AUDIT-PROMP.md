# Auditoría Integral de ANTARES — Prompt Maestro

> **Documento vivo** para guiar una auditoría técnica exhaustiva, end-to-end y
> reproducible del proyecto **ANTARES** (Conversor y renombrador profesional de
> imágenes — aplicación de escritorio Electron + Python + React).
>
> Audiencia: ingenieros, agentes IA, equipos de QA o de seguridad que
> necesiten una hoja de ruta detallada para evaluar calidad, seguridad,
> mantenibilidad, operabilidad y cumplimiento del proyecto.
>
> Filosofía: **"leer antes de opinar, ejecutar antes de afirmar"**. Ningún
> hallazgo se reporta sin un artefacto reproducible (test, log, captura,
> comando) o un anclaje exacto a código (archivo + línea).

---

## 0. Cómo usar este documento

1. **Lee el bloque "0. Contexto del proyecto"** completo antes de auditar
   nada. Te ahorra horas de arqueología.
2. **Recorre las fases en orden (1 → 11)**, o paralelízalas con varios
   revisores siguiendo los dominios de la **sección 12 (Matriz de
   dominios)**.
3. Para cada hallazgo, usa la **plantilla "Reporte de hallazgo"** de la
   sección 13. Sin ese formato, el hallazgo se descarta.
4. Antes de cerrar la auditoría, ejecuta la **Checklist final (sección
   14)** y archiva la **salida estructurada (sección 15)**.

---

## 1. Contexto del proyecto

### 1.1 Identidad

- **Nombre:** ANTARES (anteriormente HidroConvert).
- **Versión actual:** `0.10.4` (frontend `0.10.6` — ver divergencia en
  §4.1).
- **appId electron-builder:** `com.antares.app`.
- **Tipo de producto:** aplicación de escritorio nativa para Windows
  (también macOS/Linux soportados en build, foco en Windows).
- **Casos de uso:** conversión de imágenes en lote, renombrado por patrón,
  catálogo Excel, sellado de PDFs, generación de formatos PDF, informes
  técnicos, paneles de aviso de corte, volantes, reportes de campo,
  optimizador de imágenes, padrón, generador de reportes por plantilla.
- **Usuarios:** equipos de operaciones de empresas de servicios (agua,
  electricidad) en Perú (SEDAPAL aparece como cliente modelo).

### 1.2 Stack tecnológico

| Capa | Tecnología | Versión objetivo | Notas |
|------|------------|------------------|-------|
| Shell de escritorio | **Electron** | `^33.0.0` | Proceso main + preload + sandbox de renderer |
| UI | **React + TypeScript** | React `^18.2`, TS `^5.2` | Vite como bundler, TailwindCSS para estilos |
| Bundler | **Vite** | `^5.0.8` | Build con Terser, code-splitting manual |
| Lenguaje backend | **Python** | `>=3.10` | IPC con Electron mediante stdio JSON-RPC |
| Packaging backend | **PyInstaller** | `>=6.x` | `AntaresBackend.exe` (frozen onefile) |
| Base de datos local | **SQLite** (WAL) | embebido | Pool singleton, modo WAL, `cache_size=-16000` |
| Estilos | **TailwindCSS v3** | `^3.4.0` | Variables CSS custom, no MUI completo |
| Auto-actualización | **electron-updater** | `^6.8.3` | GitHub Releases |
| Plantillas HTML→PDF | **Jinja2 + WeasyPrint** | Jinja2 `>=3.1`, WeasyPrint `>=60.0` | Capa Python |
| Manipulación PDF | **pypdf + PyMuPDF** | pypdf `>=5.0.0`, pymupdf `>=1.24.0` | Renderizado y estampado |
| Excel I/O | **pandas + openpyxl** | pandas `>=2.0.0`, openpyxl `>=3.1.0` | Importar / exportar / plantillas |
| Generación ZIP en cliente | **fflate / custom** | n/a | En `image-optimizer/zip.ts` |
| Visor PDF cliente | **pdfjs-dist** | `^4.10.38` | Sellador y FormatosView |
| Generación PDF cliente | **jsPDF** | `^4.2.1` | Path nativo Electron (Chromium printToPDF) |
| Animación | **framer-motion** | `^12.38.0` | Drawers, command palette, transiciones |
| Iconos | **lucide-react** | `^1.14.0` | Set unificado |
| Internacionalización | **i18next + react-i18next** | `^26.0.8` | es/en |

### 1.3 Estructura física (mapa completo)

```
antares/
├── AGENTS.md                       # Convenciones (autoridad)
├── CLAUDE.md                       # Convenciones para Claude Code
├── README.md                       # Onboarding público
├── SKILL.md                        # Code review skills (codex)
├── package.json                    # Root: scripts, electron-builder wiring
├── package-lock.json
├── pyproject.toml                  # Backend Python + ruff + pytest
├── requirements.txt                # Backward-compat (remite a pyproject)
├── opencode.json                   # Config de tooling
├── electron-builder.yml            # Configuración de empaquetado
├── electron/                       # Proceso main de Electron
│   ├── main.js                     # entrypoint
│   ├── preload.js                  # contextBridge → window.electronAPI
│   ├── window-manager.js           # creación y ciclo de vida de la BrowserWindow
│   ├── ipc-router.js               # dispatch ipcMain.handle + correlación JSON-RPC
│   ├── ipc-methods.js              # allowlist de métodos (BACKEND/NATIVE/LONG)
│   ├── backend-spawner.js          # ciclo de vida del subproceso Python
│   ├── backend-command.js          # resolución de ejecutable Python (dev/prod)
│   ├── dialog-handlers.js          # dialogs nativos + renderHtmlToPdf
│   ├── auto-updater.js             # electron-updater wiring
│   └── ipc-methods.js
├── backend/                        # Servicio Python (entrypoint: main.py)
│   ├── main.py                     # loop JSON-RPC sobre stdio
│   ├── bootstrap.py                # ajuste de sys.path (frozen / source)
│   ├── ipc_protocol.py             # JSON-RPC read/write + parse + validación
│   ├── version.py                  # __version__ centralizado
│   ├── backend.spec                # spec de PyInstaller
│   ├── core/
│   │   ├── converter.py            # Pillow (PIL): convertir / preview
│   │   ├── renamer.py              # RenamerEngine (patrones + colisiones)
│   │   ├── database.py             # SQLite import/export + ID→RENOMBRE
│   │   ├── format_registry.py      # registro extensible de formatos de imagen
│   │   ├── format_strategies/      # legacy_xobject / visual_overlay / simple_overlay
│   │   ├── formatos.py             # generación PDF con correlativo
│   │   ├── config_fields.py        # esquema dinámico de campos
│   │   ├── config_patterns.py      # patrones de renombrado
│   │   ├── config_theme.py         # presets de tema (23) + 17 keys
│   │   ├── scheduler.py            # WorkScheduler (light + heavy)
│   │   ├── jobs.py                 # JobManager concurrente
│   │   ├── state.py                # ProcessState (dataclass)
│   │   ├── repository.py           # pool de conexión SQLite
│   │   ├── migrations.py           # MigrationManager (forward-only, idempotente)
│   │   ├── history.py              # persistencia del historial + migraciones
│   │   ├── run_types.py            # RunType registry (JSON-Schema validado)
│   │   ├── mapping_index.py        # O(1) lookup + detección de colisiones
│   │   ├── preview_cache.py        # LRU+TTL para previews
│   │   ├── plugins.py              # cargador de plugins con AST sandbox
│   │   ├── sellador.py             # estampado PDF no uniforme
│   │   ├── sellador_io.py          # resuelve pdf/stamp desde disco o base64
│   │   ├── sellador_preview.py     # render PyMuPDF → PNG
│   │   ├── panel_aviso_corte/      # paquete: errores, modelos, importer,
│   │   │   │                          matcher, rendering (PDF + DOCX),
│   │   │   │                          serialization
│   │   └── technical_reports/      # paquete: models, database, importer,
│   │                                  rendering, diameter_totals
│   ├── handlers/                   # feature-scoped IPC handlers
│   │   ├── __init__.py             # registro agregado HANDLERS
│   │   ├── common.py               # @with_locale, @validate_params
│   │   ├── conversion.py           # preview, start, status, cancel
│   │   ├── database.py             # db_records, db_import, db_export, etc.
│   │   ├── formatos.py             # formatos_list, _generate, _upload, …
│   │   ├── sellador.py             # sellador_apply, _inspect_pdf, _render_page
│   │   ├── optimizer.py            # image_optimizer_zip
│   │   ├── history.py              # list, get, save, delete, export, schema
│   │   ├── jobs.py                 # jobs_list, jobs_get, jobs_cancel, cleanup
│   │   ├── theme.py                # theme_get, save, presets, reset
│   │   ├── templates.py            # templates_list, template_get
│   │   ├── technical_reports.py    # list/get/create/update/import/render
│   │   ├── panel_aviso_corte.py    # parse_excel, compute_match, render_pdf
│   │   └── info.py                 # version, formats, plugin_formats
│   ├── utils/
│   │   ├── validators.py           # sanitización de paths y nombres
│   │   ├── paths.py                # resource_path / user_data_path
│   │   └── i18n.py                 # traducción en backend (es/en)
│   ├── locales/                    # es.json, en.json (uso backend)
│   └── templates/                  # 14 plantillas Jinja2 (anidadas)
├── frontend/                       # Aplicación React
│   ├── index.html                  # mount point
│   ├── package.json                # vite + scripts
│   ├── tsconfig.json               # strict TS
│   ├── vite.config.ts              # build con manualChunks y Terser
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.tsx                # entrypoint + restoreCachedTheme
│       ├── App.tsx                 # layout + lazy routes + teclado
│       ├── api.ts                  # puente IPC (preload) con retry/timeout
│       ├── types.ts                # tipos compartidos (TS-only)
│       ├── navigation.ts           # TAB_DEFINITIONS (12 tabs)
│       ├── i18n.ts                 # init i18next (es/en)
│       ├── index.css               # tailwind + tokens
│       ├── test-setup.ts           # vitest setup
│       ├── assets/                 # logos / iconos auxiliares
│       ├── components/             # 17 dominios (ver §1.4)
│       ├── hooks/                  # 8 hooks (useBackendStatus, useToast, …)
│       ├── locales/                # es.json, en.json (uso frontend)
│       ├── utils/                  # csv, history (saveFeatureHistory), pdfAssets
│       └── __tests__/              # api.test.ts, App.test.tsx
├── tests/                          # Pruebas (Python + Node)
│   ├── test_*.py                   # ~30 archivos pytest
│   ├── test-*.js                   # ~10 archivos Node (Jest-ish manual)
│   ├── fixtures/                   # datos de prueba
│   ├── aviso/                      # imagen/plantillas de prueba
│   ├── aviso.xlsx                  # fixture Excel
│   └── panel_aviso_corte/          # fixture
├── docs/                           # documentación de referencia
│   ├── historial.md                # contrato técnico del historial
│   ├── AUDIT-PROMP.md              # (este archivo)
│   └── superpowers/                # planes internos (carpeta de trabajo)
├── scripts/                        # tooling de build / release
│   ├── build-backend.js
│   ├── bump-version.js
│   ├── clean-dist-electron.js
│   ├── clean-after-package.js
│   └── generate_brand_assets.py
├── data/                           # assets y base de datos de desarrollo
│   ├── catalogo.db                 # SQLite de ejemplo
│   ├── technical_reports.json
│   └── formatos/                   # formatos subidos persistidos (en runtime)
├── formatos/                       # assets PDF serializados (base64)
│   ├── catalog.json
│   ├── *.b64                       # 3 built-in (template-d, maquina, televisiva)
│   └── uploads/                    # subidas runtime
├── assets/                         # iconos .ico / .icns / .png
├── scratch/                        # archivos descartables (auditoría previa)
├── .github/
│   └── workflows/release.yml       # build + publicar en GitHub Releases
└── .factory/                       # configuración Factory (droids, skills)
```

### 1.4 Dominios de producto (frontend)

Los 12 tabs del sidebar, en orden de `navigation.ts`:

| Tab | Componente | Backend handler | Estado |
|-----|-----------|-----------------|--------|
| `convert` | `ConversionView.tsx` | `conversion.py` | núcleo |
| `formatos` | `FormatosView.tsx` | `formatos.py` | estable |
| `sellador` | `SelladorView.tsx` | `sellador.py` | estable |
| `padron` | `PadronView.tsx` | (catálogo + pdfExport frontend) | estable |
| `volantes` | `VolantesView.tsx` | (jspdf + catálogos Excel) | estable |
| `reportesCampo` | `ReportesCampoApp.tsx` | (jspdf + catálogos Excel) | estable |
| `technicalReports` | `TechnicalReportsApp.tsx` | `technical_reports.py` | maduro |
| `imageOptimizer` | `image-optimizer/index.tsx` | `optimizer.py` (zip) | maduro |
| `previewPanel` | `PreviewPanelView.tsx` | `technical_reports.html_to_pdf` / dialog-handlers | maduro |
| `panelAvisoCorte` | `PanelAvisoCorteApp.tsx` | `panel_aviso_corte.py` | maduro |
| `history` | `HistoryView.tsx` | `history.py` | muy maduro |
| `appearance` | `AppearanceView.tsx` | `theme.py` | muy maduro |

### 1.5 Comandos clave

```bash
# instalación
npm install
(cd frontend && npm install)
pip install -e ".[dev]"

# desarrollo
npm run dev                # vite :5173 + electron main

# build y empaquetado
npm run build:frontend
npm run build:backend      # PyInstaller AntaresBackend.exe
npm run build:win          # nsis + portable
npm run build:mac
npm run build:linux
npm run dist               # default

# calidad
npm run lint:python        # ruff (line-length 120, E,F,W,I,UP,B,SIM,RUF)
npm run lint:fix
npm run typecheck:frontend # tsc --noEmit
npm test                   # pytest + node integration tests

# release
npm run bump:patch -- --push
```

---

## 2. Objetivos de la auditoría

1. **Calidad de código:** detectar código muerto, duplicación, complejidad
   innecesaria, zonas no testeadas, acoplamiento y dependencias circulares.
2. **Seguridad:** validar el modelo de amenazas (renderer ↔ main ↔
   backend) y todas las superficies de entrada.
3. **Rendimiento:** localizar cuellos de botella en operaciones por lote
   (imágenes, PDFs, Excel).
4. **Robustez y operabilidad:** validar el ciclo de vida del backend
   (spawner, health checks, recovery), gestión de errores y mensajes
   user-facing.
5. **Mantenibilidad:** evaluar el cumplimiento de las convenciones
   declaradas en `AGENTS.md` y `CLAUDE.md`.
6. **Compatibilidad y versionado:** consistencia entre `package.json`,
   `pyproject.toml`, `frontend/package.json` y `backend/version.py`.
7. **Internacionalización:** verificar cobertura y consistencia es/en en
   frontend y backend.
8. **Empaquetado y release:** reproducibilidad del build en
   Windows/macOS/Linux, instaladores, actualización automática.
9. **Accesibilidad (a11y) y UX:** keyboard nav, focus traps, contrastes
   de tema, mensajes de error.
10. **Cumplimiento de las "reglas inquebrantables" del historial** (ver
    `docs/historial.md`).

---

## 3. Alcance y exclusiones

**Dentro del alcance:**

- `backend/**`, `electron/**`, `frontend/src/**`, `frontend/public/**`,
  `frontend/index.html`, `tests/**`, `scripts/**`, `electron-builder.yml`,
  `pyproject.toml`, `package.json` (root y `frontend/`),
  `.github/workflows/**`, `docs/**`, `formatos/catalog.json`.
- Pruebas existentes: pytest, Node integration tests, Vitest.
- Empaquetado: `npm run build:win` y `npm run build:mac` (no es
  necesario ejecutar el build en CI, pero validar los scripts).
- Migraciones: `backend/core/migrations.py` + `backend/core/history.py`.

**Fuera del alcance (pero documentar si se cruzan):**

- `node_modules/`, artefactos de build (`dist/`, `dist-electron/`,
  `backend/build/`, `backend/dist/`, `frontend/dist/`, `__pycache__/`).
- `scratch/` (descartables, no auditoría).
- Repos externos, imágenes decorativas en `assets/`.
- Comentarios en español que no impactan funcionalidad.

---

## 4. Hallazgos previos conocidos (lectura obligatoria)

Antes de empezar, **consume** los siguientes issues / notas detectados
en pasadas exploraciones. No los dupliques; amplíalos o refútalos con
evidencia nueva.

### 4.1 Divergencia de versiones

- `package.json` (root): `0.10.4`
- `backend/version.py`: `0.10.4`
- `pyproject.toml`: `0.10.6`
- `frontend/package.json`: `0.10.6`

**Acción:** identificar quién está mal (probablemente `package.json` y
`version.py` van un paso atrás) y verificar que
`scripts/bump-version.js` sincroniza las 4 fuentes en un solo bump.

### 4.2 Dependencia opcional sin registro

- `jsonschema` se importa perezosamente en `backend/core/run_types.py`
  y se usa para validar payloads del historial.
- Está listada en `pyproject.toml` (`jsonschema>=4.0.0`) — bien — pero
  existe un `TODO` en el módulo sobre asegurar la disponibilidad
  estricta.

**Acción:** confirmar que `jsonschema` está en `pyproject.toml` y
probar el flujo "instalación mínima sin jsonschema" para validar la
degradación.

### 4.3 Handlers duplicados virtualmente

- `backend/handlers/technical_reports.py::html_to_pdf` Y
  `electron/dialog-handlers.js::renderHtmlToPdf` implementan la misma
  funcionalidad (WeasyPrint vs. Chromium `printToPDF`).
- El handler Python **aún está registrado** en `BACKEND_METHODS` y en
  el menú de la allowlist.
- El frontend (`api.ts::htmlToPdf`) **usa siempre el camino Electron**
  y sanitiza en cliente con la misma regex que el backend.

**Acción:** decidir si se elimina `html_to_pdf` Python (preferido) o
se documenta como "para integraciones futuras". Verificar que
`LONG_RUNNING_METHODS` y la `preload` allowlist se mantienen
consistentes con esa decisión.

### 4.4 `BUILTIN_DIR` calculado en import-time

- `backend/core/formatos.py` resuelve `_PROJECT_DIR` con
  `Path(__file__).resolve().parent.parent.parent`. En un ejecutable
  PyInstaller onefile, `__file__` apunta al temporal `_MEIPASS`.
- Hay tres rutas de fallback (dev / prod root / data dir).

**Acción:** validar con un `AntaresBackend.exe` empaquetado que
`template-d.b64`, `maquina.b64`, `televisiva.b64` se cargan desde
`resources/formatos/` (definido en `electron-builder.yml` como
`extraResources`).

### 4.5 `htmlToPdf` del frontend sanitiza idéntico al backend

- `frontend/src/api.ts::_sanitizeHtmlForPdf` y
  `electron/dialog-handlers.js::_sanitizeHtmlForPdf` son clones casi
  exactos.
- También existe una tercera copia en
  `backend/handlers/technical_reports.py::_sanitize_html_for_pdf`.

**Acción:** consolidar la sanitización (DRY) o, si se mantiene, añadir
un test que verifique que las tres regex cubren los mismos casos.

### 4.6 CSP sólo en producción

- `electron/window-manager.js` aplica una CSP permisiva en dev
  (`connect-src http://localhost:5173 ws://localhost:5173`) y una
  estricta en producción.

**Acción:** verificar que `script-src` no permite `'unsafe-eval'` y
que `style-src 'unsafe-inline'` es indispensable (WeasyPrint y jsPDF
lo requieren).

### 4.7 `dev-only` mode del auto-updater

- `electron/auto-updater.js` registra `auto-update-check` y
  `auto-update-install` también cuando `isDev=true`, devolviendo mocks.
- Útil para evitar errores en dev, pero `electron-updater` se importa
  perezosamente.

**Acción:** asegurar que el chequeo periódico (`setInterval`) **no se
ejecuta en dev**.

### 4.8 `MAX_CONCURRENT_DEFAULT` autodetectado

- `backend/core/jobs.py::_detect_max_concurrent` usa `psutil` si está
  disponible y cae a 4 como floor.
- `psutil` **no está en pyproject.toml** — la app debería funcionar
  sin él, pero el comentario en `scheduler.py` sugiere que
  `scheduler.py` también lo usa.

**Acción:** decidir si `psutil` debe agregarse como dependencia
recomendada u opcional (`[project.optional-dependencies]`).

### 4.9 `heurística de claves path-like`

- `backend/utils/validators.py::is_path_like_key` y
  `backend/handlers/common.py::@validate_params` lo comparten.
- Documentado como "single source of truth" — verificar que sigue
  siendo cierto en la práctica.

### 4.10 Plugin loader

- `backend/core/plugins.py` aplica un AST whitelist de imports y
  builtins antes de ejecutar el código.
- Documenta bloques para `os`, `subprocess`, `socket`, `urllib`,
  `ctypes`, etc.
- **Aún así** importa dinámicamente con `importlib.util.exec_module`
  — el sandbox es estático, no de runtime.

**Acción:** evaluar si este sandbox es suficiente. Considerar
recomendación de "plugins solo en dev" o mover a un subproceso
restringido (aún mejor: process isolation).

### 4.11 Localización: algunas claves backend faltan

- `backend/core/technical_reports/models.py::MESES` está hardcoded en
  español.
- `backend/core/history.py::save_run` no tiene mensajes traducibles.

**Acción:** revisar toda cadena user-facing en backend y mapear a
`backend/locales/*.json`.

### 4.12 Tests de "build size"

- `tests/test-build-size-guards.js` impone límites de tamaño de
  instaladores (`Antares-Setup-*.exe`, `Antares-Portable-*.exe`).
- Necesita los binarios producidos por `npm run build:win`.

**Acción:** verificar los umbrales y que el test falle limpio si los
excede.

### 4.13 `preload.js` y `ALLOWED_RENDERER_METHODS`

- `electron/preload.js` re-valida cada método con el set
  `ALLOWED_RENDERER_METHODS` antes de invocar `ipcRenderer.invoke`.
- En `electron/ipc-router.js::registerIpcHandlers` se vuelve a
  validar.

**Acción:** defensa en profundidad correcta. Documentarlo en la
sección de seguridad para que un refactor no elimine una de las dos
capas.

### 4.14 `preload.js` no expone el `contextBridge` si falla

- Si `contextBridge.exposeInMainWorld` lanza (poco probable), el
  frontend no recibe `electronAPI` y muestra la pantalla
  "ElectronOnlyNotice".

**Acción:** verificar el flujo de recuperación; considerar exponer
un `__ANTARES_FALLBACK__` con datos básicos para no dejar al usuario
sin feedback.

### 4.15 `useProcessRunner` filtra claves

- `frontend/src/hooks/useProcessRunner.ts` filtra explícitamente las
  claves que acepta del notify (`running`, `progress`, …). Es una
  buena práctica.

**Acción:** verificar que no haya hooks equivalentes con
`onNotify((method, params) => params)` sin filtrar.

### 4.16 `package.json` no declara `repository.url` para auto-update

- `electron-builder.yml` define `publish: { provider: github, owner:
  sechgio, repo: antares }`.
- `package.json` tiene `repository.url` apuntando a
  `github.com/sechgio/antares.git`.

**Acción:** confirmar que ambos coinciden (mismo owner/repo) y que no
haya un mismatch que rompa `electron-updater`.

### 4.17 `pyproject.toml::select` incluye `UP` y `B`

- `select = ["E", "F", "W", "I", "UP", "B", "SIM", "RUF"]`.
- Sin embargo, el repo no usa `ruff format` (solo `ruff check`).

**Acción:** documentar si el formateo automático se considera
necesario (probablemente sí) y agregar un script.

### 4.18 `electron-builder.yml::asarUnpack` limitado

- Solo `**/*.node` y `node_modules/**/build/Release/*.node`.

**Acción:** confirmar que no hay `.node` extra que se necesite
desempaquetar (e.g. bindings nativos de WeasyPrint — WeasyPrint no
los usa, pero revisar `pandas` o `openpyxl` por si acaso).

### 4.19 `FrontendStatusBar.tsx` no hace nada

- El archivo existe pero su cuerpo es `return null;`.

**Acción:** decidir si se implementa o se elimina. El sidebar ya
muestra un dot cuando un tab está activo. Hay un hook
`useBackendStatus` que podría alimentar este componente.

### 4.20 `tests/test-history-migrations.py` y otros

- Hay tests "duros" (path traversal, race conditions, reentrant
  lock) — pero no se ha medido coverage global.

**Acción:** correr `pytest --cov=backend` y reportar la cobertura por
módulo. Identificar los módulos con < 70%.

### 4.21 `sellador.py` vs `sellador_io.py` vs `sellador_preview.py`

- Tres archivos con responsabilidades adyacentes. Verificar que
  `core/sellador.py` no se importa directamente desde handlers
  (debería ser indirecto vía `core/sellador_io` y
  `core/sellador_preview`).

### 4.22 `SelladorView` y el render de previsualizaciones

- `SelladorView.tsx` usa `useDebouncedValue` para evitar storms de
  rerender durante el drag.
- Hay lógica de `MAX_IN_MEMORY_BYTES = 8 MB` para mantener
  performance.

**Acción:** verificar que PDFs > 8 MB se renderizan vía `pdf_path`
(no base64) y se limpian los ObjectURL.

### 4.23 `data/formatos/uploads` se sincroniza a runtime

- En dev, los uploads van a `data/formatos/uploads`.
- En prod (`extraResources`), van a `resources/data/formatos/uploads`
  (verificable con `user_data_path`).

**Acción:** confirmar que `user_data_path` siempre escribe a una zona
writable (no a `resourcesPath`).

### 4.24 `formatos.py::_save_catalog` usa `os.fsync`

- Hace `f.flush()` + `os.fsync(f.fileno())` — buena práctica, pero
  costosa en SSDs.

**Acción:** medir el impacto y considerar batching de guardados.

### 4.25 `App.tsx` usa React.lazy sin Suspense para auto-update

- `App.tsx` ya envuelve todo en `<Suspense fallback="Cargando...">`.

**Acción:** verificar que la pantalla de carga no se quede
indefinidamente si la importación dinámica falla (e.g. module not
found). Considerar `ErrorBoundary`.

### 4.26 `electron/main.js` no maneja SIGBREAK (Windows)

- Solo maneja SIGTERM, SIGINT y SIGHUP.

**Acción:** agregar SIGBREAK en Windows (Ctrl+Break desde la
consola) — menor prioridad.

### 4.27 `preload.js` y `console.log` ruidosos

- `preload.js` hace `console.log('[preload] ...')` y
  `console.error('[preload] ...')`. En producción esto es visible
  en DevTools.

**Acción:** bajar a `console.debug` o quitar (Vite ya hace `drop_console`
en producción, pero preload no pasa por Vite).

### 4.28 Conversión de strings en `_validate_encoding` con
              `locale.setlocale` global

- En `backend/main.py::_validate_encoding` se cambia el locale del
  proceso. Esto es invasivo y no se restaura.

**Acción:** usar `locale.setlocale(locale.LC_ALL, '')` y restaurar
en `finally`, o usar `locale.resetlocale()`.

### 4.29 `preview_cache` no se invalida tras escritura

- Si un usuario reescribe un archivo, el cache sigue devolviendo
  bytes stale durante 180 s.

**Acción:** considerar invalidar por mtime o por path exacto al
guardar.

### 4.30 `excel.ts` del frontend (PadronView) y backend `database.py`

- El frontend lee Excel directamente con `xlsx` (lib JS), el
  backend lo lee con `pandas`.

**Acción:** evaluar si se debe centralizar (que el frontend siempre
pregunte al backend) para evitar divergencias de parsing.

### 4.31 `SelladorView.tsx` y `pdfjs` lazy

- Importa `pdfjs-dist` dinámicamente con un `workerSrc` desde
  `?url`. Riesgo: en build de producción, el worker se numera y
  puede no encontrarse.

**Acción:** verificar el bundle de producción y el orden de chunks.

### 4.32 `electon-builder.yml` y `linux` snap `grade: stable`

- `snap: { grade: stable, confinement: strict }` — buena práctica,
  pero no hay tests en CI.

**Acción:** documentar que la release de Linux es "best effort".

### 4.33 `preinstall: electron-builder install-app-deps`

- `npm postinstall` ejecuta esto. En CI con `actions/setup-node@v4`
  puede fallar si no hay `python` en PATH.

**Acción:** añadir comentario o flag `--ignore-scripts` en CI.

### 4.34 `pyproject.toml::requires-python = ">=3.10"` pero CI usa
              `3.10`

- Coincide, pero la app podría usar sintaxis 3.11 (e.g. `StrEnum`,
  `Self`).

**Acción:** correr `pyupgrade --py310-plus` y revisar qué
oportunidades hay.

### 4.35 `ag-grid`/`react-window` y bundles

- `react-window` está pinneado a `^2.2.7` (API nueva con
  `cellComponent` y `cellProps`).
- `FileGrid.tsx` ya usa la nueva API correctamente.

**Acción:** asegurar que no hay código legacy con
`FixedSizeGrid`/`FixedSizeList`.

### 4.36 `framer-motion` pesado

- ~120 kB gzip. Se usa en `Toast`, `CommandPalette`, `PreviewDrawer`.

**Acción:** considerar `LazyMotion` o `motion/react` para reducir
costo de arranque.

### 4.37 `ipc-protocol` y tamaño máximo de payload

- `ANTARES_IPC_MAX_PAYLOAD_SIZE` por defecto 64 MB. Los `base64` de
  PDF previsualizado pueden pasar este límite.

**Acción:** considerar subir el límite o dividir respuestas
pesadas en chunks.

### 4.38 `react-i18next` cargado en `App.tsx` pero no en tests

- `frontend/src/__tests__/App.test.tsx` debe mockear `i18next`.

**Acción:** verificar el mock y la cobertura.

### 4.39 `BackendStatusBar` debería consumir `useBackendStatus`

- El hook existe, el componente no lo usa.

**Acción:** implementar o eliminar.

### 4.40 `audit log` para acciones críticas

- No hay registro de "qué operación ejecutó el usuario con qué
  parámetros" más allá del historial.

**Acción:** documentar si se considera suficiente el historial
actual o se necesita un audit log separado.

---

## 5. Metodología de auditoría (paso a paso)

### 5.1 Preparación del entorno

```bash
# clonar
git clone https://github.com/sechgio/antares.git
cd antares

# verificar versiones
node --version     # >= 18
python --version   # >= 3.10
npm --version

# instalar
npm install
(cd frontend && npm install)
pip install -e ".[dev]"

# verificar la línea base
npm run lint:python
npm run typecheck:frontend
npm test
```

Si alguno falla, abrir un hallazgo inmediatamente y considerar si el
estado actual ya es "roto".

### 5.2 Lectura de contexto (no modificar nada)

1. `AGENTS.md` y `CLAUDE.md` completos.
2. `docs/historial.md` (política de compatibilidad).
3. `package.json` (root y `frontend/`) + `pyproject.toml`.
4. `electron-builder.yml` (qué entra en el paquete).
5. `electron/main.js` y `electron/backend-spawner.js` (ciclo de vida
   del backend).
6. `backend/main.py` y `backend/ipc_protocol.py` (loop IPC).
7. `frontend/src/App.tsx` y `frontend/src/api.ts` (puente
   renderer ↔ main).

### 5.3 Análisis estático

- **Python:** `ruff check . --select=E,F,W,I,UP,B,SIM,RUF`. Verificar
  cero errores.
- **Python:** `mypy backend` (modo leniency) para surface
  inconsistencias de tipos.
- **TypeScript:** `npm run typecheck:frontend` (tsc --noEmit).
- **TypeScript:** `ts-prune` o `knip` para detectar exports /
  imports muertos.
- **Seguridad:** `pip-audit` y `npm audit --omit=dev`. Reportar
  CVEs abiertas.
- **Secretos:** `gitleaks` o `trufflehog` (opcional).
- **Tamaño:** `vite-bundle-visualizer` (ya configurado en
  `vite.config.ts` con `mode=analyze`).

### 5.4 Análisis dinámico

- **Backend:**
  - `pytest -v --cov=backend --cov-report=term-missing`.
  - Stress: 10 000 archivos en cola; verificar uso de RAM y tiempo.
  - Concurrencia: dos `process_start` simultáneos (legacy y
    `job_id` explícito).
  - Migraciones: partir de una BD pre-1.0 y bumpear.
- **Frontend:**
  - `vitest run --coverage` (configurar v8 o istanbul).
  - Storybook o tests de interacción (no configurado — recomendación).
  - Lighthouse / axe-core en la build de producción.
- **Electron:**
  - `npm run dev` + observar DevTools (memory, network).
  - Forzar crash del backend (`kill -9`) y verificar recovery.
  - Forzar pipe cerrado y verificar mensaje user-facing.
- **Empaquetado:**
  - `npm run build:win` (no firmar) y verificar que el instalador
    NSIS arranca en Windows.
  - `npm run dist:dir` para inspección local.
  - `tests/test-build-size-guards.js` y registrar umbrales.

### 5.5 Revisión manual por dominio

Sigue la matriz de la **sección 12** y completa para cada dominio:

- Resumen ejecutivo (1 párrafo).
- Lista de hallazgos (formato §13).
- Pruebas añadidas o corregidas.
- Recomendaciones priorizadas.

---

## 6. Lista de chequeo detallada por superficie

### 6.1 Seguridad

#### 6.1.1 Renderer → main (preload)

- [ ] `preload.js` no expone APIs peligrosas (eval, Function, ipcRenderer
      sin filtro).
- [ ] `ALLOWED_RENDERER_METHODS` está en **un solo lugar**
      (`electron/ipc-methods.js`).
- [ ] Cada método nuevo se añade en **backend handler, allowlist y
      frontend api.ts** simultáneamente. Verificar que el árbol
      grep de los 3 lugares coincide.
- [ ] Los métodos `LONG_RUNNING` se mantienen alineados con
      `IPC_TIMEOUT` del frontend.

#### 6.1.2 Main → backend (IPC router)

- [ ] `registerIpcHandlers` filtra con `ALLOWED_RENDERER_METHODS`
      antes de reenviar al backend.
- [ ] `dialog_files`, `dialog_folder`, `dialog_dest`, `dialog_save`
      se manejan **sin pasar por Python**.
- [ ] `html_to_pdf` nunca recibe HTML sin sanitizar.
- [ ] El CSP de producción bloquea `script-src` externos.
- [ ] `webRequest.onBeforeRequest` para PDFs generados bloquea
      URLs externas (sólo `data:` y `file:` locales permitidos).

#### 6.1.3 Backend (Python)

- [ ] `@validate_params` se aplica en **todos** los handlers públicos
      en `backend/handlers/*.py` (no sólo en los críticos).
- [ ] `is_safe_user_path` cubre Windows (`\`), Unix (`/`), URLs
      (`%2e%2e`), NUL bytes.
- [ ] `_validate_identifier` se usa en toda construcción de SQL
      dinámico (ya está en `database.py`).
- [ ] No se hace `shell=True` con strings del usuario.
- [ ] `pypdf` no se usa con archivos que puedan tener XObjects
      hostiles.
- [ ] `WeasyPrint` se usa con HTML sanitizado (sin `<script>`, sin
      `url()` no `data:`).
- [ ] El plugin loader AST sandbox sigue siendo correcto
      (`_BLOCKED_IMPORTS`, `_BLOCKED_NAMES`, `_BLOCKED_ATTRS`).
- [ ] Los PDFs subidos a `formatos_upload` validan magic bytes
      (`%PDF`) y un límite de 50 MB.
- [ ] El Excel importer valida extensión, número de filas y
      duplicados de cabeceras.

#### 6.1.4 Almacenamiento

- [ ] `user_data_path` siempre cae en zona writable
      (`%LOCALAPPDATA%/Antares`, no `process.resourcesPath`).
- [ ] La BD SQLite se abre con `check_same_thread=False` y
      `isolation_level=None` (autocommit); el locking
      (`_db_lock`) es global.
- [ ] No hay secretos committeados (verificar `.env*`, `*.pem`,
      `*.key`).

### 6.2 IPC y protocolo

- [ ] `send_response` y `send_notification` están protegidos
      contra payloads > 64 MB.
- [ ] `read_message` retorna `None` en EOF y `_SKIP` en parse error
      (no abortar el loop).
- [ ] `_MAX_CONSECUTIVE_ERRORS = 100` resetea ante éxito.
- [ ] El handshake se hace **antes** de `init_db` y
      `load_plugins_from_dir` para evitar timeout.
- [ ] Cada request lleva un `id` (UUID) que el router correlaciona
      correctamente.
- [ ] El renderer no envía notificaciones (solo requests) — el
      router debe rechazar `id: undefined` con un error.

### 6.3 Backend spawner (Electron)

- [ ] `HANDSHAKE_TIMEOUT_MS` razonable (30 s).
- [ ] `HEALTH_PROBE_TIMEOUT_MS` corto (3 s).
- [ ] `_pendingRequestCount` bloquea el restart durante operaciones
      activas.
- [ ] `_forceKillProcess` usa `taskkill /T /F` en Windows.
- [ ] `_stderrBuffer` está acotado a 30 líneas.
- [ ] `manualRestart()` se llama desde la UI con un solo
      `manualRestartInProgress` guard.

### 6.4 Scheduler y Jobs

- [ ] El scheduler tiene dos colas: `submit_light` y
      `submit_heavy`. La cola pesada usa un `BoundedSemaphore`.
- [ ] Los `HEAVY_METHODS` están sincronizados con
      `LONG_RUNNING_METHODS` del router.
- [ ] `JobManager.MAX_CONCURRENT_DEFAULT` no excede `16` ni baja de
      `4`.
- [ ] Los `Job.to_dict()` nunca exponen referencias internas.
- [ ] `_wrapped_target` siempre pone `running=False` en finally.
- [ ] El legacy `_state` (`backend/handlers/common.py`) sigue
      sincronizado con el nuevo `JobManager` para no romper el
      frontend single-job.

### 6.5 Pipeline de conversión

- [ ] `convertir_imagen` valida dimensiones y formato antes de
      abrir.
- [ ] `_ensure_mode` maneja transparencias y modos de paleta
      correctamente.
- [ ] `convertir_a_preview` está cacheado (LRU 75, TTL 180 s).
- [ ] El resize usa `LANCZOS` y maneja dimensiones inválidas.
- [ ] El copy para video no transcodea (usa `shutil.copy2`).

### 6.6 Renombrado

- [ ] `RenamerEngine.aplicar` es idempotente para entradas sin DB.
- [ ] `parse_filename_parts` y `obtener_codigo_desde_nombre` son
      robustos a nombres con varios `_` o `-`.
- [ ] El mode "mapeo directo" valida colisiones **antes** de
      empezar el batch.
- [ ] El patrón vacío (`usarRename=False` o `pattern=""`) mantiene
      el nombre original.

### 6.7 Formatos PDF

- [ ] `_BUILTIN_FORMATS` se carga una sola vez en `_load_catalog()`.
- [ ] Los uploads validan magic bytes y tamaño.
- [ ] Las estrategias (`legacy_xobject`, `visual_overlay`,
      `simple_overlay`) están aisladas en `format_strategies/`.
- [ ] `LegacyXObjectStrategy` busca el XObject con heurística
      correcta (3 `Tj`, 3 markers, 7 draw count).
- [ ] El visual overlay dibuja un sello blanco + número + opcional
      "OT:".
- [ ] El `SIMPLE_OVERLAY` no requiere mapping.
- [ ] La generación es bounded: 500 páginas máximo por request.
- [ ] El filename pattern `{id}`, `{nombre}`, `{desde}`, `{hasta}`
      se sustituye correctamente.

### 6.8 Sellador PDF

- [ ] `apply_sellador` valida `stamp_count > 0` y dimensiones > 0.
- [ ] `_prepare_stamp_image` no excede 300 DPI ni pierde aspect
      ratio.
- [ ] `distribute_stamp_pages` usa LCG determinista (seed-based)
      para reproducibilidad.
- [ ] `_validate_unique_stamp_pages` rechaza duplicados.
- [ ] `stamp_placements` valida `page_index` dentro del rango.
- [ ] El preview usa `PyMuPDF` con DPI auto-calculado.

### 6.9 Catálogo de base de datos

- [ ] El esquema se crea con `CREATE TABLE IF NOT EXISTS`.
- [ ] La migración aditiva añade columnas con `DEFAULT NULL` o `0`.
- [ ] Los índices se crean idempotentemente.
- [ ] `_create_indexes` cubre todas las columnas consultadas.
- [ ] `parse_id_rename_mapping` valida ID único y RENOMBRE no
      vacío.
- [ ] `importar_excel` hace `DELETE FROM` + `INSERT` en una sola
      transacción.

### 6.10 Historial

- [ ] Cumple las **8 reglas inquebrantables** de
      `docs/historial.md`.
- [ ] Las migraciones se aplican idempotentemente
      (`_execute_idempotent`).
- [ ] `validate_run_payload` corre antes de persistir.
- [ ] La exportación CSV respeta el orden de IDs.
- [ ] `app_version` se guarda con cada run.
- [ ] No hay `SELECT *` en listados.

### 6.11 Informes técnicos

- [ ] Los modelos (`TechnicalReport.normalize`) son tolerantes a
      inputs incompletos.
- [ ] El importer soporta `.xlsx` y `.csv` con sniffing de
      delimitador.
- [ ] El mapping de columnas cubre todos los alias en español
      (`INSPECTION_ALIAS_GROUPS`, `VALVULA_SECTION_ALIASES`,
      `CANASTILLAS_*`).
- [ ] El render HTML usa Jinja2 con `autoescape` activo.
- [ ] La consolidación ordena por `informe_id`.

### 6.12 Panel Aviso de Corte

- [ ] El importer valida extensión `.xlsx` y rechaza cabecera
      vacía.
- [ ] `MAX_EXCEL_ROWS = 10_000` se enforce.
- [ ] El matcher soporta 4 estrategias (`prefix`, `contains`,
      `exact`, `regex`).
- [ ] El `regex_pattern` debe contener el grupo `(?P<clave>...)`.
- [ ] El matcher limita a 4 imágenes por panel.
- [ ] `serialize_panel` / `deserialize_panel` son round-trip.
- [ ] El render PDF usa WeasyPrint y el render DOCX usa
      `python-docx`.
- [ ] El DOCX hace `cover` crop, no `contain`.

### 6.13 Optimizador de imágenes

- [ ] `Pipeline.processImageItem` aplica presets y crop.
- [ ] `zip.ts` deduplica nombres dentro del ZIP.
- [ ] `image_optimizer_zip` valida al menos un archivo.
- [ ] `MAX_IN_MEMORY_BYTES` se respeta.

### 6.14 Generador de Reportes (PreviewPanel)

- [ ] Las plantillas se listan desde `backend/templates/`.
- [ ] `template_get` valida `is_safe_user_path`.
- [ ] El render se hace vía `html_to_pdf` (Electron) o vía
      `preview-panel/pdfExport.ts` (jsPDF).
- [ ] Los logos se persisten en `localStorage` con tamaño limitado.

### 6.15 Volantes y Reportes de campo

- [ ] `volantes/utils/pdf.ts` y `reportes-campo/utils/export.ts`
      usan `jspdf` o `html-to-image` según la ruta.
- [ ] Los layouts respetan `getCropRectangle` y márgenes.

### 6.16 Apariencia (temas)

- [ ] `presets.json` se valida y los presets faltantes se
      omiten.
- [ ] `save_theme` filtra valores no string.
- [ ] `restoreCachedTheme` en `main.tsx` aplica vars a
      `:root` antes del primer render.
- [ ] El switch dark/light/system consulta `matchMedia` y
      reacciona.

### 6.17 Internacionalización

- [ ] Todas las claves nuevas se añaden en `es.json` y `en.json`
      (frontend y backend).
- [ ] `i18n.ts` tiene fallbackLng = 'es'.
- [ ] `t()` se llama con `{{var}}` y el código pasa las variables.
- [ ] `useTranslation()` se usa en lugar de `t()` directo en
      componentes nuevos.
- [ ] Backend usa `t("key", **kwargs)` (formato con
      `str.format`).

### 6.18 Build y release

- [ ] `npm run build:win` produce instalador NSIS + portable.
- [ ] `electron-builder.yml` excluye correctamente
      `frontend/src`, `tests`, `backend` (los recursos van en
      `extraResources`).
- [ ] El `asar` empaqueta los assets del frontend.
- [ ] `app-builder` firma con el certificado (si existe);
      `verifyUpdateCodeSignature: false` documentado.
- [ ] `npm run bump:patch|minor|major` actualiza las 4 fuentes
      (`package.json`, `frontend/package.json`,
      `backend/version.py`, `pyproject.toml`).
- [ ] El workflow de release
      (`.github/workflows/release.yml`) usa Python 3.10 y Node 18.

---

## 7. Métricas y umbrales objetivo

| Métrica | Objetivo | Acción si no se cumple |
|---------|----------|------------------------|
| Cobertura Python (line) | ≥ 80% | Listar módulos sin cubrir y priorizar |
| Cobertura TS/React (line) | ≥ 60% | Añadir Vitest en componentes críticos |
| `ruff check` warnings | 0 | Reportar regresión |
| `tsc --noEmit` errors | 0 | Bloqueante |
| `npm audit` high/critical | 0 | Bloqueante |
| Tamaño de `AntaresBackend.exe` | ≤ 70 MB | Reportar crecimiento |
| Tiempo de `npm run build:win` | ≤ 8 min | Investigar regresión |
| Tiempo de handshake del backend | ≤ 5 s | Reportar lentitud |
| `MAX_CONSECUTIVE_ERRORS` alcanzable | nunca | Alertar si pasa de 50 |
| `prepare_db_with_seed` (test) | ≤ 2 s | Alertar |
| Latencia IPC promedio (1 KB) | ≤ 5 ms | Reportar |
| Latencia IPC percentil 95 (1 KB) | ≤ 50 ms | Reportar |

---

## 8. Pruebas requeridas por la auditoría

Cada hallazgo debe ser **acompañado** por al menos una de:

1. Test nuevo (pytest/Vitest) que reproduzca el bug.
2. Comprobación manual documentada con output literal.
3. Captura / log de DevTools, stderr del backend, etc.
4. Diff de búsqueda (`rg`) que confirme la extensión del problema.

Plantilla de comandos para recoger evidencia:

```bash
# Python
rg -n "TODO|FIXME|XXX|HACK" backend/
rg -n "print(" backend/handlers
pytest --cov=backend --cov-report=xml -q

# TypeScript
rg -n "any\b" frontend/src
rg -n "console\.(log|warn|error)" frontend/src
npm run typecheck:frontend

# Security
npm audit --omit=dev
pip-audit -r pyproject.toml
rg -n "(password|secret|token|api[_-]?key)" backend frontend electron
```

---

## 9. Análisis estático avanzado

### 9.1 Dependencias no usadas o gigantes

```bash
# Detectar imports no usados en Python
pip install pydeps && pydeps backend --show-dot --max-bacon=2
# Detectar imports no usados en TS
npx ts-prune
npx knip
```

### 9.2 Complejidad ciclomática

```bash
pip install radon
radon cc backend -s -a -n B
radon mi backend -s
```

Para TypeScript, `eslint --rule complexity` o `plato`.

### 9.3 Duplicación

```bash
pip install pylint
pylint --disable=all --enable=duplicate-code backend
```

Para TypeScript, `jscpd` o `duplo`.

---

## 10. Pruebas dinámicas recomendadas

### 10.1 Backend — stress

```python
# tests/audit/test_stress_conversion.py
def test_10k_images_does_not_explode(tmp_path, monkeypatch):
    files = make_dummy_images(tmp_path, n=10_000)
    started = handler({"files": [str(p) for p in files], ...})
    # sigue el progreso, no debe reventar la RAM
```

### 10.2 Concurrencia

```python
def test_two_jobs_in_parallel():
    # levantar dos jobs con job_ids distintos y verificar
    # que se ejecutan en paralelo
```

### 10.3 Renderer — interacciones

- Drag & drop de archivos en la dropzone.
- Importar un Excel de 5 MB.
- Cancelar un job en curso y verificar que el botón cambia
  correctamente.
- Cerrar la ventana con la X durante un job y verificar que el
  backend recibe la señal de kill.
- Cambiar el tema en vivo.
- Cambiar de tab con `Ctrl+1..9` y verificar el command palette.

---

## 11. Reporte de hallazgo (plantilla)

> Copia y rellena este bloque **por cada hallazgo**. El reporte sin
> este formato se descarta.

```
### H-<ID>

- **Título:** [Verbo + objeto + impacto]
- **Severidad:** [critical | high | medium | low | info]
- **Categoría:** [security | reliability | performance | ux | i18n |
   a11y | build | docs | architecture | testing | i18n | compat]
- **Dominio (§12):** [tab/handler/archivo afectado]
- **Ubicación:** `ruta/al/archivo.py:123` o `frontend/src/...`
- **Síntoma / comportamiento esperado:**
- **Reproducción (pasos exactos):**
  1. ...
  2. ...
- **Evidencia:**
  - Log: `...`
  - Salida de test: `...`
  - Captura / comando: `...`
- **Causa raíz (hipótesis):**
- **Propuesta de fix:**
  - Diff de referencia (si aplica)
  - Tests nuevos (archivo + nombre)
- **Notas / contexto adicional:**
```

**Escala de severidad:**

- **critical:** exploitable, fugas de datos, código que no arranca,
  pérdida de historial.
- **high:** bug reproducible con impacto significativo (job no
  cancela, mapping pierde datos, IPC se cuelga en condiciones
  normales).
- **medium:** defecto observable con workaround claro.
- **low:** nit / mejora DX / oportunidad de DRY.
- **info:** observación sin acción obligatoria.

---

## 12. Matriz de dominios (responsables sugeridos)

| Dominio | Owner | Archivos clave | Métricas a reportar |
|---------|-------|----------------|----------------------|
| Shell Electron | @electron-main | `electron/main.js`, `electron/preload.js`, `electron/window-manager.js` | tiempo de arranque, número de eventos IPC, errores de contextBridge |
| Spawner | @electron-main | `electron/backend-spawner.js`, `electron/backend-command.js` | frecuencia de restart, causas de crash |
| IPC Router | @electron-main | `electron/ipc-router.js`, `electron/ipc-methods.js` | P50/P95 latencia, timeouts |
| Auto-update | @electron-main | `electron/auto-updater.js` | éxito de check, tamaño de payload |
| Dialogs / PDF (Chromium) | @electron-main | `electron/dialog-handlers.js` | fallos de render, memoria pico |
| Loop IPC Python | @backend-core | `backend/main.py`, `backend/ipc_protocol.py` | tiempo de handshake, errores consecutivos |
| Convertidor de imágenes | @backend-core | `backend/core/converter.py`, `backend/core/format_registry.py` | archivos/s, latencia preview |
| Renombrado | @backend-core | `backend/core/renamer.py`, `backend/core/mapping_index.py` | colisiones detectadas, falsos positivos |
| Scheduler / Jobs | @backend-core | `backend/core/scheduler.py`, `backend/core/jobs.py`, `backend/core/state.py` | colas llenas, jobs cancelados |
| Formatos PDF | @backend-core | `backend/core/formatos.py`, `backend/core/format_strategies/*` | páginas generadas, errores de XObject |
| Sellador PDF | @backend-core | `backend/core/sellador.py`, `backend/core/sellador_io.py`, `backend/core/sellador_preview.py` | memoria, latencia preview |
| Catálogo / DB | @backend-core | `backend/core/database.py`, `backend/core/migrations.py`, `backend/core/repository.py` | tamaño BD, latencia queries |
| Historial | @backend-core | `backend/core/history.py`, `backend/core/run_types.py` | tamaño, run_types soportados |
| Informes técnicos | @backend-core | `backend/core/technical_reports/*` | # informes, latencia render |
| Panel Aviso de Corte | @backend-core | `backend/core/panel_aviso_corte/*` | paneles/seg, errores de matching |
| Optimizador | @backend-core | `backend/handlers/optimizer.py` | zip bytes generados |
| Plugins | @backend-core | `backend/core/plugins.py` | intentos de carga, plugins cargados |
| Validadores / paths | @backend-core | `backend/utils/validators.py`, `backend/utils/paths.py`, `backend/utils/i18n.py` | re-introducciones de is_path_like_key |
| i18n backend | @backend-core | `backend/utils/i18n.py`, `backend/locales/*` | claves faltantes |
| Handlers IPC | @backend-core | `backend/handlers/*` | consistencia con `@validate_params` |
| Conversion view | @frontend-conversion | `frontend/src/components/conversion/*` | renders innecesarios, re-fetches |
| Formatos view | @frontend-formatos | `frontend/src/components/formatos/*` | render de páginas, memory leaks |
| Sellador view | @frontend-sellador | `frontend/src/components/sellador/*` | re-renders, fugas de ObjectURL |
| Image Optimizer | @frontend-optimizer | `frontend/src/components/image-optimizer/*` | memoria de canvas |
| Preview Panel | @frontend-previews | `frontend/src/components/preview-panel/*` | html to pdf, jspdf leaks |
| Padrones | @frontend-padrones | `frontend/src/components/padron/*` | renders y datos |
| Volantes | @frontend-volantes | `frontend/src/components/volantes/*` | jspdf leaks |
| Reportes campo | @frontend-reportes | `frontend/src/components/reportes-campo/*` | jspdf leaks |
| Informes técnicos UI | @frontend-tech-reports | `frontend/src/components/technical-reports/*` | renders, fugas de workers |
| Panel Aviso UI | @frontend-panel | `frontend/src/components/panel-aviso-corte/*` | memory, fugas pdfjs |
| Historial UI | @frontend-history | `frontend/src/components/history/*` | virtualizado, exports |
| Apariencia UI | @frontend-appearance | `frontend/src/components/settings/*` | CSS vars, performance paint |
| Layout / sidebar | @frontend-layout | `frontend/src/components/layout/*` | renders por cambio de tab |
| Hooks | @frontend-hooks | `frontend/src/hooks/*` | memory leaks, timers |
| IPC bridge TS | @frontend-api | `frontend/src/api.ts` | retries, timeouts |
| Estilos / Tailwind | @frontend-styles | `frontend/src/index.css`, `tailwind.config.js`, `postcss.config.js` | purge, custom utilities |
| Build | @devops | `vite.config.ts`, `electron-builder.yml`, `scripts/*` | tamaño bundle, tiempo build |
| Release | @devops | `.github/workflows/release.yml`, `scripts/bump-version.js` | reproducibilidad, firma |
| Documentación | @docs | `docs/*`, `AGENTS.md`, `CLAUDE.md`, `README.md` | drift, omisiones |

---

## 13. Plantillas de comandos reproducibles

### 13.1 Inventario de archivos

```bash
rg --files backend | wc -l
rg --files frontend/src | wc -l
rg --files electron | wc -l
rg --files tests | wc -l
```

### 13.2 Tamaño por carpeta

```bash
du -sh backend electron frontend/src tests scripts docs
```

### 13.3 Búsqueda de secretos y PII

```bash
rg -i "(api[_-]?key|secret|password|token)" backend frontend electron
```

### 13.4 Localización

```bash
rg -n "\bt\(\"" backend  # usos de t() con string
rg -n "useTranslation\(\)" frontend/src
rg -n "console\.(log|warn|error)" frontend/src
```

### 13.5 Cobertura y lint

```bash
cd backend
pytest --cov=. --cov-report=term-missing --cov-fail-under=70
ruff check .
mypy . || true
cd ../frontend
npx tsc --noEmit
npx vitest run --coverage
cd ..
```

### 13.6 Bundle analyzer

```bash
cd frontend
npx vite build --mode analyze
# abre dist/stats.html
```

### 13.7 IPC payload size

```bash
# Recorre los métodos que más payload generan
rg -n "base64\.b64encode" backend | wc -l
rg -n "MAX_PAYLOAD_SIZE" backend electron
```

---

## 14. Checklist final (antes de cerrar la auditoría)

- [ ] El árbol de archivos fue recorrido (1.3) y comparado con la
      realidad.
- [ ] Todas las pruebas de `npm test` pasan localmente.
- [ ] `ruff check`, `mypy`, `tsc --noEmit` están limpios.
- [ ] No quedan TODOs/FIXMEs críticos sin asignar.
- [ ] Cada hallazgo tiene: severidad, archivo:línea, evidencia,
      fix propuesto.
- [ ] La sección "Hallazgos previos conocidos" (4) se ha **confirmado
      o refutado** con evidencia nueva.
- [ ] Las 8 reglas inquebrantables de `docs/historial.md` se
      verifican una por una.
- [ ] La matriz de dominios (§12) tiene al menos 1 hallazgo o
      confirmación explícita.
- [ ] El reporte final se almacena en `docs/audit-results.md` (no
      aquí) con la fecha de la auditoría.
- [ ] Se ejecuta `git status` y se verifica que **no** se commitea
      `node_modules`, `dist`, `__pycache__`, etc.
- [ ] Se hace commit sólo con el reporte y los tests añadidos.

---

## 15. Salida estructurada esperada

Al cerrar la auditoría, debes producir:

1. **`docs/audit-results.md`** — reporte principal con resumen
   ejecutivo + tabla de hallazgos (severidad, dominio, estado).
2. **`tests/audit_<dominio>_<YYYYMMDD>.py`** o `*.test.ts` — tests
   añadidos como evidencia.
3. **`docs/audit-checklist-<YYYYMMDD>.md`** — checklist final
   firmada.
4. **Un PR** con título `audit: <YYYYMMDD>` que contenga los puntos
   anteriores y un diff neto mínimo.

---

## 16. Apéndices

### 16.1 Glosario mínimo

- **IPC:** Inter-Process Communication.
- **JSON-RPC:** protocolo request/response sobre JSON.
- **Renderer / Main / Preload:** procesos de Electron.
- **Frozen:** ejecutable empaquetado por PyInstaller.
- **WAL:** Write-Ahead Logging de SQLite.
- **Mapping index:** estructura de búsqueda O(1) para ID→RENOMBRE.
- **Run type:** categoría de operación persistida en historial
  (`conversion`, `formato`, `sellador`, etc.).
- **Job:** unidad de trabajo del `JobManager` (nuevo) o
  `process_state` (legacy).

### 16.2 Atajos de teclado del frontend

| Combinación | Acción |
|-------------|--------|
| `Ctrl+1` | Conversión |
| `Ctrl+2` | Panel Aviso de Corte |
| `Ctrl+3` | Formatos PDF |
| `Ctrl+Shift+S` | Sellador |
| `Ctrl+4` | Padrón |
| `Ctrl+5` | Volantes |
| `Ctrl+6` | Historial |
| `Ctrl+7` | Apariencia |
| `Ctrl+8` | Reportes de campo |
| `Ctrl+9` | Optimizador |
| `Ctrl+0` | Generador de Reportes |
| `Ctrl+Shift+I` | Informes técnicos |
| `Ctrl+K` | Command Palette |
| `Delete/Backspace` | Eliminar archivos seleccionados |

### 16.3 Variables de entorno reconocidas

- `ANTARES_IPC_MAX_PAYLOAD_SIZE` (bytes) — default 64 MB.
- `PYTHONIOENCODING` (utf-8) — fijado por el spawner.
- `PYTHONUTF8` (1) — fijado por el spawner.

### 16.4 Rutas de datos (producción)

- **Windows:** `%LOCALAPPDATA%\Antares\` (BD, configs, plugins,
  uploads).
- **macOS:** `~/Library/Application Support/Antares/`.
- **Linux:** `${XDG_DATA_HOME:-~/.local/share}/Antares/`.

---

## 17. Comando rápido "auditoría express"

> Para una revisión de **15 minutos** cuando se necesite triage rápido.
> No sustituye la auditoría completa, pero detecta humo.

```bash
# 1) Lints y tipos
npm run lint:python
npm run typecheck:frontend

# 2) Tests
npm test 2>&1 | tee audit-test.log

# 3) Inventario
rg --files backend | wc -l
rg --files frontend/src | wc -l
rg --files electron | wc -l
rg -c "TODO|FIXME|XXX" backend frontend/src electron | head

# 4) Seguridad rápida
npm audit --omit=dev
pip-audit || true
rg -i "password|secret|api[_-]?key" backend frontend/src electron || echo "ok"

# 5) Hooks y coverage
cd backend && pytest --cov=. --cov-report=term -q | tee ../audit-cov.log
```

Si **cualquiera** falla, abrir un hallazgo crítico de inmediato.

---

## 18. Cierre

Este prompt es deliberadamente exhaustivo. La auditoría real puede
recortar secciones, pero la **estructura y plantilla de hallazgo (§11,
§12, §13)** son obligatorias: sin ellas el reporte se considera
incompleto y se rechaza.

> "La auditoría no es el documento, es el cambio de comportamiento que
> provoca después de leerse." — Anónimo

— Fin del prompt —
