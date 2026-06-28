/**
 * Paridad de la tripleta de clasificación de métodos IPC (simplification-010).
 *
 * Tres listas mantenidas a mano definen timeouts/colas y deben mantener su
 * relación:
 *   1. frontend/src/api.ts     -> LONG_RUNNING_METHODS (timeout del cliente)
 *   2. electron/ipc-methods.js -> LONG_RUNNING_METHODS (timeout del router)
 *   3. backend/main.py         -> HEAVY_METHODS        (cola heavy del scheduler)
 *
 * Invariantes verificadas (dirección corregida vs la propuesta original):
 *   A) api LONG_RUNNING == ipc LONG_RUNNING   (igualdad estricta, ambas direcciones)
 *   B) HEAVY_METHODS ⊆ ipc LONG_RUNNING        (todo método heavy es long-running)
 *
 * NOTA: el issue proponía `LONG_RUNNING ⊆ HEAVY_METHODS`, pero NO se cumple:
 * `html_to_pdf` es long-running (lento, necesita timeout largo) pero el backend
 * lo rutea como LIGHT (I/O-bound, no ocupa slot heavy). La dirección correcta es
 * la inversa: heavy ⟹ long-running (si es CPU-intensivo también es lento). El
 * cliente SÍ puede tener timeout largo para métodos que el backend considera
 * ligeros, pero NUNCA clasificar como short-running un método que el backend
 * considera heavy (eso causaría un timeout silencioso en producción).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API_PATH = path.join(ROOT, 'frontend', 'src', 'api.ts');
const IPC_PATH = path.join(ROOT, 'electron', 'ipc-methods.js');
const MAIN_PATH = path.join(ROOT, 'backend', 'main.py');

function extractLongRunningSet(source) {
  const methods = new Set();
  const blockRe = /const\s+LONG_RUNNING_METHODS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/;
  const match = source.match(blockRe);
  if (!match) return methods;
  const itemRe = /['"]([a-zA-Z0-9_]+)['"]/g;
  let item;
  while ((item = itemRe.exec(match[1])) !== null) {
    methods.add(item[1]);
  }
  return methods;
}

function extractHeavyMethods(source) {
  const methods = new Set();
  const blockRe = /HEAVY_METHODS\s*=\s*\{([\s\S]*?)\}/;
  const match = source.match(blockRe);
  if (!match) return methods;
  const itemRe = /['"]([a-zA-Z0-9_]+)['"]/g;
  let item;
  while ((item = itemRe.exec(match[1])) !== null) {
    methods.add(item[1]);
  }
  return methods;
}

function diff(a, b) {
  return [...a].filter((m) => !b.has(m));
}

const apiLongRunning = extractLongRunningSet(fs.readFileSync(API_PATH, 'utf8'));
const ipcLongRunning = extractLongRunningSet(fs.readFileSync(IPC_PATH, 'utf8'));
const heavyMethods = extractHeavyMethods(fs.readFileSync(MAIN_PATH, 'utf8'));

let failed = false;

// A) api LONG_RUNNING == ipc LONG_RUNNING (both directions)
const apiOnly = diff(apiLongRunning, ipcLongRunning);
const ipcOnly = diff(ipcLongRunning, apiLongRunning);
if (apiOnly.length > 0 || ipcOnly.length > 0) {
  console.error('[FAIL] LONG_RUNNING_METHODS divergió entre api.ts y ipc-methods.js:');
  if (apiOnly.length) console.error(`  solo en api.ts:\n    - ${apiOnly.join('\n    - ')}`);
  if (ipcOnly.length) console.error(`  solo en ipc-methods.js:\n    - ${ipcOnly.join('\n    - ')}`);
  failed = true;
}

// B) HEAVY_METHODS ⊆ ipc LONG_RUNNING (every heavy method must be long-running)
const heavyNotLong = diff(heavyMethods, ipcLongRunning);
if (heavyNotLong.length > 0) {
  console.error(
    '[FAIL] Métodos HEAVY en backend/main.py que NO son LONG_RUNNING en ipc-methods.js\n' +
      '  (causarían timeout silencioso del lado del cliente en producción):\n    - ' +
      heavyNotLong.join('\n    - ')
  );
  failed = true;
}

if (!failed) {
  console.log(
    `[PASS] Tripleta sincronizada: api==ipc LONG_RUNNING (${apiLongRunning.size} métodos); ` +
      `HEAVY (${heavyMethods.size}) ⊆ LONG_RUNNING.`
  );
  process.exit(0);
}
process.exit(1);
