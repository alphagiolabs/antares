// SEC-014: test del menú de la app — DevTools oculto en builds empaquetados,
// presente en dev. Mockea el módulo `electron` antes de cargar window-manager
// para inspeccionar el template que buildAppMenu pasa a Menu.buildFromTemplate.
const Module = require('module');

let _isPackaged = false;
let _lastTemplate = null;

const fakeElectron = {
  BrowserWindow: function () {},
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1, height: 1 } }) },
  session: { fromPartition: () => ({ webRequest: { onHeadersReceived: () => {} } }), webRequest: { onHeadersReceived: () => {} } },
  Menu: { buildFromTemplate: (tpl) => { _lastTemplate = tpl; return { items: tpl }; } },
  app: {
    get isPackaged() { return _isPackaged; },
    getPath: () => '/tmp',
  },
  shell: { openExternal: () => Promise.resolve() },
};

// Inyectar el mock en el cache de require para 'electron' (short-circuita el
// módulo real, que lanza si se carga fuera de un runtime Electron).
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: fakeElectron,
};

const { buildAppMenu } = require('../electron/window-manager');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  \u2713 ${msg}`); passed++; }
  else { console.error(`  \u2717 ${msg}`); failed++; }
}

function _verSubmenu() {
  // buildAppMenu retorna Menu.buildFromTemplate([menus[idx]]) → _lastTemplate
  // es un array de 1 menú. _lastTemplate[0] es el menú "Ver" (índice 2).
  const menu = Array.isArray(_lastTemplate) ? _lastTemplate[0] : _lastTemplate;
  return (menu && Array.isArray(menu.submenu)) ? menu.submenu : [];
}

console.log('Testing SEC-014 app menu (DevTools hidden in prod)...\n');

// dev: DevTools presente
_isPackaged = false;
buildAppMenu(2);
const devSub = _verSubmenu();
assert(devSub.some((i) => i.role === 'toggleDevTools'), 'dev: menú "Ver" incluye Herramientas de desarrollo');
assert(devSub.some((i) => i.role === 'reload'), 'dev: menú "Ver" incluye Recargar');
assert(devSub.some((i) => i.role === 'togglefullscreen'), 'dev: menú "Ver" incluye Pantalla completa');

// prod: DevTools ausente, Recargar sigue
_isPackaged = true;
buildAppMenu(2);
const prodSub = _verSubmenu();
assert(!prodSub.some((i) => i.role === 'toggleDevTools'), 'prod: menú "Ver" NO incluye Herramientas de desarrollo');
assert(prodSub.some((i) => i.role === 'reload'), 'prod: menú "Ver" sigue incluyendo Recargar');
assert(prodSub.some((i) => i.role === 'togglefullscreen'), 'prod: menú "Ver" sigue incluyendo Pantalla completa');
assert(prodSub.some((i) => i.role === 'resetZoom'), 'prod: menú "Ver" sigue incluyendo Zoom real');

// Limpieza del cache para no afectar a otros tests en el mismo proceso.
delete require.cache[require.resolve('../electron/window-manager')];
delete require.cache[electronPath];

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));
if (failed > 0) process.exit(1);
