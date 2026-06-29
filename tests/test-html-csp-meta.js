// SEC-011: test estático de la meta CSP en frontend/index.html.
// Verifica que existe <meta http-equiv="Content-Security-Policy"> (belt-and-
// suspenders para cargas no-Electron: vite preview, tests, futuro web build),
// que default-src es 'self', y que script-src no afloja con 'unsafe-eval' ni
// 'unsafe-inline' (la CSP de prod del window-manager también los prohíbe).
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'index.html'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  \u2713 ${msg}`); passed++; }
  else { console.error(`  \u2717 ${msg}`); failed++; }
}

console.log('Testing SEC-011 CSP meta in frontend/index.html...\n');

const metaMatch = html.match(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*content=(["'])([\s\S]*?)\1/i);
assert(metaMatch, 'index.html declara <meta http-equiv="Content-Security-Policy">');

if (metaMatch) {
  const csp = metaMatch[2];
  assert(/default-src\s+'self'/.test(csp), "meta CSP: default-src 'self'");
  assert(!/script-src[^;]*'unsafe-eval'/.test(csp), "meta CSP: script-src sin 'unsafe-eval'");
  assert(!/script-src[^;]*'unsafe-inline'/.test(csp), "meta CSP: script-src sin 'unsafe-inline'");
  assert(/script-src\s+'self'/.test(csp), "meta CSP: script-src 'self'");
  assert(/img-src\s+'self'\s+data:\s+blob:/.test(csp), 'meta CSP: img-src permite data: y blob:');
  assert(/connect-src[^;]*supabase\.co/.test(csp), 'meta CSP: connect-src permite supabase.co');
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));
if (failed > 0) process.exit(1);
