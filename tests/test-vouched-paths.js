// Tests for SEC-003/004 Capa 2 — vouched-paths registry + dialog wiring.
const { createVouchedPaths, _canonical, _isUnder } = require('../electron/vouched-paths.js');
const { handleDialogCall } = require('../electron/dialog-handlers.js');

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

async function run() {
  console.log('Testing vouched-paths registry...\n');

  // --- canonical / isUnder helpers ---
  const a = _canonical('C:/tmp/data.xlsx');
  const b = _canonical('C:\\tmp\\data.xlsx');
  assert(a === b, 'Windows canonicaliza case-insensitive y normaliza separadores');
  assert(_isUnder(_canonical('C:/tmp/sub/f.jpg'), _canonical('C:/tmp')), 'isUnder: archivo bajo raiz');
  assert(!_isUnder(_canonical('C:/tmp2/f.jpg'), _canonical('C:/tmp')), 'isUnder: fuera de raiz false');
  assert(_isUnder(_canonical('C:/tmp'), _canonical('C:/tmp')), 'isUnder: igual cuenta como bajo');

  // --- registro read-file ---
  let now = 1000;
  const vp = createVouchedPaths({ mode: 'enforce', ttlMs: 60000, now: () => now });
  vp.registerReadFile('C:/tmp/data.xlsx');
  assert(vp.isVouched('C:/tmp/data.xlsx', 'read'), 'read-file vouched');
  assert(!vp.isVouched('C:/tmp/other.xlsx', 'read'), 'sibling no vouched por read-file exacto');
  assert(vp.voucherFor('C:/tmp/data.xlsx', 'read') === _canonical('C:/tmp/data.xlsx'), 'voucherFor devuelve ancla exacta');

  // --- registro read-root (dialog_folder scan) ---
  vp.registerReadRoot('C:/photos');
  assert(vp.isVouched('C:/photos/a/b.jpg', 'read'), 'archivo bajo read-root vouched');
  assert(!vp.isVouched('C:/photos', 'write'), 'read-root no voucha escritura');

  // --- registro write-file (dialog_save) ---
  vp.registerWriteFile('C:/out/export.pdf');
  assert(vp.isVouched('C:/out/export.pdf', 'write'), 'write-file vouched');
  assert(!vp.isVouched('C:/out/export.pdf', 'read'), 'write-file no voucha lectura');

  // --- registro write-root (dialog_dest / pickOnly) ---
  vp.registerWriteRoot('C:/destino');
  assert(vp.isVouched('C:/destino/renamed.jpg', 'write'), 'archivo bajo write-root vouched');
  assert(!vp.isVouched('C:/destino/renamed.jpg', 'read'), 'write-root no voucha lectura');

  // --- deriveAllowedRoots: todos vouched ---
  const roots = vp.deriveAllowedRoots(['C:/tmp/data.xlsx', 'C:/photos/x.jpg'], 'read');
  assert(Array.isArray(roots) && roots.length === 2, 'deriveAllowedRoots devuelve anclas para paths vouched');

  // --- deriveAllowedRoots: alguno no vouched → null ---
  const partial = vp.deriveAllowedRoots(['C:/tmp/data.xlsx', 'C:/secret/leak.xlsx'], 'read');
  assert(partial === null, 'deriveAllowedRoots null si alguno no vouched');

  // --- TTL: expira ---
  now += 70000; // > ttlMs
  assert(!vp.isVouched('C:/tmp/data.xlsx', 'read'), 'voucher expira tras TTL');

  // --- modo warn: isVouched sigue devolviendo bool real ---
  const warn = createVouchedPaths({ mode: 'warn' });
  assert(!warn.isVouched('C:/x', 'read'), 'warn sin registro: isVouched false');
  warn.registerReadFile('C:/x');
  assert(warn.isVouched('C:/x', 'read'), 'warn con registro: isVouched true');

  // --- clearAll ---
  warn.clearAll();
  assert(!warn.isVouched('C:/x', 'read'), 'clearAll borra vouchers');

  // --- integracion con dialog-handlers: dialog_files registra read-files ---
  const dv = createVouchedPaths({ mode: 'enforce' });
  const dialogFiles = {
    async showOpenDialog() { return { canceled: false, filePaths: ['C:/tmp/a.jpg', 'C:/tmp/b.jpg'] }; },
    async showSaveDialog() { return { canceled: true }; },
  };
  const fr = await handleDialogCall('dialog_files', {}, dialogFiles, { id: 1 }, { vouched: dv });
  assert(fr.result.paths.length === 2, 'dialog_files devuelve 2 paths');
  assert(fr.result.vouchedPaths && fr.result.vouchedPaths.length === 2, 'dialog_files adjunta vouchedPaths');
  assert(dv.isVouched('C:/tmp/a.jpg', 'read'), 'dialog_files registro read-file a');
  assert(dv.isVouched('C:/tmp/b.jpg', 'read'), 'dialog_files registro read-file b');

  // --- dialog_dest registra write-root ---
  const dr = await handleDialogCall('dialog_dest', {}, {
    async showOpenDialog() { return { canceled: false, filePaths: ['C:/out'] }; },
    async showSaveDialog() { return { canceled: true }; },
  }, { id: 1 }, { vouched: dv });
  assert(dr.result.vouchedRoots && dr.result.vouchedRoots[0] === 'C:/out', 'dialog_dest adjunta vouchedRoots');
  assert(dv.isVouched('C:/out/renamed.jpg', 'write'), 'dialog_dest registro write-root');

  // --- dialog_save registra write-file ---
  const ds = await handleDialogCall('dialog_save', {}, {
    async showOpenDialog() { return { canceled: true }; },
    async showSaveDialog() { return { canceled: false, filePath: 'C:/out/save.xlsx' }; },
  }, { id: 1 }, { vouched: dv });
  assert(ds.result.vouchedPaths && ds.result.vouchedPaths[0] === 'C:/out/save.xlsx', 'dialog_save adjunta vouchedPaths');
  assert(dv.isVouched('C:/out/save.xlsx', 'write'), 'dialog_save registro write-file');

  // --- dialog_folder (scan) registra read-root ---
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'antares-vouch-'));
  try {
    await fs.promises.writeFile(path.join(tmp, 'p.jpg'), 'x');
    const df = await handleDialogCall('dialog_folder', {}, {
      async showOpenDialog() { return { canceled: false, filePaths: [tmp] }; },
      async showSaveDialog() { return { canceled: true }; },
    }, { id: 1 }, { vouched: dv });
    assert(df.result.vouchedRoots && df.result.vouchedRoots[0] === tmp, 'dialog_folder adjunta vouchedRoots');
    assert(dv.isVouched(path.join(tmp, 'p.jpg'), 'read'), 'dialog_folder registro read-root');
    assert(dv.isVouched(path.join(tmp, 'nested', 'q.jpg'), 'read'), 'read-root cubre subcarpetas');
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }

  // --- sin vouched: comportamiento idéntico al anterior (sin campos extra) ---
  const noV = await handleDialogCall('dialog_files', {}, dialogFiles, { id: 1 }, {});
  assert(noV.result.vouchedPaths === undefined, 'sin vouched: no se adjuntan vouchedPaths');
  assert(noV.result.paths.length === 2, 'sin vouched: paths normales');

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
