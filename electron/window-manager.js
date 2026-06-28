/**
 * Window management: BrowserWindow creation and lifecycle.
 */
const { BrowserWindow, screen, session, Menu, app, shell } = require('electron');
const path = require('path');
const { ALLOWED_RENDERER_METHODS } = require('./ipc-methods');

let mainWindow = null;
let _isDev = false;

function buildAppMenu(menuIndex = 0) {
  const menus = [
    { label: 'Archivo', submenu: [{ label: 'Cerrar ventana', role: 'close' }, { type: 'separator' }, { label: 'Salir', role: 'quit' }] },
    { label: 'Editar', submenu: [{ label: 'Deshacer', role: 'undo' }, { label: 'Rehacer', role: 'redo' }, { type: 'separator' }, { label: 'Cortar', role: 'cut' }, { label: 'Copiar', role: 'copy' }, { label: 'Pegar', role: 'paste' }, { label: 'Seleccionar todo', role: 'selectAll' }] },
    { label: 'Ver', submenu: [{ label: 'Recargar', role: 'reload' }, { label: 'Herramientas de desarrollo', role: 'toggleDevTools' }, { type: 'separator' }, { label: 'Zoom real', role: 'resetZoom' }, { label: 'Acercar', role: 'zoomIn' }, { label: 'Alejar', role: 'zoomOut' }, { type: 'separator' }, { label: 'Pantalla completa', role: 'togglefullscreen' }] },
    { label: 'Ventana', submenu: [{ label: 'Minimizar', role: 'minimize' }, { label: 'Maximizar', click: () => mainWindow?.maximize() }, { label: 'Restaurar', click: () => mainWindow?.unmaximize() }, { type: 'separator' }, { label: 'Cerrar', role: 'close' }] },
    { label: 'Ayuda', submenu: [{ label: 'Acerca de Antares', role: 'about' }] },
  ];
  // SEC-014: hide DevTools from the app menu in packaged builds.
  if (app && app.isPackaged) {
    const ver = menus.find((m) => m.label === 'Ver');
    if (ver && Array.isArray(ver.submenu)) {
      ver.submenu = ver.submenu.filter((item) => item.role !== 'toggleDevTools');
    }
  }
  return Menu.buildFromTemplate([menus[menuIndex] || menus[0]]);
}

function createWindow(isDev) {
  _isDev = !!isDev;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');

  // The preload runs with sandbox: true, so it cannot `require('./ipc-methods')`
  // (sandboxed preloads can only require a small set of built-ins). Inject the
  // IPC allowlist via additionalArguments — the canonical way to pass small,
  // trusted data into a sandboxed preload. ipc-methods.js stays the single
  // source of truth (still required by the main-process ipc-router, which is
  // the real security boundary).
  const allowedMethodsArg = `--allowed-ipc-methods=${JSON.stringify([...ALLOWED_RENDERER_METHODS])}`;

  mainWindow = new BrowserWindow({
    width, height, show: false, frame: false,
    titleBarStyle: 'hidden', autoHideMenuBar: true, icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      additionalArguments: [allowedMethodsArg],
    },
  });

  // Set Content-Security-Policy to prevent XSS → RCE escalation
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? "default-src 'self' http://localhost:5173; script-src 'self' http://localhost:5173 'unsafe-inline'; style-src 'self' 'unsafe-inline' http://localhost:5173; img-src 'self' data: blob: http://localhost:5173; font-src 'self' http://localhost:5173; connect-src 'self' http://localhost:5173 ws://localhost:5173 https://*.supabase.co"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.supabase.co"
        ]
      }
    });
  });

  // SEC-010: lock down navigation and popups from a compromised renderer.
  // The app is a single-origin SPA (file:// in prod, localhost:5173 in dev);
  // block any navigation outside it and deny window.open() (external links
  // must use shell.openExternal). No window.open()/OAuth-popup usage exists
  // in the renderer, so denying popups breaks nothing.
  const navAllow = isDev ? ['http://localhost:5173/'] : ['file://'];
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!navAllow.some((p) => url.startsWith(p))) e.preventDefault();
  });
  mainWindow.setWindowOpenHandler(({ url }) => {
    if (shell && /^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  // SEC-014: bloquear los atajos de teclado de DevTools (F12 /
  // Ctrl+Shift+I|J|C) en builds empaquetados. El menú de la app ya oculta
  // "Herramientas de desarrollo" en prod (buildAppMenu), pero Chromium abre
  // DevTools por teclado por defecto — esto cierra ese vector.
  if (app && app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const isDevtoolsShortcut =
        input.key === 'F12' ||
        (input.control && input.shift && (input.key === 'I' || input.key === 'J' || input.key === 'C'));
      if (isDevtoolsShortcut) event.preventDefault();
    });
  }

  mainWindow.webContents.setBackgroundThrottling(false);
  mainWindow.maximize();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // Only open DevTools when explicitly in dev mode AND app is not packaged
    if (!require('electron').app.isPackaged) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    const htmlPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function getMainWindow() { return mainWindow; }
function getIsDev() { return _isDev; }

module.exports = { createWindow, getMainWindow, getIsDev, buildAppMenu };
