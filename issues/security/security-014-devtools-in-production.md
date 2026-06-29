# SEC-014 — DevTools + Recargar alcanzables en producción vía `app-menu-popup`

- **Severidad:** P3 (Baja)
- **Categoría:** Hardening (CWE-489: funciones activas para depuración en producción)
- **Archivos afectados:** `electron/window-manager.js:11-20` (`buildAppMenu`), `electron/ipc-router.js:257-268` (`app-menu-popup`)

## Vulnerabilidad

`buildAppMenu` define un menú "Ver" con `role: 'reload'` y `role: 'toggleDevTools'`:

```js
{ label: 'Ver', submenu: [
    { label: 'Recargar', role: 'reload' },
    { label: 'Herramientas de desarrollo', role: 'toggleDevTools' },
    ...
]}
```

Este menú se muestra en producción vía el handler IPC `app-menu-popup` (`ipc-router.js:257-268`), expuesto por el preload (`showAppMenu`). `main.js` setea `Menu.setApplicationMenu(null)` (bien — sin menú por defecto), pero el menú popup de la barra de título custom **sí** lo construye y abre. Así, en un build empaquetado, el usuario puede abrir DevTools y recargar la página desde el menú de la app.

`createWindow` ya guarda `openDevTools()` con `!app.isPackaged` (dev only) — bien. Pero el `role: 'toggleDevTools'` del menú no tiene esa guarda.

## Impacto

En una máquina compartida o con brief acceso físico, alguien puede abrir DevTools en la app empaquetada e inspeccionar `localStorage` (tokens Supabase — SEC-009), llamar métodos IPC directamente desde la consola, o leer estado en memoria. Para un app de escritorio donde el usuario "es dueño de la máquina" el riesgo es bajo (de ahí P3), pero: (a) expone los tokens de SEC-009 a cualquiera con acceso momentáneo, (b) facilita reverse-engineering de la API IPC para un atacante con acceso físico.

## Fix propuesto (aditivo, conserva la funcionalidad del menú)

Construir el menú sin las entradas de desarrollo cuando la app está empaquetada. `buildAppMenu` recibe/usa `app.isPackaged`:

```js
const { BrowserWindow, screen, session, Menu, app } = require('electron');

function buildAppMenu(menuIndex = 0) {
  const isPackaged = app.isPackaged;
  const verSubmenu = [
    { label: 'Recargar', role: 'reload' },
    // DevTools solo en dev — en prod no exponerlo.
    ...(isPackaged ? [] : [{ label: 'Herramientas de desarrollo', role: 'toggleDevTools' }]),
    { type: 'separator' },
    { label: 'Zoom real', role: 'resetZoom' },
    { label: 'Acercar', role: 'zoomIn' },
    { label: 'Alejar', role: 'zoomOut' },
    { type: 'separator' },
    { label: 'Pantalla completa', role: 'togglefullscreen' },
  ];
  const menus = [
    { label: 'Archivo', submenu: [{ label: 'Cerrar ventana', role: 'close' }, { type: 'separator' }, { label: 'Salir', role: 'quit' }] },
    { label: 'Editar', submenu: [/* ...igual que antes... */] },
    { label: 'Ver', submenu: verSubmenu },
    { label: 'Ventana', submenu: [/* ...igual... */] },
    { label: 'Ayuda', submenu: [{ label: 'Acerca de Antares', role: 'about' }] },
  ];
  return Menu.buildFromTemplate([menus[menuIndex] || menus[0]]);
}
```

> Conserva toda la funcionalidad: el menú sigue existiendo y abriéndose; en dev sigue teniendo DevTools (igual que `openDevTools` con `!app.isPackaged`); en prod simplemente no muestra la entrada de DevTools. `Recargar` se deja (es útil para usuarios finales; no expone nada). Si se quiere también quitar `reload` en prod, añadirlo al mismo condicional — pero reload no es sensible.

Opcional: además bloquear el shortcut F12/Ctrl+Shift+I en prod:
```js
mainWindow.webContents.on('before-input-event', (event, input) => {
  if (app.isPackaged && (
    (input.key === 'F12') ||
    (input.control && input.shift && (input.key === 'I' || input.key === 'J' || input.key === 'C'))
  )) {
    event.preventDefault();
  }
});
```

## Testing (sin romper nada)

1. **`tests/test-electron-preload.js`** (o nuevo `test-electron-menu.js`): mockear `app.isPackaged = false` → `buildAppMenu().items` incluye "Herramientas de desarrollo". `app.isPackaged = true` → no la incluye. "Recargar" y "Ayuda" presentes en ambos.
2. **Smoke dev:** `npm run dev` → el menú de la barra de título muestra DevTools y abre DevTools al click (igual que antes).
3. **Smoke prod:** `npm run build:win`, correr el instalable → el menú NO muestra DevTools; F12 no abre DevTools. La app funciona normal.
