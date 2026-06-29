# Smoke checklist — pendientes de seguridad

Lista corta de flujos que deben quedar **idénticos** tras cada fase de
`SECURITY-IMPLEMENTATION-PLAN.md`. Correr manualmente con datos reales antes
de activar modo `enforce` o flipiar defaults.

## Baseline (Fase 0)

Verificado localmente 2026-06-28:

- `node tests/test-electron-dialogs.js` — 39 ok
- `node tests/test-electron-auth-storage.js` — 23 ok
- `node tests/test-enable-build-signing.js` — 8 ok
- `node tests/test-electron-version.js` — 6 ok
- `node tests/test-html-sanitizer.js` — 27 ok
- `vitest` xlsxSafe / themeValidate / supabase-storage — 18 ok
- `python -m compileall backend` — limpio

`pytest` no corre en el venv local (hermes sin pytest/openpyxl); la suite
Python es canonical en CI.

## 8 flujos a conservar tras cada fase

| # | Flujo | Componentes | Fase que lo toca |
|---|-------|-------------|------------------|
| 1 | Conversión por lotes (Excel → renombrado, destino vía `dialog_dest`) | `conversion.py`, `api.ts` | Fase 1 |
| 2 | Preview panel PDF (logos + Excel + export) | `PreviewPanelView.tsx`, `pdfAssets.ts` | Fase 1, Fase 4 |
| 3 | Reportes de campo (fotos + logos en PDF) | `reportes-campo/utils/export.ts` | Fase 1 |
| 4 | Padrón / Volantes (import Excel) | `padron/excel.ts`, `volantes/utils/import.ts` | Fase 6 (opc) |
| 5 | Panel aviso corte (Excel + imágenes + PDF/DOCX) | `panel_aviso_corte.py` | Fase 1 |
| 6 | Sellador (PDF + sello + output vía `dialog_save`) | `sellador.py`, `SelladorView.tsx` | Fase 1 |
| 7 | DB técnica (import/export Excel) | `database.py` | Fase 1 |
| 8 | Ubicaciones (Excel + export mapas) | `core/ubicaciones/` | Fase 1 |

## Pasar/fallar por fase

Cada fase se considera lista para `enforce`/flip solo si los 8 flujos pasan
sin cambios visibles para el usuario y los tests automatizados siguen verdes.

## Activación de enforce (SEC-003 Capa 2)

El confinamiento positivo está implementado y **off por defecto** (modo `warn`
= observabilidad sin bloqueo). Para activar `enforce`:

1. Verificar los 8 flujos de humo en modo `warn` (sin cambios visibles).
2. Revisar los logs `[SEC-003] <method>: ... no vouched (warn)` — cualquier
   flujo que reporte un mismatch indica una ruta que el frontend envía sin
   pasar por un diálogo nativo. Migrar ese flujo (ej. drag-drop → data URL,
   como ya se hizo en pdfAssets) antes de activar enforce.
3. Arrancar la app con `ANTARES_PATH_VOUCHING=enforce` (env var leída por
   `electron/ipc-router.js` al crear el registro de vouchers).
4. Repetir los 8 flujos de humo. En enforce, rutas no vouched lanzan
   `Ruta no autorizada por el diálogo nativo` antes de llegar al backend.
5. Si los 8 flujos pasan en enforce, considerar flipiar el default a
   `enforce` en `electron/ipc-router.js` (quitar la rama env) — solo tras
   smokes exitosos en Windows/macOS/Linux.

Tests automatizados de confinamiento:
- `tests/test_path_sanitization.py` — helper `guard_user_path`/`resolve_allowed_roots` (stdlib).
- `tests/test_sec003_handler_confinement.py` — confinamiento por handler (CI; deps openpyxl/PIL/pandas).
- `tests/test_sec003_path_confinement_selfcheck.py` — self-check stdlib (corre sin pytest).
- `tests/test-vouched-paths.js` + `tests/test-ipc-router-prepare-params.js` — registry + derivación (Node).

## SEC-005 — firma de código Windows (operacional)

Bug corregido: `scripts/enable-build-signing.js` gateaba con `WINDOWS_CERT_B64`
(env que nunca llega al proceso porque release.yml mapea `CSC_LINK:
secrets.WINDOWS_CERT_B64`). Ahora gatea con `CSC_LINK` (alias `WINDOWS_CERT_B64`
legacy). Test: `tests/test-enable-build-signing.js` (9 ok).

Pasos operacionales (requieren acción humana):
1. Generar un certificado de firma de código Windows (.pfx) — EV u OV.
2. Configurar los secrets del repo: `WINDOWS_CERT_B64` (base64 del .pfx) y
   `WINDOWS_CERT_PASSWORD` (passphrase).
3. Lanzar un release (tag `v*`). En CI, `CSC_LINK` se popula desde el secret →
   el build se firma Y `enable-build-signing.js` flípea
   `verifyUpdateCodeSignature` a true.
4. Verificar la firma del instalador resultante (Properties → Digital
   Signatures) y que electron-updater rechaza un update no firmado.
5. macOS: `mac.sign: false` queda como trabajo futuro (notarización requiere
   APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID + job macOS en release.yml).

## SEC-006 — Electron 42 no-EOL (guard + smoke operacional)

Guard automatizado: `tests/test-electron-version.js` verifica que
`electron >= 39` (no EOL), `electron-builder >= 26`, `electron-updater` y que
el major instalado coincide con el declarado (6 ok). Falla el build si se
regresa a una versión EOL.

Smoke runtime (operacional, requiere correr la app):
1. `npm run dev` — arranca frontend + Electron 42 sin errores de runtime.
2. `npm run build:win` — empaqueta instalador NSIS + portable en Windows.
3. Auto-update staging: publicar un release a un canal de prueba y verificar
   que electron-updater detecta, descarga y aplica el update (con
   `verifyUpdateCodeSignature` según SEC-005).

## SEC-013 — npm ci + audit con registry oficial

Workflows migrados de `npm install` a `npm ci` (reproducible desde lockfile)
con `npm_config_registry: https://registry.npmjs.org` en los pasos de install
y audit (evita proxies/registrys internos que silencien advisories):
`ci.yml`, `pr-fix-loop.yml`, `release.yml`. Lockfiles root+frontend validados
in-sync vía `npm ci --dry-run` (exit 0).

Audit sigue **no bloqueante** (gradual): reporta advisories sin romper CI.
Upgrade path cuando el equipo lo decida: añadir `--audit-level=high` (o
`moderate`) al step de audit y quitar `continue-on-error` / `|| true`.

## SEC-016 — logos del preview fuera de localStorage

`electron/logo-storage.js` (patrón `auth-storage`) persiste los logos del
encabezado del preview CIFRADOS en `userData/logos.json` vía `safeStorage`,
fuera del `localStorage` del renderer. Allowlist estricta de claves
(`antares_preview_logo_left|right`); canales `logo-storage:get|set|remove`
registrados en `ipc-router.js` y expuestos en `preload.js`.

`PreviewPanelView.tsx` migró las 3 funciones de persistencia a IPC async con:
- fallback a `localStorage` si el puente IPC no existe (tests / browser puro);
- migración automática del legado en localStorage → almacenamiento seguro al
  primer load (preserva los logos que el usuario ya tenía);
- guard de hidratación (`hydratedLogos`) para que el estado inicial vacío no
  borre el logo antes de que el load async lo restaure.

Test: `tests/test-electron-logo-storage.js` (23 ok). Smoke manual: abrir el
preview, subir dos logos, reiniciar la app y confirmar que reaparecen; además
verificar que `localStorage` ya no contiene `antares_preview_logo_*` y que
`%APPDATA%/<app>/logos.json` existe sin plaintext.

## SEC-014 — DevTools + reload en producción

- Menú "Ver": `buildAppMenu` (`electron/window-manager.js`) filtra
  `role: 'toggleDevTools'` cuando `app.isPackaged`. `Recargar` se conserva
  (no es sensible). Test: `tests/test-electron-menu.js` (7 ok).
- Atajos de teclado: `before-input-event` bloquea F12 / Ctrl+Shift+I|J|C en
  builds empaquetados (Chromium abre DevTools por teclado aunque el menú lo
  oculte). Dev sigue abriendo DevTools normal.
- Smoke: `npm run dev` → menú muestra DevTools y abre al click. `npm run
  build:win` → el instalable NO muestra DevTools en el menú y F12 no abre.

## SEC-011 — CSP gaps (meta + endurecimiento gradual)

- Meta CSP belt-and-suspenders en `frontend/index.html` (idéntica a la CSP
  de prod del window-manager). En Electron el header de `onHeadersReceived`
  tiene prioridad, así que no afloja la CSP existente; cubre cargas
  no-Electron (vite preview, tests, futuro web build). Test estático:
  `tests/test-html-csp-meta.js` (7 ok) — verifica `default-src 'self'`,
  `script-src 'self'` sin `'unsafe-eval'`/`'unsafe-inline'`, img-src data/blob.
- **Diferido a smoke visual** (CSP gradual): eliminar `'unsafe-inline'` de
  `style-src` en prod requiere migrar estilos inline a hashes/nonce sin
  romper Tailwind/framer-motion. Mantener `'unsafe-inline'` en style-src
  como tech debt hasta que un smoke visual confirme que quitarlo no rompe la
  UI; entonces aplicar nonce por sesión en `window-manager.js`. La meta CSP
  ya mitiga lo no-Electron.
- Dev CSP: `script-src ... 'unsafe-inline'` se mantiene solo en dev (Vite
  HMR); no cambiar prod.

## SEC-017 — sanitizer HTML de PDF (DOMPurify opt-in + fallback regex)

- `shared/html-sanitizer.js` cablea DOMPurify (basado en DOM, más robusto)
  como **opt-in** via `ANTARES_PDF_SANITIZER=purify`, con fallback al
  sanitizer regex actual si DOMPurify/jsdom no cargan (prod). El contract
  (`sanitizeHtmlForPdf` → HTML + CSP meta) y el allowlist de data-URIs se
  mantienen. `_collapseUnsafeUrls` re-aplica el allowlist de `url()` sobre
  la salida de DOMPurify (defense-in-depth).
- Test: `tests/test-html-sanitizer.js` (27 ok) — cubre los payloads
  históricos + SEC-017 (`<img onerror>`, `javascript: href`, `@import`,
  preserva `<meta charset>`/placeholder `<svg>`, strip `<meta http-equiv>`)
  en ambos paths (regex default + DOMPurify opt-in).
- **Diferido a smoke visual**: el default sigue siendo regex (`ponytail:` —
  no arriesgar el output de PDF sin verificar). Upgrade path: flipar el
  default a `'purify'` (o leer `ANTARES_PDF_SANITIZER=purify` por defecto)
  tras confirmar que los PDFs de reportes/volantes/padrón/panel-aviso-corte
  se ven idénticos al de antes.

## SEC-017 (complemento) — override de dompurify

`npm audit` (registry oficial, desbloqueado por SEC-013) reportó
`dompurify@3.4.1` (transitivo de `jspdf@4.2.1`) vulnerable a GHSA-76mc
(moderate, `<3.4.7`). Como SEC-017 cablea DOMPurify al sanitizer de PDF,
se añadió `"overrides": { "dompurify": "^3.4.11" }` en
`frontend/package.json` + regeneración del lockfile. Re-audit: **0
vulnerabilidades** (info/low/moderate/high/critical = 0). El test del
sanitizer sigue 27/27 con DOMPurify 3.4.11.

## SEC-012 — parsing XLSX no confiado en el renderer

Hardening in-renderer (opción alternativa del plan) implementado en
`frontend/src/utils/xlsxSafe.ts` y aplicado a los 3 sitios de parseo
(`PreviewPanelView.tsx`, `padron/excel.ts`, `volantes/utils/import.ts`):
- `assertXlsxSize` — rechaza >10MB antes de leer (mitiga ReDoS/memory).
- `safeRead` — `cellFormula:false` + `cellHTML:false` (menos superficie).
- `safeSheetToJson` — range-limit real a 50k filas (el parser no recorre
  filas > cap aunque `!ref` las declare) + flag `truncated` para aviso.
- `sanitizeRecord` — strip de `__proto__`/`constructor`/`prototype` por
  fila-objeto (mitiga prototype pollution, CVE-2023-30533 — ya parcheado en
  `@e965/xlsx@0.20.3` de todas formas).
Tests: `xlsxSafe.test.ts` + `padron/excel.test.ts` +
`volantes/utils/import.test.ts` + `preview-panel/xlsxParse.test.ts` (22 ok).

**Migración al backend (opción preferida del plan) — diferida como
opcional.** Mover el parsing a un handler Python (`openpyxl`, sin
prototype pollution por diseño) con feature flag `ANTARES_XLSX_PARSER=
backend` es más seguro pero invasivo y choca con la UX actual: el renderer
parsea `ArrayBuffer` de `File` de `<input>`/drag-drop que **no tienen path
de disco vouched** (SEC-003 exige path vouched para el backend), así que
migrar forzaría un round-trip a disco + vouching por cada Excel y rompería
el flujo drag-drop/in-memory. El hardening in-renderer ya cubre las dos
clases de CVE (DoS + prototype pollution) para un P2. Upgrade path si se
decide: handler `excel_parse` + flag + migración de los 3 callers + tests
de rechazo fuera de `allowed_roots`.



