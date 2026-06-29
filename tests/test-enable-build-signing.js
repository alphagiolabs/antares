// SEC-005: test de scripts/enable-build-signing.js.
// Verifica: no-op sin WINDOWS_CERT_B64; flípea verifyUpdateCodeSignature a true
// con cert; idempotente. Usa una copia temporal para no tocar el yaml del repo.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) { console.log(`  \u2713 ${message}`); passed++; }
  else { console.error(`  \u2717 ${message}`); failed++; }
}

const script = path.join(__dirname, '..', 'scripts', 'enable-build-signing.js');
const sampleYml = `appId: com.antares.app
win:
  requestedExecutionLevel: asInvoker
  verifyUpdateCodeSignature: false
  signtoolOptions:
    signingHashAlgorithms:
      - sha256
mac:
  hardenedRuntime: true
`;

function runWithEnv(env, tmpPath) {
  return execFileSync('node', [script, tmpPath], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'antares-sign-'));
try {
  const ymlPath = path.join(tmp, 'electron-builder.yml');

  // 1. sin cert → no-op (el archivo queda igual)
  fs.writeFileSync(ymlPath, sampleYml);
  const out1 = runWithEnv({}, ymlPath);
  assert(/Sin CSC_LINK/.test(out1), 'sin cert: mensaje no-op');
  assert(fs.readFileSync(ymlPath, 'utf8').includes('verifyUpdateCodeSignature: false'), 'sin cert: yaml sin cambios (sigue false)');

  // 2. con CSC_LINK (env canónico de electron-builder en CI) → flípea a true
  const out2 = runWithEnv({ CSC_LINK: 'base64-cert' }, ymlPath);
  assert(/verifyUpdateCodeSignature => true/.test(out2), 'con CSC_LINK: mensaje de flip');
  const after = fs.readFileSync(ymlPath, 'utf8');
  assert(after.includes('verifyUpdateCodeSignature: true'), 'con CSC_LINK: yaml flípeado a true');
  assert(!after.includes('verifyUpdateCodeSignature: false'), 'con CSC_LINK: ya no queda false');
  // preserva estructura vecina
  assert(after.includes('requestedExecutionLevel: asInvoker'), 'con CSC_LINK: estructura vecina intacta');

  // 3. idempotente: segundo run con cert no cambia nada
  const out3 = runWithEnv({ CSC_LINK: 'base64-cert' }, ymlPath);
  assert(/ya es true\/ausente/.test(out3), 'idempotente: sin cambios en segundo run');
  assert(fs.readFileSync(ymlPath, 'utf8').includes('verifyUpdateCodeSignature: true'), 'idempotente: sigue true');

  // 4. alias legacy WINDOWS_CERT_B64 también flípea (setups que lo seteen directo)
  fs.writeFileSync(ymlPath, sampleYml);
  const out4 = runWithEnv({ WINDOWS_CERT_B64: 'base64-cert' }, ymlPath);
  assert(/verifyUpdateCodeSignature => true/.test(out4), 'alias WINDOWS_CERT_B64: también flípea');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));
if (failed > 0) process.exit(1);
