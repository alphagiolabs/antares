// Tests for SEC-003 Capa 2 — ipc-router._prepareBackendParams (strip + derive).
const { _prepareBackendParams, _extractPaths } = require('../electron/ipc-router.js');
const { createVouchedPaths } = require('../electron/vouched-paths.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function run() {
  console.log('Testing ipc-router._prepareBackendParams (SEC-003 Capa 2)...\n');

  // --- _extractPaths: string / list / dict ---
  assert(_extractPaths('C:/a.xlsx').length === 1, 'extract: string → [str]');
  assert(_extractPaths(['C:/a.xlsx', 'C:/b.xlsx']).length === 2, 'extract: list → items');
  assert(_extractPaths({ x: 'C:/a.jpg', y: 'C:/b.jpg' }).length === 2, 'extract: dict → values');
  assert(_extractPaths(null).length === 0, 'extract: null → []');

  // --- strip allowed_roots del renderer (siempre) ---
  const warn = createVouchedPaths({ mode: 'warn' });
  const stripped = _prepareBackendParams('sellador_apply', { pdf_path: 'C:/tmp/a.pdf', allowed_roots: ['C:/evil'] }, warn);
  assert(stripped.allowed_roots === undefined, 'strip: allowed_roots del renderer eliminado');

  // --- método sin cfg: pasa limpio (solo strip) ---
  const nocfg = _prepareBackendParams('db_records', { foo: 1, allowed_roots: ['x'] }, warn);
  assert(nocfg.allowed_roots === undefined && nocfg.foo === 1, 'método sin cfg: solo strip, params intactos');

  // --- warn mode: paths no vouched → no inyecta, no lanza ---
  const warnResult = _prepareBackendParams('sellador_apply', { pdf_path: 'C:/tmp/a.pdf', output_path: 'C:/out/a.pdf' }, warn);
  assert(warnResult.allowed_roots === undefined, 'warn: no inyecta allowed_roots');
  assert(warnResult.pdf_path === 'C:/tmp/a.pdf', 'warn: params conservados');

  // --- warn mode: paths vouched → tampoco inyecta (warn = observabilidad pura) ---
  const warn2 = createVouchedPaths({ mode: 'warn' });
  warn2.registerReadFile('C:/tmp/a.pdf');
  warn2.registerWriteFile('C:/out/a.pdf');
  const warnVouched = _prepareBackendParams('sellador_apply', { pdf_path: 'C:/tmp/a.pdf', output_path: 'C:/out/a.pdf' }, warn2);
  assert(warnVouched.allowed_roots === undefined, 'warn: ni siquiera vouched inyecta (cero cambio de behavior)');

  // --- enforce mode: paths vouched → inyecta allowed_roots (union read+write) ---
  const enforce = createVouchedPaths({ mode: 'enforce' });
  enforce.registerReadFile('C:/tmp/a.pdf');
  enforce.registerWriteFile('C:/out/a.pdf');
  const enfOk = _prepareBackendParams('sellador_apply', { pdf_path: 'C:/tmp/a.pdf', output_path: 'C:/out/a.pdf' }, enforce);
  assert(Array.isArray(enfOk.allowed_roots) && enfOk.allowed_roots.length === 2, 'enforce: inyecta union de anclas read+write');

  // --- enforce mode: path no vouched → lanza ---
  const enforce2 = createVouchedPaths({ mode: 'enforce' });
  enforce2.registerReadFile('C:/tmp/a.pdf');
  let threw = false;
  try {
    _prepareBackendParams('sellador_apply', { pdf_path: 'C:/tmp/a.pdf', output_path: 'C:/evil/leak.pdf' }, enforce2);
  } catch (err) {
    threw = true;
  }
  assert(threw, 'enforce: lanza si un path write no está vouched');

  // --- enforce: read bajo read-root (dialog_folder) vouched ---
  const enforce3 = createVouchedPaths({ mode: 'enforce' });
  enforce3.registerReadRoot('C:/photos');
  enforce3.registerWriteRoot('C:/destino');
  const conv = _prepareBackendParams('process_start', { files: ['C:/photos/a.jpg', 'C:/photos/b.jpg'], destino: 'C:/destino' }, enforce3);
  assert(Array.isArray(conv.allowed_roots) && conv.allowed_roots.length === 2, 'enforce: conversión con read-root + write-root deriva 2 anclas');

  // --- enforce: image_paths dict (panel_aviso_corte) ---
  const enforce4 = createVouchedPaths({ mode: 'enforce' });
  enforce4.registerReadRoot('C:/imgs');
  enforce4.registerWriteFile('C:/out/panel.pdf');
  const panel = _prepareBackendParams('panel_aviso_corte_render_pdf', { image_paths: { a: 'C:/imgs/a.jpg', b: 'C:/imgs/b.jpg' }, output_path: 'C:/out/panel.pdf' }, enforce4);
  assert(Array.isArray(panel.allowed_roots), 'enforce: image_paths dict se extrae y voucha bajo read-root');

  // --- enforce: image_paths con un path fuera de raíz → lanza ---
  let threwPanel = false;
  try {
    _prepareBackendParams('panel_aviso_corte_render_pdf', { image_paths: { a: 'C:/imgs/a.jpg', b: 'C:/secret/leak.jpg' }, output_path: 'C:/out/panel.pdf' }, enforce4);
  } catch (err) {
    threwPanel = true;
  }
  assert(threwPanel, 'enforce: image_paths con path fuera de read-root lanza');

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  if (failed > 0) process.exit(1);
}

run();
