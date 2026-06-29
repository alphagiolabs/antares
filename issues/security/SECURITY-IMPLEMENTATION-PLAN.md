# Plan de implementacion pendiente de seguridad - Antares

Fecha: 2026-06-28

Base revisada:

- `SECURITY-AUDIT-REPORT.md`
- `cambios_auditoria_security.md`
- Estado actual del codigo en Electron + React/Vite/TypeScript + Python IPC + Supabase

Objetivo: cerrar los pendientes reales sin afectar la funcionalidad existente. La estrategia es aditiva: primero observar y cubrir con tests, luego activar controles estrictos por flujo, manteniendo compatibilidad de IPC y UX.

## Resumen

La mayoria de los hallazgos SEC-001..SEC-019 ya tienen implementacion. No obstante, hay cierres parciales o pendientes operativos que conviene tratar como issues de implementacion:

| Prioridad | Issue | Estado actual | Pendiente real |
|---|---|---|---|
| P1 | SEC-003 / SEC-004 | Hay denylist de directorios de sistema y helper `allowed_roots`; el propio codigo documenta que la "Capa 2" de vouching por dialogo nativo falta cablearla. | Implementar vouching positivo de rutas/raices desde Electron main y aplicarlo en handlers que leen/escriben archivos. |
| P1 | SEC-005 | Esqueleto listo; `verifyUpdateCodeSignature` sigue `false` por defecto y macOS `sign: false`. | Activar firma real con certificado/secrets y verificar updates firmados. |
| P1 | SEC-006 | Electron subido a 42.x; segun la timeline oficial de Electron 42 esta soportado hasta 2026-10-20. | Smoke runtime manual/automatizado de app empaquetada y flujos criticos. |
| P2 | SEC-013 | `npm audit` esta en CI, pero no bloquea, no fuerza registry oficial y CI usa `npm install`. | Hacer auditoria reproducible y gradualmente bloqueante para high/critical. |
| P2 | SEC-016 | Se valido tema/CSS, pero los logos siguen guardandose como `dataUrl` en `localStorage`. | Migrar logos persistidos fuera de `localStorage` sin cambiar la experiencia del usuario. |
| P3 | SEC-014 | Se oculta DevTools en prod, pero `reload` sigue en el menu empaquetado. | Quitar tambien `reload` en builds empaquetadas. |
| P3 | SEC-011 | Hay CSP en `index.html` y headers, pero `style-src 'unsafe-inline'` sigue en prod. | Reducir inline styles gradualmente; no quitarlo de golpe. |
| P3 | SEC-017 | DOMPurify existe como opt-in (`ANTARES_PDF_SANITIZER=purify`), regex sigue siendo default. | Empaquetar y activar DOMPurify por defecto tras smoke visual de PDFs. |
| P2 opcional | SEC-012 | Implementacion hibrida segura (`xlsxSafe`) en renderer; panel-aviso-corte ya parsea en backend. | Si se quiere aislamiento maximo, migrar los 3 parseos restantes al backend por etapas. |

## Evidencia clave

- SEC-003: `backend/utils/paths.py` dice que el confinamiento positivo por dialogo nativo "requiere wiring del frontend"; solo `sellador` pasa `allowed_roots`.
- SEC-004: `electron/dialog-handlers.js` acepta `localImagePaths` si son absolutos, tienen extension de imagen y no caen en directorios de sistema; falta comprobar que la ruta haya sido elegida por dialogo nativo.
- SEC-005: `electron-builder.yml` mantiene `verifyUpdateCodeSignature: false` y `mac.sign: false`.
- SEC-013: `.github/workflows/ci.yml` usa `npm install`, `npm audit ... || true` y `continue-on-error: true`.
- SEC-016: `PreviewPanelView.tsx` aun usa `localStorage.setItem(key, JSON.stringify({ dataUrl, fileName }))` para logos.
- SEC-014: `window-manager.js` filtra `toggleDevTools`, pero deja `role: 'reload'`.
- SEC-017: `shared/html-sanitizer.js` carga DOMPurify solo si `ANTARES_PDF_SANITIZER=purify`.

## Principios para no romper funcionalidad

1. Mantener los contratos IPC existentes y agregar campos opcionales, nunca reemplazarlos de golpe.
2. Cualquier restriccion nueva de rutas debe iniciar en modo compatible o por flujo ya migrado.
3. Si un archivo no tiene voucher de Electron main, usar fallback funcional seguro: data URL, dialogo nativo, o mensaje claro al usuario.
4. Cada cambio debe tener tests unitarios y un smoke de flujo real antes de activar modo estricto.
5. La firma de codigo debe ser no-op sin secrets hasta que exista el certificado real.

## Fase 0 - Baseline antes de tocar seguridad

Objetivo: congelar comportamiento esperado.

Pasos:

1. Ejecutar checks locales disponibles:
   - `npm run typecheck:frontend`
   - `npm run lint:python`
   - `npm test`
2. Si el entorno local no tiene dependencias, ejecutar al menos:
   - tests Node de Electron relacionados con dialogos, preload, auth-storage, sanitizer y build-signing.
   - vitest de `xlsxSafe`, `themeValidate`, `supabase-storage` y `useAuthThrottle`.
3. Guardar fixtures de humo:
   - Excel real para padron, volantes, preview-panel y panel-aviso-corte.
   - PDF/export real con logos e imagenes.
   - conversion por lotes con destino seleccionado por dialogo.

Salida esperada: una lista corta de flujos que deben seguir identicos tras cada fase.

## Fase 1 - SEC-003 / SEC-004: vouching de rutas

Objetivo: que un renderer comprometido no pueda inventar rutas locales y hacer que backend/main las lea o escriba fuera de lo que el usuario eligio.

Implementacion propuesta:

1. Crear en Electron main un registro de rutas vouched, por ejemplo `electron/vouched-paths.js`.
   - Registrar rutas/raices devueltas por `dialog_files`, `dialog_folder`, `dialog_dest` y `dialog_save`.
   - Canonicalizar con `path.resolve`.
   - Guardar tipo: `read-file`, `read-root`, `write-file`, `write-root`.
   - TTL por sesion o limpieza al cerrar ventana.
2. Mantener las respuestas actuales de dialogos (`paths`, `folder`) y agregar metadatos opcionales:
   - `vouchedRoots`
   - `vouchedPaths`
   Esto preserva compatibilidad.
3. En `electron/ipc-router.js`, antes de enviar params al backend:
   - Remover cualquier `allowed_roots` que venga del renderer.
   - Derivar `allowed_roots` desde el registro confiable del main process.
   - Rechazar o advertir si un metodo sensible trae rutas no vouched.
4. Aplicar validacion positiva en backend:
   - `database`: `db_import`, `db_export`, `db_template`, `db_parse_mapping`.
   - `conversion`: `files`, `destino`, `mapping_path`.
   - `optimizer`: `output_path`, `output_folder`.
   - `formatos`: `output_path`.
   - `panel_aviso_corte`: `image_paths`, `output_path`, `template`.
   - `ubicaciones`: export/render paths en `backend/core/ubicaciones`.
   - `sellador`: mantener lo ya hecho y cubrir pruebas de regresion.
5. SEC-004 especifico:
   - `html_to_pdf` solo debe reemplazar `localImagePaths` si la ruta esta vouched.
   - Si una imagen viene de un `<input type=file>` sin voucher, convertirla a data URL/comprimida en renderer en vez de pasar la ruta de disco.
   - Mantener `outputPath` para export directo a disco, pero validar que venga de `dialog_save`.

Modo de activacion:

1. Primer PR: modo `warn` en Electron main para registrar rutas no vouched sin bloquear.
2. Segundo PR: migrar flujos frontend a dialogos/vouchers.
3. Tercer PR: activar bloqueo para metodos ya migrados.
4. Cuarto PR: quitar fallback legacy si los smokes pasan.

Tests:

- Node: dialogos registran vouchers; `html_to_pdf` rechaza `localImagePaths` no vouched; acepta rutas vouched.
- Pytest: cada handler rechaza rutas fuera de `allowed_roots` y conserva rutas validas.
- Smoke: export PDF con imagenes, conversion por lotes, import/export Excel, panel-aviso-corte DOCX/PDF.

## Fase 2 - SEC-005 / SEC-006: release seguro y smoke runtime

SEC-005 firma:

1. Windows:
   - Obtener certificado de firma `.pfx`.
   - Configurar secrets `WINDOWS_CERT_B64` y `WINDOWS_CERT_PASSWORD`.
   - Ejecutar release dry-run.
   - Verificar que `scripts/enable-build-signing.js` cambia `verifyUpdateCodeSignature` a `true` en CI con certificado.
   - Verificar instalador con `Get-AuthenticodeSignature`.
   - Tras primer release firmado, evaluar dejar `verifyUpdateCodeSignature: true` permanente.
2. macOS, solo si se distribuye:
   - Reemplazar `sign: false`.
   - Configurar Developer ID y notarization.
   - Agregar verificacion de notarizacion al workflow.

SEC-006 smoke:

1. `npm run dev`: abrir ventana, login, persistencia de sesion, dialogos, generacion PDF, sellador, import Excel.
2. `npm run build:win`: instalar/abrir app empaquetada.
3. Verificar `process.versions.electron` y `process.versions.chrome`.
4. Probar actualizacion con un release de staging firmado.

Tests:

- Mantener `tests/test-electron-version.js`.
- Agregar smoke script opcional que lea version Electron/Chrome desde app empaquetada.

## Fase 3 - SEC-013: supply-chain reproducible

Objetivo: que CI detecte CVEs de npm con resultados reproducibles.

Pasos:

1. Cambiar workflows de `npm install` a `npm ci` en:
   - `.github/workflows/ci.yml`
   - `.github/workflows/release.yml`
   - `.github/workflows/pr-fix-loop.yml`
2. Cambiar `audit:npm` para forzar registry oficial:
   - `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org`
   - repetir en `frontend`.
3. Mantener inicialmente un job no bloqueante programado para triage.
4. Crear lista de excepciones documentadas si aparece una CVE sin fix.
5. Luego convertir high/critical a bloqueante en PRs.
6. Alternativa o complemento: `osv-scanner` sobre lockfiles.

Tests:

- CI verde con `npm ci`.
- Job de audit produce output incluso si el mirror local no soporta audit.
- Verificar que `package-lock.json` y `frontend/package-lock.json` no derivan.

## Fase 4 - SEC-016: logos fuera de localStorage

Objetivo: conservar la persistencia de logos sin guardar imagenes como `dataUrl` en Web Storage.

Implementacion propuesta:

1. Crear almacenamiento en Electron main:
   - `electron/logo-storage.js`
   - guardar bajo `app.getPath('userData')/logos`
   - nombres internos por lado (`left`, `right`) y hash/version.
   - permisos best-effort `0600`.
2. Exponer IPC minimo:
   - `logo-storage:get`
   - `logo-storage:set`
   - `logo-storage:remove`
3. Crear adapter frontend:
   - `frontend/src/lib/logo-storage.ts`
   - si Electron no esta disponible, fallback a memoria o IndexedDB.
4. Migracion suave:
   - Al iniciar `PreviewPanelView`, leer claves antiguas de `localStorage`.
   - Si existen, mover al storage nuevo y borrar claves antiguas.
   - Mantener el mismo comportamiento visible: logos aparecen igual que antes.
5. Agregar boton/accion "Borrar logos guardados" si no existe.

Tests:

- Node: round-trip, remove, rechazo de claves invalidas, archivo escrito en userData.
- Vitest: migracion desde `localStorage`, fallback sin Electron, UI conserva logos.
- Smoke: seleccionar logos, cerrar/reabrir app, exportar PDF.

## Fase 5 - SEC-014 / SEC-011 / SEC-017: hardening de bajo riesgo

SEC-014:

1. En builds empaquetadas, filtrar `reload` junto con `toggleDevTools`.
2. Mantener ambos en desarrollo.
3. Test unitario sobre `buildAppMenu` con `app.isPackaged=true`.

SEC-011:

1. Inventariar usos de estilos inline en React.
2. No quitar `style-src 'unsafe-inline'` hasta tener reemplazos probados.
3. Mover estilos repetidos a CSS classes.
4. Revisar si `theme-init.js` y variables CSS permiten reducir superficie sin romper temas.
5. Opcional: agregar Trusted Types en modo reporte/observacion para detectar sinks antes de enforcement.

SEC-017:

1. Hacer que DOMPurify/jsdom esten disponibles para Electron main en runtime empaquetado.
2. Cambiar default a DOMPurify y dejar `ANTARES_PDF_SANITIZER=regex` como fallback temporal.
3. Comparar PDFs antes/despues:
   - reportes de campo
   - preview-panel
   - panel-aviso-corte
   - formatos
4. Si hay diferencias visuales, ajustar allowlist de DOMPurify en vez de volver al regex por defecto.

Tests:

- `tests/test-html-sanitizer.js` debe correr ambos modos.
- Snapshot o render visual de PDFs criticos.
- Validar que no se rompen logos SVG placeholder ni `meta charset`.

## Fase 6 opcional - SEC-012: migracion XLSX completa al backend

El hibrido actual es una mitigacion razonable: `xlsxSafe` limita tamano/filas y sanitiza claves peligrosas. Si el objetivo es aislamiento maximo, migrar los tres flujos restantes al backend.

Plan sin ruptura:

1. Crear endpoint IPC backend generico `xlsx_parse_safe`.
2. Implementar parsing con `openpyxl`/bytes, limite de tamano y filas.
3. Para padron, volantes y preview-panel:
   - correr backend parse en paralelo contra `xlsxSafe`.
   - comparar resultado en tests.
   - activar por feature flag.
4. Una vez estable, retirar parseo renderer o dejarlo solo como fallback offline.

Tests:

- Fixtures reales de los tres flujos.
- Excel con `__proto__`, `constructor`, formulas, HTML y mas de 50k filas.
- Comparacion de output antes/despues.

## Orden recomendado de implementacion

1. SEC-003/004 vouching de rutas: es el pendiente tecnico mas importante.
2. SEC-005 firma real y SEC-006 smoke empaquetado: bloquean release seguro.
3. SEC-013 `npm ci` + audit reproducible: mejora seguridad sin tocar producto.
4. SEC-016 logos fuera de `localStorage`: cierra el gap visible que quedo parcial.
5. SEC-014 reload en prod: cambio pequeno y de bajo riesgo.
6. SEC-017 DOMPurify default: despues de smoke visual de PDFs.
7. SEC-011 CSP sin `unsafe-inline`: hacerlo por reduccion gradual, no de golpe.
8. SEC-012 backend completo: opcional si se quiere endurecimiento maximo.

## Criterio de cierre

Cada issue queda cerrado cuando:

1. El fix esta implementado de forma aditiva.
2. Hay tests unitarios o de integracion del caso seguro y del caso bloqueado.
3. El flujo funcional equivalente fue probado con datos reales.
4. El documento `cambios_auditoria_security.md` se actualiza con:
   - que cambio se hizo,
   - que pruebas pasaron,
   - si quedo algun riesgo aceptado.

