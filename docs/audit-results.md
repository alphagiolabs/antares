# Auditoría Técnica ANTARES — 2026-06-12

> Auditoría end-to-end del repositorio ANTARES (Electron + Python + React).
> Principio aplicado: *leer antes de opinar, ejecutar antes de afirmar*.

---

## 1. Resumen ejecutivo

La auditoría recorrió las capas críticas de la aplicación: IPC allowlist,
backend handlers, sanitización de paths, generación de PDF/HTML, dependencias,
lint, tipos y tests. Se ejecutaron los comandos oficiales del proyecto y se
levantaron logs reproducibles.

**Estado general:** La aplicación arranca y pasa su suite principal
(`npm test`), pero presenta **desviaciones funcionales y de seguridad que
deben corregirse antes de una release**.

**Correcciones aplicadas durante la auditoría:**

- Sincronización de la IPC allowlist (`electron/ipc-methods.js`) con los
  métodos usados por el frontend (`history_export`, `history_delete_many`,
  `db_parse_mapping`, `db_validate_mapping`, `db_mapping_template`).
- Limpieza de lint de Python (`ruff check backend tests scripts`) a cero
  errores, sin romper tests.

**Problemas abiertos prioritarios:**

1. Dependencias Python con vulnerabilidades conocidas (Pillow, pypdf,
   WeasyPrint, python-multipart, urllib3, etc.).
2. Test de frontend intermitente por timeout (`App.test.tsx`).
3. Divergencia de versiones entre `package.json`, `pyproject.toml` y
   `frontend/package.json`.
4. 44 errores de `mypy backend` (algunos reales, la mayoría stubs faltantes).

---

## 2. Métricas de línea base

| Comando | Resultado | Evidencia |
|---------|-----------|-----------|
| `npm test` | 306 passed (pytest) + 88 passed (Node integration) | `audit-npm-test-after2.log` |
| `ruff check backend tests scripts` | 0 errores | `audit-ruff.log` / `audit-ruff-fix.log` |
| `mypy backend` | 44 errores | `audit-mypy.log` |
| `cd frontend && npx tsc --noEmit` | 0 errores | `audit-typecheck.log` |
| `cd frontend && npx vitest run` | 132 passed, 1 failed (timeout) | `audit-vitest.log` |
| `npm audit --omit=dev` | 0 vulnerabilidades | `audit-npm-audit.log` |
| `pip-audit` | 35 CVEs en 12 paquetes | `audit-pip-audit.json` |

---

## 3. Tabla de hallazgos

| ID | Título | Severidad | Categoría | Dominio | Estado |
|----|--------|-----------|-----------|---------|--------|
| H-01 | Allowlist IPC desincronizada con `frontend/src/api.ts` | high | security | IPC Router | **corregido** |
| H-02 | Dependencias Python con CVEs abiertas | high | security | Dependencias | abierto |
| H-03 | WeasyPrint vulnerable a SSRF bypass por redirect | high | security | Dialogs / PDF | abierto |
| H-04 | Test `App.test.tsx` hace timeout de forma intermitente | medium | testing | Layout / App | abierto |
| H-05 | Divergencia de versiones entre manifiestos | medium | compat | Build / Release | abierto |
| H-06 | `mypy backend` reporta 44 errores | medium | quality | Backend general | abierto |
| H-07 | `console.log`/`error` en `preload.js` visibles en producción | medium | ux | Shell Electron | abierto |
| H-08 | `pypdf` emite deprecation warnings en tests | low | reliability | Sellador PDF | abierto |
| H-09 | Sanitización `html_to_pdf` duplicada en cliente y Electron | low | architecture | IPC bridge TS | abierto |
| H-10 | Plugin loader AST sandbox no aisla runtime | low | security | Plugins | abierto |
| H-11 | `FrontendStatusBar.tsx` no renderiza nada | low | ux | Layout | abierto |
| H-12 | `npm test` no ejecuta la suite Vitest del frontend | info | testing | Build | abierto |

---

## 4. Detalle de hallazgos

### H-01 — Allowlist IPC desincronizada con `frontend/src/api.ts`

- **Severidad:** high
- **Categoría:** security / reliability
- **Dominio:** IPC Router (`electron/ipc-methods.js`, `electron/preload.js`,
  `electron/ipc-router.js`, `frontend/src/api.ts`)
- **Ubicación:** `electron/ipc-methods.js:7-25`
- **Síntoma:** El frontend invoca cinco métodos que no estaban en
  `ALLOWED_RENDERER_METHODS`: `history_export`, `history_delete_many`,
  `db_parse_mapping`, `db_validate_mapping`, `db_mapping_template`. Esto hace
  que las funciones `api.historyExport`, `api.historyDeleteMany`,
  `api.dbParseMapping`, `api.dbValidateMapping` y `api.generateMappingTemplate`
  fallen con `IPC method not allowed: <method>`.
- **Reproducción:**
  1. Ejecutar la app.
  2. Ir al historial y seleccionar "Exportar CSV filtrado" o borrar varias
     filas.
  3. Observar el rechazo en preload o en ipc-router.
- **Evidencia:**
  - `frontend/src/api.ts` llama a `'history_export'` (línea ~198),
    `'history_delete_many'` (línea ~193), `'db_parse_mapping'` (línea ~215),
    `'db_validate_mapping'` (línea ~217) y `'db_mapping_template'` (línea
    ~212).
  - `electron/ipc-methods.js` no los incluía en `BACKEND_METHODS` antes del
    fix.
- **Causa raíz:** Los nuevos handlers del backend se registraron y se
  consumieron desde el frontend sin actualizar la allowlist centralizada.
- **Propuesta de fix:**
  - Agregar los métodos faltantes a `BACKEND_METHODS` en
    `electron/ipc-methods.js`.
  - Añadir un test de regresión que compare los métodos usados en
    `frontend/src/api.ts` contra `ALLOWED_RENDERER_METHODS`
    (`tests/test-electron-ipc-allowlist.js`).
- **Estado:** corregido en esta auditoría. Ver diff en `electron/ipc-methods.js`
  y el test nuevo `tests/test-electron-ipc-allowlist.js`.

---

### H-02 — Dependencias Python con CVEs abiertas

- **Severidad:** high
- **Categoría:** security
- **Dominio:** Dependencias del backend
- **Ubicación:** `pyproject.toml`, entorno virtual
- **Síntoma:** `pip-audit` detecta 35 vulnerabilidades en 12 paquetes,
  incluyendo librerías que procesan archivos de usuario.
- **Reproducción:**
  1. `pip-audit --format=json > audit-pip-audit.json`
- **Evidencia:** `audit-pip-audit.json`
- **Paquetes relevantes para ANTARES:**

| Paquete | CVE / GHSA | Fix version | Impacto en ANTARES |
|---------|------------|-------------|--------------------|
| Pillow | CVE-2026-25990, CVE-2026-40192, CVE-2026-42308, CVE-2026-42309, CVE-2026-42310, CVE-2026-42311 | 12.2.0 | **Alto:** procesa todas las imágenes de usuario. PSD/FITS/PDF maliciosos pueden causar DoS o corrupción de memoria. |
| pypdf | CVE-2026-40260, CVE-2026-41168, CVE-2026-41312, CVE-2026-41313, CVE-2026-41314, CVE-2026-48155, CVE-2026-48156 | 6.12.0 | **Alto:** usado en sellador y formatos PDF. PDFs maliciosos pueden consumir RAM o tiempo de CPU. |
| WeasyPrint | CVE-2025-68616 / GHSA-983g-wfc7-gwmv | 68.0 | **Medio-Alto:** render HTML→PDF en backend (`technical_reports`). Bypass de `url_fetcher` por redirect. |
| lxml | PYSEC-2026-87 / CVE-2026-41066 | 6.1.0 | **Medio:** usado en DOCX rendering de panel aviso de corte. Permite lectura de archivos locales si se parsea XML no confiable. |
| python-multipart | CVE-2026-24486, CVE-2026-40347, CVE-2026-42561 | 0.0.27 | **Bajo:** dependencia transitiva de Starlette/FastAPI; ANTARES no expone servidor HTTP. |
| starlette | PYSEC-2026-161 / CVE-2026-48710 | 1.0.1 | **Bajo:** mismo motivo; no hay servidor HTTP expuesto. |
| urllib3 | CVE-2026-44431, CVE-2026-44432 | 2.7.0 | **Bajo:** dependencia transitiva; no se usa streaming desde orígenes no confiables. |
| aiohttp | CVE-2026-34993, CVE-2026-47265 | 3.14.0 | **Bajo:** transitivo; no se expone servidor. |
| cryptography | PYSEC-2026-36 / CVE-2026-39892 | 46.0.7 | **Medio:** usada indirectamente por WeasyPrint/pdf; buffer overflow con buffers no contiguos. |
| pyjwt | PYSEC-2026-175..179 | 2.13.0 | **Bajo:** no se usa JWT en la lógica de negocio. |
| idna | CVE-2026-45409 | 3.15 | **Bajo:** no se validan dominios de usuario. |
| torch | CVE-2025-3000 | sin fix | **Medio:** usado por rembg/EasyOCR en background removal. `torch.jit.script` tiene corrupción de memoria. |

- **Propuesta de fix:**
  1. Actualizar `pyproject.toml` con versiones mínimas que cierren las CVEs
     (`Pillow>=12.2.0`, `pypdf>=6.12.0`, `WeasyPrint>=68.0`, `lxml>=6.1.0`,
     `python-multipart>=0.0.27`, etc.).
  2. Revisar si `torch` / `rembg` son estrictamente necesarios en producción;
     si no, mover a `[project.optional-dependencies]` o eliminar.
  3. Añadir `pip-audit` al CI para bloquear nuevas CVEs críticas.
- **Estado:** abierto.

---

### H-03 — WeasyPrint vulnerable a SSRF bypass por redirect

- **Severidad:** high
- **Categoría:** security
- **Dominio:** Dialogs / PDF (`backend/handlers/technical_reports.py`)
- **Ubicación:** `backend/handlers/technical_reports.py` (handler Python
  `html_to_pdf` aún registrado)
- **Síntoma:** WeasyPrint 67.0 sigue la redirección HTTP internamente sin
  revalidar el destino contra un `url_fetcher` personalizado. Aunque el
  frontend usa el renderer Electron y sanitiza HTML, el handler Python
  permanece registrado y disponible para cualquier llamada que llegue por
  IPC.
- **Reproducción:**
  1. Ver que `html_to_pdf` sigue en `BACKEND_METHODS` de
     `electron/ipc-methods.js`.
  2. Ver que `backend/handlers/technical_reports.py` implementa
     `_sanitize_html_for_pdf` + WeasyPrint.
- **Evidencia:** `audit-pip-audit.json` reporta CVE-2025-68616.
- **Propuesta de fix:**
  - Opción A (preferida): eliminar el handler Python `html_to_pdf` y dejar
    `electron/dialog-handlers.js::renderHtmlToPdf` como única implementación.
  - Opción B: actualizar WeasyPrint a >= 68.0 y seguir manteniendo ambos
    caminos, documentando cuál se usa.
- **Estado:** abierto.

---

### H-04 — Test `App.test.tsx` hace timeout de forma intermitente

- **Severidad:** medium
- **Categoría:** testing
- **Dominio:** Layout / App (`frontend/src/__tests__/App.test.tsx`)
- **Ubicación:** `frontend/src/__tests__/App.test.tsx:69`
- **Síntoma:** Vitest reporta 132 passed / 1 failed. El test
  `"does not render the removed shared header for any tool"` excede 5000 ms.
- **Reproducción:**
  1. `cd frontend && npx vitest run`
- **Evidencia:** `audit-vitest.log`
- **Causa raíz:** El test itera sobre todas las herramientas y el render
  completo de `App` no se estabiliza dentro del timeout (posible loop de
  efectos o renders retrasados sin `await findBy...`).
- **Propuesta de fix:**
  - Aumentar el timeout local del test o estabilizar los efectos.
  - Reemplazar `render(<App />)` por un helper que espere a que el tab esté
    listo.
- **Estado:** abierto.

---

### H-05 — Divergencia de versiones entre manifiestos

- **Severidad:** medium
- **Categoría:** compat
- **Dominio:** Build / Release
- **Ubicación:** `package.json:3`, `pyproject.toml:13`,
  `frontend/package.json:3`, `backend/version.py`
- **Síntoma:**
  - `package.json` root: `0.10.4`
  - `pyproject.toml`: `0.10.6`
  - `frontend/package.json`: `0.10.6`
  - `backend/version.py`: `0.10.4`
- **Reproducción:** `grep -n version package.json pyproject.toml frontend/package.json backend/version.py`
- **Evidencia:** lectura directa de los archivos.
- **Propuesta de fix:**
  - Ejecutar `npm run bump:patch` y verificar que `scripts/bump-version.js`
    sincronice las cuatro fuentes.
  - Añadir un test que falle si las versiones difieren.
- **Estado:** abierto.

---

### H-06 — `mypy backend` reporta 44 errores

- **Severidad:** medium
- **Categoría:** quality
- **Dominio:** Backend general
- **Ubicación:** 16 archivos (ver `audit-mypy.log`)
- **Síntoma:** `mypy backend` no pasa. Algunos errores son stubs faltantes
  (`openpyxl`, `psutil`, `lxml`, `weasyprint`), otros son inconsistencias
  reales (`None` no chequeado, `Any` retornado en funciones tipadas,
  redefinición de `res`).
- **Evidencia:** `audit-mypy.log`
- **Errores reales destacados:**
  - `backend/core/technical_reports/models.py:185-200`: accesos a `.get` e
    `.items` sobre posible `None`.
  - `backend/handlers/conversion.py:73`: nombre `res` redefinido.
  - `backend/handlers/conversion.py:180`: `Job | None` sin chequeo.
  - `backend/core/format_strategies/visual_overlay.py:95-167`: operaciones
    aritméticas con `None`.
- **Propuesta de fix:**
  - Instalar stubs faltantes (`types-openpyxl`, `types-psutil`, `lxml-stubs`).
  - Corregir los errores reales de tipado, empezando por los de acceso a
    `None`.
  - Agregar `mypy backend` al CI.
- **Estado:** abierto.

---

### H-07 — `console.log`/`error` en `preload.js` visibles en producción

- **Severidad:** medium
- **Categoría:** ux / security
- **Dominio:** Shell Electron (`electron/preload.js`)
- **Ubicación:** `electron/preload.js:6,18,26`
- **Síntoma:** El preload imprime mensajes de inicio y errores por
  `console.log`/`console.error`. En producción estos mensajes son visibles
  en DevTools y pueden filtrar información interna.
- **Propuesta de fix:**
  - Reemplazar por `console.debug` o envolver en `if (process.env.NODE_ENV
    !== 'production')`.
- **Estado:** abierto.

---

### H-08 — `pypdf` emite deprecation warnings en tests

- **Severidad:** low
- **Categoría:** reliability
- **Dominio:** Sellador PDF (`backend/core/sellador.py`)
- **Ubicación:** `tests/test_sellador_handler.py` (warnings de
  `pypdf._page.py:1183`)
- **Síntoma:** Los tests del sellador muestran 9 deprecation warnings por
  `PageObject.replace_contents()` sobre páginas no asignadas a un writer.
- **Propuesta de fix:**
  - Refactorizar `sellador.py` para adjuntar la página al `PdfWriter` antes
    de mutar, o usar `PdfWriter(clone_from=...)`.
- **Estado:** abierto.

---

### H-09 — Sanitización `html_to_pdf` duplicada en cliente y Electron

- **Severidad:** low
- **Categoría:** architecture
- **Dominio:** IPC bridge TS / Dialogs PDF
- **Ubicación:** `frontend/src/api.ts`, `electron/dialog-handlers.js`,
  `backend/handlers/technical_reports.py`
- **Síntoma:** Existen tres copias de `_sanitizeHtmlForPdf` con regex
  similares. Cualquier cambio de seguridad debe recordarse en tres lugares.
- **Propuesta de fix:**
  - Extraer la función a un módulo compartido (p. ej.
    `frontend/src/utils/htmlSanitizer.ts`) e importarlo desde `api.ts`.
  - El backend Python debería reutilizar la misma lógica o eliminarse (ver
    H-03).
- **Estado:** abierto.

---

### H-10 — Plugin loader AST sandbox no aisla runtime

- **Severidad:** low
- **Categoría:** security
- **Dominio:** Plugins (`backend/core/plugins.py`)
- **Síntoma:** El loader filtra imports, builtins y atributos por AST, pero
  ejecuta el módulo en el mismo proceso Python con `exec_module`.
- **Propuesta de fix:**
  - Documentar que los plugins son *use at your own risk* y solo se cargan
    desde `user_data_path`.
  - Idealmente, mover la ejecución a un subproceso sin acceso a red ni
    filesystem fuera de un directorio temporal.
- **Estado:** abierto (conocido, ver §4.10 de `AUDIT-PROMP.md`).

---

### H-11 — `FrontendStatusBar.tsx` no renderiza nada

- **Severidad:** low
- **Categoría:** ux
- **Dominio:** Layout
- **Ubicación:** `frontend/src/components/layout/FrontendStatusBar.tsx`
- **Síntoma:** El componente existe pero su cuerpo es `return null;`.
- **Propuesta de fix:**
  - Implementar usando `useBackendStatus` o eliminar el archivo si no tiene
    función.
- **Estado:** abierto.

---

### H-12 — `npm test` no ejecuta la suite Vitest del frontend

- **Severidad:** info
- **Categoría:** testing
- **Dominio:** Build
- **Ubicación:** `package.json:24`
- **Síntoma:** El script `npm test` solo ejecuta pytest y tests Node. La
  suite Vitest del frontend debe correrse con un comando separado.
- **Propuesta de fix:**
  - Añadir `test:frontend`/`test:unit` a `package.json` y considerar incluir
    `cd frontend && vitest run` en `npm test` una vez que H-04 esté
    resuelto.
- **Estado:** abierto.

---

## 5. Matriz de riesgo

| Amenaza | Probabilidad | Impacto | Riesgo | Mitigación actual |
|---------|--------------|---------|--------|-------------------|
| PDF/PSD malicioso causa DoS/crash (Pillow/pypdf) | media | alto | **alto** | Ninguna específica; se procesan con versiones vulnerables. |
| Bypass de `url_fetcher` en WeasyPrint | baja | alto | **medio** | El frontend usa renderer Electron y sanitiza HTML. |
| Allowlist desincronizada bloquea funcionalidad | baja | medio | **medio** | Corregido en esta auditoría + test de regresión. |
| Test flaky frena CI/release | media | medio | **medio** | Ninguna; se debe estabilizar. |
| Divergencia de versiones genera release inconsistente | baja | medio | **bajo** | Verificar `bump-version.js`. |

---

## 6. Recomendaciones priorizadas

1. **Actualizar dependencias críticas** (`Pillow`, `pypdf`, `WeasyPrint`,
   `lxml`, `python-multipart`, `urllib3`, `aiohttp`, `cryptography`) y
   añadir `pip-audit` al CI.
2. **Decidir el destino del handler Python `html_to_pdf`** y eliminarlo si
   el renderer Electron es el camino oficial.
3. **Estabilizar el test `App.test.tsx`** que hace timeout.
4. **Sincronizar versiones** entre `package.json`, `frontend/package.json`,
   `pyproject.toml` y `backend/version.py`.
5. **Cerrar errores reales de `mypy`** e incorporar stubs faltantes.
6. **Limpiar logs de `preload.js`** para producción.
7. **Consolidar `_sanitizeHtmlForPdf`** para evitar duplicación.
8. **Revisar el plugin loader** para documentar o endurecer su modelo de
   amenazas.

---

## 7. Diff de cambios aplicados

```diff
# electron/ipc-methods.js
  'db_records', 'db_import', 'db_export', 'db_clear', 'db_template',
+ 'db_mapping_template', 'db_parse_mapping', 'db_validate_mapping',
  'db_fields', 'db_fields_update', 'db_fields_reset',
  'db_columns',

  'history_list', 'history_get', 'history_delete', 'history_save',
+ 'history_delete_many',
+ 'history_export',

# backend/core/history.py
+ from backend.core.run_types import ALL_RUN_TYPES  # noqa: F401

# backend/handlers/database.py, tests/*, scripts/generate_brand_assets.py
# (reorden/limpieza de imports según ruff)
```

Archivos modificados por la auditoría:

- `electron/ipc-methods.js`
- `backend/core/history.py`
- `backend/handlers/database.py`
- `scripts/generate_brand_assets.py`
- `tests/panel_aviso_corte/test_rendering.py`
- `tests/test_jobs.py`
- `tests/test_reentrant_lock.py`
- `tests/test_sellador_handler.py`
- `tests/test-electron-ipc-allowlist.js` (nuevo)
- `docs/audit-results.md` (nuevo)
- `docs/audit-checklist.md` (nuevo)

---

*Auditoría ejecutada el 2026-06-12. Logs y reportes adicionales en los
archivos `audit-*.log` / `audit-*.json` del directorio raíz.*
