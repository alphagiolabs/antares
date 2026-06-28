// SEC-009: test del almacenamiento del token Supabase fuera del renderer.
// Verifica cifrado en reposo, round-trip, fallback plano, validación de clave,
// multi-key y registro de los canales IPC — sin cargar el módulo `electron`.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAuthStorage, _validateKey, TOKEN_KEY_RE } = require('../electron/auth-storage');

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
  console.log('Testing SEC-009 auth-storage...\n');

  assert(TOKEN_KEY_RE.test('sb-abc123-auth-token'), 'clave supabase válida aceptada');
  assert(!TOKEN_KEY_RE.test('malicious'), 'clave arbitraria rechazada');
  assert(!TOKEN_KEY_RE.test('sb-abc-auth-token-evil'), 'clave con sufijo extra rechazada');
  let keyRejected = false;
  try { _validateKey('malicious'); } catch { keyRejected = true; }
  assert(keyRejected, 'validateKey lanza en clave inválida');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'antares-auth-'));
  try {
    const mockApp = { getPath: () => tmpRoot };
    const store = createAuthStorage({ safeStorage: mockSafeStorage, app: mockApp });

    // 1. get sobre archivo inexistente → null (sin lanzar)
    assert(await store.get('sb-abc-auth-token') === null, 'get devuelve null si no hay token');

    // 2. round-trip con cifrado
    const token = '{"access_token":"JWT","refresh_token":"RT"}';
    await store.set('sb-abc-auth-token', token);
    assert(await store.get('sb-abc-auth-token') === token, 'round-trip set/get del token');

    // 3. el archivo en disco NO contiene el plaintext (cifrado en reposo)
    const raw = fs.readFileSync(path.join(tmpRoot, 'auth-token.json'), 'utf8');
    const parsed = JSON.parse(raw);
    assert(parsed['sb-abc-auth-token'].enc === true, 'marca enc=true cuando safeStorage disponible');
    assert(!raw.includes('access_token') && !raw.includes('refresh_token'), 'plaintext no aparece en disco');

    // 4. remove
    await store.remove('sb-abc-auth-token');
    assert(await store.get('sb-abc-auth-token') === null, 'remove borra el token');

    // 5. multi-key (distintos project-ref)
    await store.set('sb-ref1-auth-token', 't1');
    await store.set('sb-ref2-auth-token', 't2');
    assert(await store.get('sb-ref1-auth-token') === 't1', 'multi-key: ref1');
    assert(await store.get('sb-ref2-auth-token') === 't2', 'multi-key: ref2');
    await store.remove('sb-ref1-auth-token');
    assert(await store.get('sb-ref1-auth-token') === null, 'multi-key: remove selectivo ref1');
    assert(await store.get('sb-ref2-auth-token') === 't2', 'multi-key: ref2 sigue tras remove ref1');

    // 6. claves inválidas rechazadas en set/get/remove
    let rejected = false;
    try { await store.set('evil-key', 'x'); } catch { rejected = true; }
    assert(rejected, 'set rechaza clave no-supabase');
    rejected = false;
    try { await store.get('evil-key'); } catch { rejected = true; }
    assert(rejected, 'get rechaza clave no-supabase');
    rejected = false;
    try { await store.remove('evil-key'); } catch { rejected = true; }
    assert(rejected, 'remove rechaza clave no-supabase');

    // 7. fallback a plano cuando el cifrado del SO no está disponible
    const tmpPlain = fs.mkdtempSync(path.join(os.tmpdir(), 'antares-auth-plain-'));
    try {
      const plainStore = createAuthStorage({
        safeStorage: { isEncryptionAvailable: () => false },
        app: { getPath: () => tmpPlain },
      });
      await plainStore.set('sb-xyz-auth-token', 'plain-token');
      assert(await plainStore.get('sb-xyz-auth-token') === 'plain-token', 'fallback plano: round-trip');
      const p = JSON.parse(fs.readFileSync(path.join(tmpPlain, 'auth-token.json'), 'utf8'));
      assert(p['sb-xyz-auth-token'].enc === false, 'fallback plano: marca enc=false');
    } finally {
      fs.rmSync(tmpPlain, { recursive: true, force: true });
    }

    // 8. register cablea los 3 canales IPC
    const handlers = {};
    const mockIpcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    store.register(mockIpcMain);
    assert(typeof handlers['auth-storage:get'] === 'function', 'register: canal auth-storage:get');
    assert(typeof handlers['auth-storage:set'] === 'function', 'register: canal auth-storage:set');
    assert(typeof handlers['auth-storage:remove'] === 'function', 'register: canal auth-storage:remove');
    await handlers['auth-storage:set'](null, 'sb-ipc-auth-token', 'via-ipc');
    assert(await handlers['auth-storage:get'](null, 'sb-ipc-auth-token') === 'via-ipc', 'handler IPC get funciona');
    await handlers['auth-storage:remove'](null, 'sb-ipc-auth-token');
    assert(await handlers['auth-storage:get'](null, 'sb-ipc-auth-token') === null, 'handler IPC remove funciona');
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
