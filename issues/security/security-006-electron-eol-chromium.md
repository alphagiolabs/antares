# SEC-006 — Electron 33 EOL con Chromium sin parchear

- **Severidad:** P1 (Alta)
- **Categoría:** Dependency / Configuration (runtime desactualizado, CVEs Chromium)
- **Archivos afectados:** `package.json:54` (`electron: ^33.0.0`)

## Vulnerabilidad

`package.json` declara `electron: ^33.0.0`. Electron 33 se lanzó en Oct 2024 y quedó **EOL** cuando salieron 3 majors posteriores (~Abril 2025). A Jun 2026, el major estable soportado está varias versiones por delante (≥ 37/38). El `^33.0.0` permite actualizar dentro de 33.x pero **no** a un major nuevo, así que el proyecto queda clavado en la línea 33 y su Chromium 128.x incluido.

Chromium 128.x acumula CVEs posteriores (sandbox, v8, blink, network). Aunque el renderer de Antares está bien configurado (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`), un Chromium sin parchear eleva la probabilidad de **sandbox escape** ante contenido malicioso (un PDF/HTML/imagen crafted procesado por el renderer, o un futuro sink XSS), lo que convertiría un bug de renderer en RCE con acceso a Node/main.

## Impacto

Exposición a vulnerabilidades conocidas y parcheadas en el Chromium embebido. No es un exploit concreto hoy, pero es **deuda de seguridad estructural**: mientras más viejo el Chromium, más crece la ventana de CVEs conocidos con exploit público. Combinado con cualquier futuro sink en el renderer (o con SEC-003/SEC-004 si el renderer se compromete), el path a RCE se acorta. P1 por riesgo acumulado + sandbox escape.

## Fix propuesto (aditivo, conserva la funcionalidad)

1. **Subir Electron a un major soportado.** Cambiar `package.json`:
   ```jsonc
   "devDependencies": {
     "electron": "^38.0.0",          // o el major estable soportado vigente
     "electron-builder": "^25.0.0",
     ...
   }
   ```
   El cambio es la versión; la API que Antares usa (`BrowserWindow`, `contextBridge`, `webUtils.getPathForFile`, `webRequest.onBeforeRequest`, `printToPDF`, `ipcMain.handle`, `electron-updater`) es estable en todos los majors recientes. `webUtils.getPathForFile` existe desde Electron 32 (ya se usa). No se elimina ninguna API.
2. **Mantener actualizado going forward:** añadir Dependabot/Renovate sobre `electron` (y `electron-builder`) con PRs automáticos, o un step CI que falle si `electron` está fuera de los 2 majors más recientes.
3. **Test de regresión:** correr la suite Electron existente (`tests/test-electron-preload.js`, `test-electron-ipc-allowlist.js`, `test-electron-dialogs.js`, `test-electron-path.js`, `test-backend-spawner*.js`) contra el nuevo major; ajustar solo si alguna API privada cambió.

> Conserva TODA la funcionalidad: es un bump de versión con test de regresión. No se toca lógica de la app.

## Testing (sin romper nada)

1. `npm install` con el nuevo `electron` y `npm test` — toda la suite `tests/test-electron-*.js` y `tests/test-backend-spawner*.js` debe pasar sin cambios (son tests de behavior, no de versión).
2. Smoke manual: `npm run dev` — ventana, IPC, diálogos, PDF, sellador, auto-update (dev mock) funcionan.
3. `npm run build:win` (y mac/linux) — el instalador se genera y arranca.
4. Verificar `process.versions.electron` / `process.versions.chrome` en runtime corresponden al major esperado.
5. CI: añadir un guard (`tests/test-electron-version.js` nuevo o en `test-version-sync.js`) que falle si `electron` no está dentro de los majors soportados (rango dinámico o hardcoded con revisión periódica).
