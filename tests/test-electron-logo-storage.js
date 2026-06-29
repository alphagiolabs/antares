// SEC-016: test del almacenamiento de logos del preview fuera del renderer.
// Verifica cifrado en reposo, round-trip, fallback plano, allowlist de claves,
// multi-key y registro de los canales IPC — sin cargar el módulo `electron`.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLogoStorage, _validateKey, LOGO_KEYS } = require('../electron/logo-storage');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  \u2713 ${message}`);
    passed++;
  } else {
    console.error(`  \u2717 ${message}`);
    failed++;
  }
}

// safeStorage mock reversible: reverse de bytes. Realista en forma (Buffer in/out).
const mockSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(Buffer.from(s, 'utf8').reverse()),
  decryptString: (buf) => Buffer.from(Buffer.from(buf).reverse()).toString('utf8'),
};

async function run() {
  console.log('Testing SEC-016 logo-storage...\n');

  assert(LOGO_KEYS.has('antares_preview_logo_left'), 'clave logo-left en allowlist');
  assert(LOGO_KEYS.has('antares_preview_logo_right'), 'clave logo-right en allowlist');
  assert(!LOGO_KEYS.has('malicious'), 'clave arbitraria fuera de allowlist');
  let keyRejected = false;
  try { _validateKey('malicious'); } catch { keyRejected = true; }
  assert(keyRejected, 'validateKey lanza en clave inválida');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'antares-logo-'));
  try {
    const mockApp = { getPath: () => tmpRoot };
    const store = createLogoStorage({ safeStorage: mockSafeStorage, app: mockApp });

    // 1. get sobre archivo inexistente → null (sin lanzar)
    assert(await store.get('antares_preview_logo_left') === null, 'get devuelve null si no hay logo');

    // 2. round-trip con cifrado (el valor es un JSON dataURL, como el renderer)
    const logoJson = JSON.stringify({ dataUrl: 'data:image/png;base64,AAAA', fileName: 'logo.png' });
    await store.set('antares_preview_logo_left', logoJson);
    assert(await store.get('antares_preview_logo_left') === logoJson, 'round-trip set/get del logo');

    // 3. el archivo en disco NO contiene el plaintext (cifrado en reposo)
    const raw = fs.readFileSync(path.join(tmpRoot, 'logos.json'), 'utf8');
    const parsed = JSON.parse(raw);
    assert(parsed['antares_preview_logo_left'].enc === true, 'marca enc=true cuando safeStorage disponible');
    assert(!raw.includes('data:image/png') && !raw.includes('logo.png'), 'plaintext no aparece en disco');

    // 4. remove
    await store.remove('antares_preview_logo_left');
    assert(await store.get('antares_preview_logo_left') === null, 'remove borra el logo');

    // 5. multi-key (left + right coexisten)
    await store.set('antares_preview_logo_left', 'L');
    await store.set('antares_preview_logo_right', 'R');
    assert(await store.get('antares_preview_logo_left') === 'L', 'multi-key: left');
    assert(await store.get('antares_preview_logo_right') === 'R', 'multi-key: right');
    await store.remove('antares_preview_logo_left');
    assert(await store.get('antares_preview_logo_left') === null, 'multi-key: remove selectivo left');
    assert(await store.get('antares_preview_logo_right') === 'R', 'multi-key: right sigue tras remove left');

    // 6. claves inválidas rechazadas en set/get/remove
    let rejected = false;
    try { await store.set('evil-key', 'x'); } catch { rejected = true; }
    assert(rejected, 'set rechaza clave fuera de allowlist');
    rejected = false;
    try { await store.get('evil-key'); } catch { rejected = true; }
    assert(rejected, 'get rechaza clave fuera de allowlist');
    rejected = false;
    try { await store.remove('evil-key'); } catch { rejected = true; }
    assert(rejected, 'remove rechaza clave fuera de allowlist');

    // 7. fallback a plano cuando el cifrado del SO no está disponible
    const tmpPlain = fs.mkdtempSync(path.join(os.tmpdir(), 'antares-logo-plain-'));
    try {
      const plainStore = createLogoStorage({
        safeStorage: { isEncryptionAvailable: () => false },
        app: { getPath: () => tmpPlain },
      });
      await plainStore.set('antares_preview_logo_left', 'plain-logo');
      assert(await plainStore.get('antares_preview_logo_left') === 'plain-logo', 'fallback plano: round-trip');
      const p = JSON.parse(fs.readFileSync(path.join(tmpPlain, 'logos.json'), 'utf8'));
      assert(p['antares_preview_logo_left'].enc === false, 'fallback plano: marca enc=false');
    } finally {
      fs.rmSync(tmpPlain, { recursive: true, force: true });
    }

    // 8. register cablea los 3 canales IPC
    const handlers = {};
    const mockIpcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    store.register(mockIpcMain);
    assert(typeof handlers['logo-storage:get'] === 'function', 'register: canal logo-storage:get');
    assert(typeof handlers['logo-storage:set'] === 'function', 'register: canal logo-storage:set');
    assert(typeof handlers['logo-storage:remove'] === 'function', 'register: canal logo-storage:remove');
    await handlers['logo-storage:set'](null, 'antares_preview_logo_left', 'via-ipc');
    assert(await handlers['logo-storage:get'](null, 'antares_preview_logo_left') === 'via-ipc', 'handler IPC get funciona');
    await handlers['logo-storage:remove'](null, 'antares_preview_logo_left');
    assert(await handlers['logo-storage:get'](null, 'antares_preview_logo_left') === null, 'handler IPC remove funciona');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
