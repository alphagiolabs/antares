// Primitivas comunes a los 3 scripts *-loop.js (push / pr-fix / release).
// Extraído de las definiciones duplicadas (simplification-015).
//
// Implementación conservada 1:1; sólo se unificaron las funciones idénticas en
// los 3 scripts. NO se unificaron:
//   - workingTreeDirty: diverge (push-loop usa `sh`, pr-fix-loop usa `trySh`
//     → distinto comportamiento ante un error de git). Se mantiene local.
//   - slugifyBranchName / defaultBranchName / defaultPrBody: single-use en
//     push-loop (no hay duplicación real).
//   - parseArgs: cada script parsea flags distintos.
// ponytail: ceiling — si un futuro script necesita workingTreeDirty unificada,
// decidir `sh` vs `trySh` explicitamente y moverla aquí.

const path = require('path');
const { execSync } = require('child_process');

const REPO_OWNER = 'alphagiolabs';
const REPO_NAME = 'antares';
const BASE_BRANCH = 'main';
// scripts/lib/ está un nivel más profundo que scripts/, así que ROOT sube 2.
const ROOT = path.resolve(__dirname, '..', '..');

function sh(command, opts = {}) {
  const result = execSync(command, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 50 * 1024 * 1024,
    ...opts,
  });
  return (result || '').toString().trim();
}

function trySh(command, opts = {}) {
  try {
    return sh(command, opts);
  } catch {
    return null;
  }
}

function step(label, fn) {
  process.stdout.write(`  ${label} ... `);
  try {
    const result = fn();
    console.log('✅');
    return result;
  } catch (err) {
    console.log('❌');
    console.error(`    ${err.message}`);
    const e = new Error(err.message || 'Step failed');
    e.code = err.code || 1;
    throw e;
  }
}

function skip(label, reason) {
  console.log(`  ${label} ... ⏭️  (${reason})`);
}

function die(message, code = 1) {
  console.error(`\n✗ ${message}`);
  process.exit(code);
}

function currentBranch() {
  return sh('git rev-parse --abbrev-ref HEAD');
}

module.exports = {
  REPO_OWNER,
  REPO_NAME,
  BASE_BRANCH,
  ROOT,
  sh,
  trySh,
  step,
  skip,
  die,
  currentBranch,
};
