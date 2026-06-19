/**
 * Regresión: todos los métodos invocados desde frontend/src/api.ts deben
 * estar presentes en ALLOWED_RENDERER_METHODS de electron/ipc-methods.js.
 *
 * Objetivo: evitar que un nuevo handler del backend o un nuevo método nativo
 * se consuma desde el frontend sin pasar por la allowlist del preload y del
 * ipc-router (defensa en profundidad).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API_PATH = path.join(ROOT, 'frontend', 'src', 'api.ts');
const ALLOWLIST_PATH = path.join(ROOT, 'electron', 'ipc-methods.js');

function extractApiMethods(source) {
  const methods = new Set();
  // Matches: _invoke<...>('method_name', ...) or _invoke<...>('method_name')
  const invokeRe = /_invoke\s*<[^>]+>\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
  let match;
  while ((match = invokeRe.exec(source)) !== null) {
    methods.add(match[1]);
  }
  return methods;
}

function extractLongRunningMethods(source) {
  const methods = new Set();
  const blockRe = /const\s+LONG_RUNNING_METHODS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/;
  const match = source.match(blockRe);
  if (match) {
    const itemRe = /['"]([a-zA-Z0-9_]+)['"]/g;
    let item;
    while ((item = itemRe.exec(match[1])) !== null) {
      methods.add(item[1]);
    }
  }
  return methods;
}

function main() {
  const apiSource = fs.readFileSync(API_PATH, 'utf8');
  const allowlistModule = require(ALLOWLIST_PATH);

  const apiMethods = extractApiMethods(apiSource);
  const apiLongRunning = extractLongRunningMethods(apiSource);
  const allowed = allowlistModule.ALLOWED_RENDERER_METHODS;
  const allowlistLongRunning = allowlistModule.LONG_RUNNING_METHODS;

  const missingFromAllowlist = [...apiMethods].filter((m) => !allowed.has(m));
  const unexpectedInAllowlist = [...allowed].filter(
    (m) => !apiMethods.has(m) && !['jobs_cleanup', 'plugin_formats'].includes(m)
  );
  const missingLongRunning = [...apiLongRunning].filter((m) => !allowlistLongRunning.has(m));

  let failed = false;

  if (missingFromAllowlist.length > 0) {
    console.error(
      `[FAIL] Métodos usados en api.ts pero no en ALLOWED_RENDERER_METHODS:\n  - ${missingFromAllowlist.join('\n  - ')}`
    );
    failed = true;
  }

  if (missingLongRunning.length > 0) {
    console.error(
      `[FAIL] Métodos marcados como LONG_RUNNING en api.ts pero no en electron/ipc-methods.js:\n  - ${missingLongRunning.join('\n  - ')}`
    );
    failed = true;
  }

  if (unexpectedInAllowlist.length > 0) {
    console.warn(
      `[WARN] Métodos en ALLOWED_RENDERER_METHODS no usados en api.ts (pueden ser legacy):\n  - ${unexpectedInAllowlist.join('\n  - ')}`
    );
  }

  if (!failed) {
    console.log(
      `[PASS] Allowlist sincronizada: ${apiMethods.size} métodos de api.ts presentes; ${apiLongRunning.size} long-running alineados.`
    );
    process.exit(0);
  }

  process.exit(1);
}

main();
