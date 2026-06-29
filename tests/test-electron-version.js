// SEC-006 regression guard: Electron debe estar en un major soportado (no EOL).
// Evita que el proyecto vuelva a quedar clavado en una línea EOL (el bug original
// era electron ^33 con Chromium 128 sin parchear ~20 meses después de EOL).
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

// ponytail: ceiling — floor hardcoded. Electron mantiene los 4 majors estables
// más recientes; a Jun/2026 son 39–42 (latest 42.5.0). Cuando salga un major
// nuevo, subir este floor (= latest - 3). Sin red no podemos calcular "latest"
// dinámicamente, así que es revisión-manual-por-release. El guard igual atrapa
// downgrades accidentales y obliga a decidir conscientemente al bajar de major.
// Upgrade path: consultar https://releases.electronjs.org/ y dejar floor = latest-3.
const MIN_ELECTRON_MAJOR = 39;
// electron-builder 25 puede no empaquetar Electron 42 (lógica de packaging vieja);
// 26 sí lo hace y no requiere Node 22 (a diferencia de 27). 26 es el pairing seguro.
const MIN_ELECTRON_BUILDER_MAJOR = 26;

function majorOf(range) {
  const m = String(range || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function run() {
  console.log('Testing Electron version is supported / not EOL (SEC-006)...\n');
  const rootPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const devDeps = rootPkg.devDependencies || {};

  const electronMajor = majorOf(devDeps.electron);
  const builderMajor = majorOf(devDeps['electron-builder']);
  const updaterRange = devDeps['electron-updater'] || (rootPkg.dependencies || {})['electron-updater'];

  assert(electronMajor !== null, `package.json declara electron (${devDeps.electron})`);
  assert(electronMajor >= MIN_ELECTRON_MAJOR, `electron major ${electronMajor} >= ${MIN_ELECTRON_MAJOR} (no EOL)`);
  assert(builderMajor !== null, `package.json declara electron-builder (${devDeps['electron-builder']})`);
  assert(builderMajor >= MIN_ELECTRON_BUILDER_MAJOR, `electron-builder major ${builderMajor} >= ${MIN_ELECTRON_BUILDER_MAJOR} (empaqueta majors recientes)`);
  assert(Boolean(updaterRange), `package.json declara electron-updater (${updaterRange || 'AUSENTE'})`);

  // Sanity: el binario instalado coincide en major con lo declarado (catch lockfile drift).
  try {
    const installed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'electron', 'package.json'), 'utf8'));
    const installedMajor = majorOf(installed.version);
    assert(installedMajor === electronMajor, `node_modules/electron ${installed.version} coincide con el major declarado (${electronMajor})`);
  } catch {
    // node_modules puede no estar presente (e.g. lint-only / fresh checkout pre-install).
    console.log('  (skip) node_modules/electron no inspeccionable en este entorno');
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  if (failed > 0) process.exit(1);
}

run();
