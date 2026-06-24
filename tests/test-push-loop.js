// Smoke test: push-loop.js exporta flujo y bloquea main en ship mode.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const scriptPath = path.join(ROOT, 'scripts', 'push-loop.js');

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
  console.log('Testing push-loop script...\n');

  assert(fs.existsSync(scriptPath), 'scripts/push-loop.js exists');

  const content = fs.readFileSync(scriptPath, 'utf8');
  assert(content.includes('PR-first'), 'script documents PR-first workflow');
  assert(content.includes('ensureFeatureBranch'), 'script has branch guard logic');
  assert(content.includes("'pr', 'create'") || content.includes('gh pr create'), 'script creates PRs via gh');

  const hookPath = path.join(ROOT, '.githooks', 'pre-push');
  assert(fs.existsSync(hookPath), '.githooks/pre-push exists');
  const hook = fs.readFileSync(hookPath, 'utf8');
  assert(hook.includes('main'), 'pre-push hook protects main');

  try {
    execSync('node --check scripts/push-loop.js', { cwd: ROOT, stdio: 'pipe' });
    assert(true, 'push-loop.js parses without syntax errors');
  } catch {
    assert(false, 'push-loop.js parses without syntax errors');
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) process.exit(1);
}

run();
