# Security Audit Report — Antares

**Fecha:** 2026-06-27
**Alcance:** Antares — Electron + React 18/Vite/TS + Python (IPC JSON-RPC) + Supabase
**Reglas inquebrantables cumplidas:** conservar TODA la funcionalidad, NO eliminar funciones, solo agregar seguridad.
**Metodología:** `/grill-with-docs` — mapeo de superficie de ataque leyendo el código (las preguntas de la entrevista se respondieron del codebase), diagnóstico root-cause por dominio, y fixes aditivos con testing.

---

## 1. Resumen ejecutivo

Antares parte de una **base de seguridad sólida** inusualmente buena para una app Electron de escritorio: sandbox + contextIsolation + nodeIntegration off, preload con allowlist IPC por `contextBridge`, CSP declarativa en la ventana principal, screening de path-traversal en el límite IPC, sin sourcemaps en producción, sin sinks XSS directos en el renderer (`dangerouslySetInnerHTML`/`eval`/`innerHTML`), plantillas Jinja con `select_autoescape`, y un sanitizer HTML + CSP `default-src 'none'` para la generación de PDF.

Aun así se encontraron **19 hallazgos** (1 P0, 5 P1, 7 P2, 6 P3). El más grave es una **escalada de privilegios en Supabase** (P0): la policy `users_update_own_profile` permite a cualquier usuario establecer `is_admin = true` sobre su propia fila, comprometiendo toda la puerta de admin (funciones SQL y edge functions incluidas). Le siguen un clúster de **path traversal** en el backend Python (los handlers confían en paths absolutos del renderer sin confinarlos), **carga automática de plugins con sandbox bypassable**, **exfiltración de imágenes locales vía `html_to_pdf`**, **builds sin firmar** (auto-update sin verificación de firma), y **Electron 33 EOL** (Chromium sin parchear).

No se eliminó ni una sola función. Cada fix es aditivo (trigger SQL, helper de confinamiento, gate/opt-in, headers, opciones de configuración) y se acompaña de un plan de testing que reusa los tests existentes en `tests/` y `frontend/src`.

### Conteo por severidad

| Severidad | Count | IDs |
|-----------|-------|-----|
| **P0 Crítica** | 1 | SEC-001 |
| **P1 Alta** | 5 | SEC-002, SEC-003, SEC-004, SEC-005, SEC-006 |
| **P2 Media** | 7 | SEC-007, SEC-008, SEC-009, SEC-010, SEC-011, SEC-012, SEC-013 |
| **P3 Baja** | 6 | SEC-014, SEC-015, SEC-016, SEC-017, SEC-018, SEC-019 |

### Tabla de hallazgos

| ID | Sev | Título | Categoría | Ubicación |
|----|-----|--------|-----------|-----------|
| SEC-001 | P0 | Escalada de privilegios: usuario se auto-asigna `is_admin` | Auth/RLS | `supabase/migrations/0001_user_profiles.sql:21-25` |
| SEC-002 | P1 | Plugins: ejecución de código con sandbox AST bypassable + auto-load | RCE/Plugin | `backend/core/plugins.py:91-120`, `backend/main.py:198` |
| SEC-003 | P1 | Path traversal: handlers aceptan paths absolutos fuera de raíces permitidas (lectura+escritura) | PathTraversal | `backend/core/sellador_io.py:10-15`, `backend/handlers/sellador.py:72-133`, `backend/handlers/optimizer.py`, `backend/handlers/formatos.py:27-32`, `backend/handlers/panel_aviso_corte.py`, `backend/handlers/conversion.py`, `backend/handlers/database.py`, `backend/handlers/ubicaciones.py`, `backend/core/panel_aviso_corte/rendering.py:149-152,368-371` |
| SEC-004 | P1 | `html_to_pdf`: `localImagePaths` lee cualquier imagen absoluta → exfiltración | PathTraversal/SSRF | `electron/dialog-handlers.js:15-25` |
| SEC-005 | P1 | Builds sin firmar + `verifyUpdateCodeSignature:false` → auto-update sin verificación de firma | SupplyChain/Config | `electron-builder.yml:88-93,142`, `electron/auto-updater.js` |
| SEC-006 | P1 | Electron 33 EOL con Chromium sin parchear | Dependency/Config | `package.json:54` (`electron: ^33.0.0`) |
| SEC-007 | P2 | Filtración de info sensible al renderer: errores con internals + `stderrTail` | SensitiveLogging | `backend/main.py:149-151`, `backend/handlers/common.py:93-95`, `electron/ipc-router.js:226-233` |
| SEC-008 | P2 | DoS: sin límites de tamaño/complejidad en stdin, base64/imagen, regex, history | DoS | `backend/ipc_protocol.py:163-166`, `backend/handlers/optimizer.py:129-161`, `backend/core/converter.py:231`, `backend/core/panel_aviso_corte/matcher.py:191`, `backend/handlers/history.py:33-35` |
| SEC-009 | P2 | Tokens de sesión Supabase en `localStorage` (robo ante XSS) | DataExposure | `frontend/src/lib/supabase.ts:18-23` |
| SEC-010 | P2 | Sin lockdown de navegación (`will-navigate` / `setWindowOpenHandler`) | Config | `electron/window-manager.js` (ausente) |
| SEC-011 | P2 | Gaps CSP: sin meta CSP en `index.html`; `style-src 'unsafe-inline'` en prod; `script-src 'unsafe-inline'` en dev | CSP | `frontend/index.html`, `electron/window-manager.js:50-54` |
| SEC-012 | P2 | `@e965/xlsx` parsea Excel no confiado en el renderer (prototype pollution/ReDoS histórico) | Dependency | `frontend/src/components/preview-panel/PreviewPanelView.tsx:338`, `frontend/src/components/padron/excel.ts:144`, `frontend/src/components/volantes/utils/import.ts:81` |
| SEC-013 | P2 | Auditoría de CVEs no garantizada: `npm audit` fuera de CI + registry mirror bloquea el audit local | Dependency/Process | `package.json:36` (CI), `frontend/.npmrc`/registry → `npmmirror.com` |
| SEC-014 | P3 | DevTools + Recargar alcanzables en producción vía `app-menu-popup` | Hardening | `electron/window-manager.js:15` |
| SEC-015 | P3 | Sin rate limiting client-side en signIn/signUp | Auth | `frontend/src/auth/AuthContext.tsx`, `LoginScreen.tsx` |
| SEC-016 | P3 | `localStorage` guarda logos (imagen) y valores CSS de tema (vector CSS injection en perfil compartido) | DataExposure | `frontend/src/components/preview-panel/PreviewPanelView.tsx:45-60`, `frontend/src/main.tsx:9-16` |
| SEC-017 | P3 | Sanitizer HTML de PDF basado en regex (no DOMPurify) — robustez defense-in-depth | XSS | `shared/html-sanitizer.js:33-78` |
| SEC-018 | P3 | `pdfjs-dist` sin `isEvalSupported:false` (hardening) | Hardening | `frontend/src/components/sellador/pdfjs.ts:26-28`, `frontend/src/components/formatos/FormatosView.tsx:35-37` |
| SEC-019 | P3 | `isDev` del preload basado en `NODE_ENV` puede ser true en builds empaquetadas | Hardening | `electron/preload.js:28` |

---

## 2. Base de seguridad ya correcta (no requiere acción)

Verificado durante la auditoría — **no reportar como fixed**, solo documentado para contexto:

- **Electron renderer:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (`electron/window-manager.js:38-42`). Preload vía `contextBridge.exposeInMainWorld` con allowlist de métodos (`electron/preload.js:35-71`). Allowlist además validada del lado main process (`electron/ipc-router.js:213`).
- **CSP de la ventana principal:** inyectada vía `onHeadersReceived` con `default-src 'self'`, `script-src 'self'` (sin `'unsafe-eval'`), `connect-src 'self' https://*.supabase.co` (`electron/window-manager.js:46-57`).
- **IPC backend:** `validate_method` rechaza nombres no alfanuméricos; `validate_params` hace screening de path-traversal en claves tipo path (`backend/ipc_protocol.py:31-66`). Decorador `@validate_params` autoritativo en handlers (`backend/handlers/common.py:53-95`).
- **Sin command injection:** cero `subprocess`/`os.system`/`shell=True` en el backend Python. El spawn del backend usa `spawn(cmd, args)` con lista de args, sin shell (`electron/backend-spawner.js:409`). `taskkill` usa `execFile` con array (`backend-spawner.js:499`).
- **Sin SQLi:** identificadores validados con `_validate_identifier`, valores con `?` parametrizado (SQLite). Jinja con `select_autoescape` (`backend/core/technical_reports/rendering.py:6`, `panel_aviso_corte/rendering.py:13`).
- **Sin sinks XSS en el renderer:** cero `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`/`document.write`/iframe `srcdoc` en `frontend/src/**`. El contenido de usuario se renderiza por JSX (auto-escape).
- **Sin sourcemaps en producción:** `sourcemap: mode === 'development'` (`frontend/vite.config.ts:37`). `drop_console`/`drop_debugger` y `comments: false` en prod.
- **PDF generation endurecida:** `html_to_pdf` usa sesión/partición dedicada, `contextIsolation+sandbox`, filtro `webRequest` que bloquea todo load externo/file salvo allowlist, y el sanitizer inyecta `<meta CSP default-src 'none'>` (`shared/html-sanitizer.js:12-13`, `electron/dialog-handlers.js:126-152`). Timeout de 60s.
- **Supabase RLS base:** `user_profiles` con RLS habilitado y policies own-row; funciones admin `SECURITY DEFINER` con `search_path = public` y check `is_admin()`; edge functions verifican JWT + `is_admin` antes de usar la service role key; la service role key **no** se importa en el frontend (solo anon key).
- **Build:** `asar: true`, `requestedExecutionLevel: asInvoker`, publish GitHub HTTPS, sin tokens hardcodeados (vía `GITHUB_TOKEN` en CI).
- **Sin deserialización insegura:** ausencia de `pickle`/`yaml.load`/`eval`/`exec` en el backend (salvo el `exec_module` de plugins, ver SEC-002).

---

## 3. Hallazgos detallados

Cada hallazgo tiene su propio archivo en `issues/security-*.md` con: vulnerabilidad, impacto, fix aditivo concreto y testing. A continuación un resumen ejecutivo por hallazgo.

### P0 — SEC-001 Escalada de privilegios en Supabase
La policy `users_update_own_profile` permite `UPDATE` de la fila propia con `WITH CHECK (auth.uid() = user_id)` — **sin restringir columnas**. Un usuario puede ejecutar `update user_profiles set is_admin = true where user_id = auth.uid()` con la anon key y volverse admin. Esto compromete `is_admin()`, `admin_list_users`, `admin_set_admin`, `admin_toggle_disabled` y las edge functions `admin-create-user`/`admin-delete-user` (todas confían en `is_admin()`). **Fix aditivo:** nueva migración `0003_protect_profile_flags.sql` con un trigger `BEFORE UPDATE` que rechaza cambios a `is_admin`/`is_disabled` salvo que `public.is_admin()` sea true. Conserva toda la funcionalidad (los admins siguen usando las funciones SECURITY DEFINER; el usuario sigue pudiendo editar `display_name`).

### P1 — SEC-002 Plugins con sandbox bypassable + auto-load
`backend/core/plugins.py` carga y ejecuta `.py` desde `%LOCALAPPDATA%/Antares/plugins/` en cada arranque (`main.py:198`). El filtro AST es robusto pero los sandboxes Python son bypassables por construcción (el propio docstring dice "use at your own risk"). Cualquier proceso local / malware que escriba en ese dir obtiene ejecución persistente dentro del backend (acceso a IPC, archivos, datos de padron). **Fix aditivo:** logging de auditoría (path + mtime + hash de cada plugin cargado) + kill switch vía `ANTARES_PLUGINS_DISABLED=1`, sin cambiar el comportamiento por defecto. Opcional (más estricto): opt-in `ANTARES_PLUGINS_ENABLED`.

### P1 — SEC-003 Path traversal en backend (paths absolutos no confinados)
`is_safe_user_path` solo bloquea patrones `..` — **no bloquea paths absolutos** como `C:\Windows\System32\...` o `/etc/passwd`. Los handlers de sellador, optimizer, formatos, panel-aviso-corte, conversion, database y ubicaciones pasan paths del renderer a `open()`/`read_bytes()`/`write_bytes()`/`to_excel()`/`mkdir()` sin confinarlos a una raíz permitida. Prerrequisito: renderer comprometido (XSS). Entonces: lectura arbitraria de PDFs (sellador devuelve el PDF stampeado en base64), imágenes (preview_image) y Excels (db_import); y escritura de contenido generado por la app en ubicaciones arbitrarias. **Fix aditivo:** helper `assert_path_within_root` + denegación de paths bajo directorios sensibles del sistema, aplicado en cada handler; el main process vouchs la raíz elegida en el diálogo nativo. Conserva la capacidad de procesar archivos del usuario en cualquier lado.

### P1 — SEC-004 Exfiltración de imágenes vía `html_to_pdf`
`_localImageEntries` (`electron/dialog-handlers.js:15-25`) acepta cualquier path absoluto con extensión de imagen permitida y lo inyecta en el HTML del PDF. Si el renderer no pide `outputPath`, el PDF se devuelve como base64 al renderer → un renderer comprometido puede leer cualquier imagen local (con extensión permitida) y exfiltrarla. **Fix aditivo:** confinar `localImagePaths` a raíces vouchs por el diálogo nativo (mismo mecanismo que SEC-003) o requerir que el token sea vouched por el main process.

### P1 — SEC-005 Builds sin firmar / auto-update sin verificación de firma
`electron-builder.yml` tiene `verifyUpdateCodeSignature: false` (Windows) y `dmg.sign: false` (macOS), sin `notarize`. `electron-updater` confía en el `latest.yml` (SHA512) que viaja junto al binario en el mismo release. Un release comprometido (token GitHub filtrado) o un MITM del canal de update (más difícil, HTTPS) entregaría un instalador malicioso → RCE en todos los usuarios que auto-updatean. **Fix aditivo:** añadir bloque de firma/autenticación (cert EV/OV Windows, Developer ID + notarize macOS) cableado por secrets de CI (no-op sin secrets → preserves dev builds), y flip `verifyUpdateCodeSignature: true` al firmar.

### P1 — SEC-006 Electron 33 EOL (Chromium sin parchear)
`electron: ^33.0.0` (Oct 2024) está EOL desde ~Abril 2025 (3 majors). El Chromium 128.x incluido acumula CVEs posteriores. Aunque el renderer está sandboxed + contextIsolation, un Chromium sin parchear eleva el riesgo de sandbox escape → RCE. **Fix:** upgrade a un major soportado (≥ 37/38 a Jun 2026); añadir `npm-check-updates`/Dependabot para electron. Cambio de versión con test de regresión (los tests Electron existen en `tests/test-electron-*.js`).

### P2 — SEC-007 Filtración de internals al renderer
`backend/main.py:149-151` envía `f"{type(exc).__name__}: {exc}"` al renderer y loguea el traceback completo a stderr; `backend/handlers/common.py:93-95` hace eco del path en `Path traversal detected: {path}`; `electron/ipc-router.js:226-233` expone `stderrTail` (últimas 30 líneas de stderr, pueden contener rutas/SQL/internals) al renderer vía `backend-status`. **Fix aditivo:** mensaje genérico localizado al renderer (salvo `ValueError` ya user-facing), detalle solo a stderr; en producción, `stderrTail` se redacta o se omite (dev lo conserva).

### P2 — SEC-008 DoS por falta de límites de input
Cuatro vectores: (a) `readline()` sin límite de longitud en stdin → OOM con un JSON gigante; (b) optimizer/converter sin tope de archivos/bytes base64 ni `Image.MAX_IMAGE_PIXELS` → bomba de descompresión; (c) regex de usuario en `panel_aviso_corte/matcher.py:191` sin límite de longitud → ReDoS; (d) `history_list` con `limit` sin techo → respuestas IPC enormes. **Fix aditivo:** `readline(n+1)` + rechazo si excede; `Image.MAX_IMAGE_PIXELS` y contadores de bytes/archivos; cap de longitud de patrón regex + cap de stem; `min(limit, MAX_HISTORY_LIMIT)`.

### P2 — SEC-009 Tokens Supabase en localStorage
`persistSession: true` guarda el JWT (access + refresh) en `localStorage` (`sb-*-auth-token`). Cualquier XSS (o malware local con acceso al perfil Electron) roba la sesión persistente. No hay sinks XSS hoy, pero es un amplificador. **Fix aditivo (opciones que conservan funcionalidad):** almacenamiento custom vía IPC/main process, o `persistSession: false` + refresh en memoria con UX de re-login al reiniciar; acortar TTL de refresh en Supabase.

### P2 — SEC-010 Sin lockdown de navegación
`window-manager.js` no registra `will-navigate` ni `setWindowOpenHandler`. Un renderer comprometido podría navegar la ventana principal a una URL externa o abrir ventanas nuevas. **Fix aditivo:** `mainWindow.webContents.on('will-navigate', e => { if (url !== expectedFileUrl) e.preventDefault() })` y `setWindowOpenHandler(() => ({ action: 'deny' }))`.

### P2 — SEC-011 Gaps de CSP
`frontend/index.html` no tiene meta CSP (las cargas no-Electron — `vite preview`, tests jsdom — quedan sin CSP). La CSP de prod incluye `style-src 'unsafe-inline'`; la de dev añade `script-src ... 'unsafe-inline'`. **Fix aditivo:** meta CSP belt-and-suspenders en `index.html`; migrar estilos inline críticos a archivos con hash; restringir dev CSP a localhost (ya lo hace) y eliminar `'unsafe-inline'` de script-src en dev cargando el script del módulo con nonce/hash.

### P2 — SEC-012 `@e965/xlsx` parsea Excel no confiado en el renderer
Excel/CSV subidos por el usuario se parsean en el renderer con `@e965/xlsx@0.20.3`. El paquete histórico `xlsx` tiene CVEs de prototype pollution (CVE-2023-30533) y ReDoS (CVE-2024-22363); el fork `@e965/xlsx` puede tenerlos parcheados pero **no se pudo confirmar** (SEC-013). **Fix aditivo:** mover el parsing al backend Python (ya existe `panelAvisoCorteParseExcel` con openpyxl) o validar tamaño/filas y confirmar el patch status del fork; mantener el fork actualizado.

### P2 — SEC-013 Auditoría de CVEs no garantizada
El CI (`package.json:36`) ejecuta `audit:python` (pip-audit) pero **no** `npm audit`. Además el registry npm local apunta a `npmmirror.com` que no implementa el endpoint de audit (404), así que `npm audit` falla localmente. Resultado: las CVEs de dependencias npm del renderer nunca se chequean automáticamente. **Fix aditivo:** añadir al CI `npm audit --omit=dev --registry=https://registry.npmjs.org` (o `osv-scanner`) y/o fijar el registry de audit al oficial; documentar el flujo.

### P3 — SEC-014 DevTools en producción
El menú de la barra de título (`buildAppMenu`) incluye `role: 'toggleDevTools'` y `role: 'reload'`, accesible en producción vía `app-menu-popup`. `openDevTools()` en `createWindow` ya está guardado por `!app.isPackaged`, pero el menú no. **Fix aditivo:** en builds empaquetadas, omitir `toggleDevTools`/`reload` del template del menú.

### P3 — SEC-015 Sin rate limiting client-side en auth
`signInWithPassword`/`signUp` sin throttle/lockout/backoff; dependencia total del rate-limit server de Supabase. **Fix aditivo:** debounce + contador local (p.ej. 5 intentos / 15 min) con UX; exponer reset password con el mismo throttle.

### P3 — SEC-016 Datos en localStorage (logos + tema)
Logos persistidos como `{dataUrl, fileName}` en `localStorage` (imágenes del usuario en disco sin cifrar) y valores CSS de tema aplicados con `setProperty(key, value)` validando solo `key.startsWith('--')` (otra app/perfil compartido podría inyectar CSS `url()`/`@import`). **Fix aditivo:** persistir logos vía ruta local/IndexedDB con opt-in + botón "borrar caché"; validar valores de tema contra allowlist (hex/rgb/longitudes).

### P3 — SEC-017 Sanitizer HTML regex (no DOMPurify)
`shared/html-sanitizer.js` hace sanitización regex + CSP meta. Hoy no hay sinks en el renderer y la generación de PDF está endPointed por CSP `default-src 'none'` + filtro webRequest + sandbox, así que el riesgo es bajo. Pero un sanitizer regex es más frágil que DOMPurify ante payloads anidados. **Fix aditivo:** wrapper DOMPurify compartido (ya hay override `dompurify@^3.4.11`) y lint rule que prohíba sinks HTML sin sanitizer.

### P3 — SEC-018 `pdfjs-dist` sin `isEvalSupported:false`
`getDocument()` no pasa `isEvalSupported: false`. `pdfjs-dist@4.10.38` está parcheado para los CVEs conocidos (CVE-2024-43639/43640 afectaban a <4.7), pero el hardening del worker no es explícito. **Fix aditivo:** centralizar `getDocument` en `sellador/pdfjs.ts` con `{ isEvalSupported: false }` y reutilizar desde todos los call sites.

### P3 — SEC-019 `isDev` del preload basado en `NODE_ENV`
`electron/preload.js:28` usa `process.env?.NODE_ENV !== 'production'`. En builds empaquetadas, Electron **no** setea `NODE_ENV=production` automáticamente, así que `isDev` puede ser true en prod y activar `console.debug`/`console.error` del preload (que no pasa por terser). **Fix aditivo:** derivar `isDev` de un flag inyectado vía `additionalArguments` (igual que el allowlist) o de `process.defaultApp`/`app.isPackaged` reached via un arg.

---

## 4. Plan de remediación (priorizado)

**Onda 1 — Crítico/Alto (ahora):**
1. SEC-001 — aplicar migración `0003_protect_profile_flags.sql` + test SQL. (P0, diff pequeño, alto impacto.)
2. SEC-003 + SEC-004 — helper `assert_path_within_root` + denegación de system dirs + vouching de raíces desde el diálogo nativo. (P1, el fix compartido cubre ambos.)
3. SEC-002 — audit logging + kill switch de plugins. (P1, diff pequeño.)
4. SEC-005 — cablear firma de código por secrets de CI (no-op sin secrets) + plan para obtener cert. (P1, proceso + config.)
5. SEC-006 — upgrade de Electron a major soportado + regresión. (P1, una línea + test.)

**Onda 2 — Medio:**
6. SEC-007 — mensajes genéricos al renderer + redacción de stderrTail en prod.
7. SEC-008 — límites de stdin/base64/imagen/regex/history.
8. SEC-009, SEC-010, SEC-011 — almacenamiento de sesión, lockdown de navegación, meta CSP.
9. SEC-012 + SEC-013 — mover parsing xlsx al backend o confirmar fork; añadir `npm audit`/osv-scanner al CI.

**Onda 3 — Bajo (hardening):**
10. SEC-014..SEC-019 — DevTools en prod, rate limit auth, localStorage, sanitizer DOMPurify, pdfjs isEvalSupported, preload isDev.

---

## 5. Auditoría de dependencias

### npm (frontend + root)
- **No se pudo ejecutar `npm audit`** localmente: el registry configurado es `registry.npmmirror.com`, cuyo endpoint de audit responde `404 [NOT_IMPLEMENTED]` (ver `frontend/npm-audit-raw.json` capturado). Esto es parte del hallazgo SEC-013.
- **Acción:** ejecutar `npm audit --omit=dev --registry=https://registry.npmjs.org` (o `npx osv-scanner`) y añadirlo al CI. Hasta entonces, el inventario de versiones con CVEs conocidas (de conocimiento del modelo, no audit autoritativo):

| Package | Versión | CVE conocida | Notas |
|---|---|---|---|
| electron | ^33.0.0 | EOL + Chromium 128 sin parchear | SEC-006 — upgrade |
| @e965/xlsx | ^0.20.3 | CVE-2023-30533, CVE-2024-22363 (histórico xlsx) | SEC-012 — confirmar fork |
| pdfjs-dist | ^4.10.38 | CVE-2024-43639/43640 (<4.7) | 4.10.38 parcheado; SEC-018 hardening |
| dompurify | ^3.4.11 (override) | bypasses <3.2 parcheados | OK; no usado en src todavía |
| @supabase/supabase-js | ^2.108.2 | sin CVE conocida | — |
| jspdf | ^4.2.1 | sin CVE conocida | solo canvas/image |
| html-to-image | ^1.11.13 | sin CVE conocida | — |
| react/react-dom | ^18.2.0 | CVEs RSC no aplican (SPA) | — |
| framer-motion / i18next / react-i18next / lucide-react / react-window | — | sin CVE conocida | — |
| electron-updater | ^6.8.3 (prod) | sin CVE conocida | — |
| dev (vite/vitest/terser/jsdom/tailwind) | — | revisar GHSA | dev-only |

### Python (backend)
- **`pip-audit` no está instalado localmente** (es tool de CI, cableado en `npm run audit:python`). No se pudo ejecutar aquí.
- Dependencias críticas observadas (imports): `Pillow` (PIL), `pandas`, `openpyxl`, `jinja2` (con `select_autoescape`), `PyMuPDF` (fitz), `WeasyPrint`, `urllib` (hosts fijos OSM/Google). **Acción:** ejecutar `npm run audit:python` en CI y revisar Pillow/PyMuPDF/openpyxl/pandas (historial de CVEs en parseo de imágenes/Excel). El SSRF de mapas usa hosts fijos (no es vector).

---

## 6. Lo que no se pudo ejecutar y por qué

- **`npm audit`**: registry mirror `npmmirror.com` sin endpoint de audit (404). → SEC-013.
- **`pip-audit`**: binario no instalado en este entorno (es de CI). → usar `npm run audit:python`.
- **Tests de regresión**: no se ejecutaron en esta auditoría (el shell del entorno tuvo problemas de captura de stdout). Los fixes proponen tests que reusan la suite existente (`tests/test_path_sanitization.py`, `tests/test_ipc_validation.py`, `tests/test_sellador_handler.py`, `tests/test_optimizer_handler.py`, `tests/test-electron-*.js`, `tests/test-html-sanitizer.js`, `frontend/src/**/*.test.tsx`). **Correr `npm test` tras aplicar cada fix.**

---

## 7. Matriz de archivos afectados por fix

| Fix | Archivos a tocar (aditivo) |
|-----|---------------------------|
| SEC-001 | `supabase/migrations/0003_protect_profile_flags.sql` (nuevo) |
| SEC-002 | `backend/core/plugins.py`, `backend/main.py` |
| SEC-003 | `backend/utils/paths.py` (helper), `backend/core/sellador_io.py`, `backend/handlers/sellador.py`, `backend/handlers/optimizer.py`, `backend/handlers/formatos.py`, `backend/handlers/panel_aviso_corte.py`, `backend/handlers/conversion.py`, `backend/handlers/database.py`, `backend/handlers/ubicaciones.py`, `backend/core/panel_aviso_corte/rendering.py`, `electron/dialog-handlers.js` (vouched root) |
| SEC-004 | `electron/dialog-handlers.js` |
| SEC-005 | `electron-builder.yml`, CI secrets |
| SEC-006 | `package.json` (electron version) |
| SEC-007 | `backend/main.py`, `backend/handlers/common.py`, `electron/ipc-router.js` |
| SEC-008 | `backend/ipc_protocol.py`, `backend/handlers/optimizer.py`, `backend/core/converter.py`, `backend/core/panel_aviso_corte/matcher.py`, `backend/handlers/history.py`, `backend/bootstrap.py` (Image.MAX_IMAGE_PIXELS) |
| SEC-009 | `frontend/src/lib/supabase.ts` (+ auth context) |
| SEC-010 | `electron/window-manager.js` |
| SEC-011 | `frontend/index.html`, `electron/window-manager.js` |
| SEC-012 | `frontend/src/components/{preview-panel,padron,volantes}/*` (mover parsing a backend) |
| SEC-013 | `.github/workflows/*.yml` (npm audit/osv-scanner), `.npmrc` |
| SEC-014 | `electron/window-manager.js` |
| SEC-015 | `frontend/src/auth/AuthContext.tsx`, `LoginScreen.tsx` |
| SEC-016 | `frontend/src/components/preview-panel/PreviewPanelView.tsx`, `frontend/src/main.tsx` |
| SEC-017 | `shared/html-sanitizer.js` (+ wrapper DOMPurify) |
| SEC-018 | `frontend/src/components/sellador/pdfjs.ts`, `frontend/src/components/formatos/FormatosView.tsx` |
| SEC-019 | `electron/preload.js`, `electron/window-manager.js` |

---

## 8. Conclusión

La base de Antares es robusta; los hallazgos no son "configuración Electron insegura" (lo típico y peor en apps Electron) sino **huecos funcionales**: una policy SQL demasiado amplia (P0), confiar en paths del renderer sin confinar (P1), un sistema de plugins ejecutando código con sandbox bypassable (P1), y supply-chain sin firma (P1). Todos se corrigen de forma **aditiva** sin tocar la funcionalidad existente. Priorizar SEC-001 y SEC-003/004 inmediatamente.
