# simplification-015 — Extraer `scripts/lib/loop-helpers.js` para los 3 scripts `*-loop.js`

## Skill
`simplification`

## Ubicación
- `scripts/push-loop.js` (355 líneas)
- `scripts/pr-fix-loop.js` (456 líneas)
- `scripts/release-loop.js` (368 líneas)

## Por qué es un problema
Los 3 scripts duplican las mismas primitivas:
- `sh(command, opts)` — execSync wrapper
- `trySh(command, opts)` — sh + catch null
- `step(label, fn)` — runner con ✅/❌
- `skip(label, reason)` — loguea ⏭️
- `die(message, code)` — exit con mensaje

`grep "function sh\|function trySh\|function step\|function skip\|function die" scripts/` → 5 funciones × 3 archivos = 15 apariciones duplicadas (~80 líneas de infraestructura común × 3 = 240 líneas de copia).

También duplican:
- `REPO_OWNER = 'sechgio'`, `REPO_NAME = 'antares'`, `ROOT = path.resolve(__dirname, '..')`
- `BASE_BRANCH = 'main'`
- `slugifyBranchName(input)`
- `defaultBranchName(message)`
- `defaultPrBody(branch, message)`
- `currentBranch()`, `workingTreeDirty()`

## Verificación de consumers
- `tests/test-push-loop.js` y `tests/test-pr-fix-loop.js` YA EXISTEN y validan el comportamiento. Estos tests LLM-spawnean los scripts como procesos child Node con args; NO importan primitivas. Refactor de `sh`/`step` no los rompe.
- `release-loop.js` no tiene test directo (verificar).

`grep "release-loop" tests/` → sin tests.

## Propuesta
Crear `scripts/lib/loop-helpers.js` exportando las primitivas comunes:

```javascript
// scripts/lib/loop-helpers.js
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const REPO_OWNER = 'sechgio';
const REPO_NAME = 'antares';
const BASE_BRANCH = 'main';
const ROOT = path.resolve(__dirname, '..', '..');   // subido 1 nivel desde scripts/lib/

function sh(command, opts = {}) { /* … igual que antes … */ }
function trySh(command, opts = {}) { /* … */ }
function step(label, fn) { /* … */ }
function skip(label, reason) { /* … */ }
function die(message, code = 1) { /* … */ }
function currentBranch() { return sh('git rev-parse --abbrev-ref HEAD'); }
function workingTreeDirty() { return Boolean(sh('git status --porcelain')); }
function slugifyBranchName(input) { /* … */ }
function defaultBranchName(message) { /* … */ }
function defaultPrBody(branch, message) { /* … */ }
function parseArgs(argv) { /* … */ }  // o dejar parseArgs en cada script (es muy específico)

module.exports = {
  REPO_OWNER, REPO_NAME, BASE_BRANCH, ROOT,
  sh, trySh, step, skip, die,
  currentBranch, workingTreeDirty,
  slugifyBranchName, defaultBranchName, defaultPrBody,
};
```

En cada `*-loop.js`:
```javascript
const {
  sh, trySh, step, skip, die,
  REPO_OWNER, REPO_NAME, BASE_BRANCH, ROOT,
  slugifyBranchName, defaultBranchName, defaultPrBody,
  currentBranch, workingTreeDirty,
} = require('./lib/loop-helpers');
```

Borrar las definiciones duplicadas. Queda en cada script solo la orquestación específica (commit/push/pr/release steps).

`parseArgs(argv)` queda en cada script porque cada uno parsea flags distintos (`--ship`, `--merge`, `--message`, `--title`, `--branch`, `--pr`, `--max`, `--build`).

### Riesgo de `ROOT` en `lib/`
`loop-helpers.js` está en `scripts/lib/`, así que `ROOT` debe subir 2 niveles (`path.resolve(__dirname, '..', '..')`). Verificar que ningún script usaba `__dirname` relativo a `scripts/` (los `*.py` en `scripts/` no se mueven, así que siguen funcionando). Verificado: los 3 `*-loop.js` calculaban `ROOT = path.resolve(__dirname, '..')` (subiendo 1 desde `scripts/`); la versión de `lib/` debe subir 2.

## Cambio de comportamiento
Ninguno. Las funciones conservan implementación exacta. `ROOT` resuelve al mismo path (validación crucial).

## Riesgo de migración
Medio. Scripts de CI/CD. Si `ROOT` se resuelve mal, todo git/gh falla.

## Verificación
```bash
node tests/test-push-loop.js
node tests/test-pr-fix-loop.js

# Dry-run en todos:
npm run push:dry-run
npm run pr-fix
npm run release:dry-run

# Output debe ser idéntico al pre-refactor (mismo log de "Entorno", "Branch de trabajo", "Quality Gate", etc.).
```

Si release-loop.js no tiene test directo, validarlo manualmente con `npm run release:dry-run`.

## Detalle opcional
Si los tests ya LLM-spawnean procesos child (no importan helpers), el refactor es transparente. Confirmado por `tests/test-push-loop.js` que lee `scripts/push-loop.js` con regex (`grep "release" tests/test-push-loop.js`) — verificación:
```bash
grep "loop-helpers\|require\./" tests/test-push-loop.js
```
Si los tests importan internos de los scripts por símbolo, NO mover a lib/. Solo mover si los tests invocan los scripts como command-line (caso más probable).
