# simplification-012 — Consolidar `clean-dist-electron.js` y `clean-after-package.js` en `clean.js`

## Skill
`simplification` + `doubt-driven`

## Ubicación
- `scripts/clean-dist-electron.js` (582 bytes, ~20 líneas)
- `scripts/clean-after-package.js` (928 bytes, ~30 líneas)

`package.json:scripts`:
```json
"build:win": "npm run build:backend && npm run build:frontend && npm run clean:dist-electron && electron-builder --win && npm run clean:after-package",
"dist":     "npm run build:backend && npm run build:frontend && npm run clean:dist-electron && electron-builder && npm run clean:after-package",
```

## Por qué es un problema
- Dos scripts chiquititos que hacen rm -rf de paths específicos. Si se agrega un tercer modo de limpieza, hay 3 archivos.
- "Menos archivos > más archivos" — ponytail.

## Verificación de consumers
- Búsqueda `grep -rn "clean-dist-electron\|clean-after-package" tests/` → no hay tests de estos scripts directamente (no aparecen en `test_*.js`).
- `npm run clean:dist-electron` / `npm run clean:after-package` son invocados desde `package.json` y desde `push-loop.js`/`release-loop.js` (verificar).

`grep -r "clean:dist-electron\|clean:after-package" scripts/`:

```
.\push-loop.js    # invoca npm run ...
.\release-loop.js
```

`push-loop.js` y `release-loop.js` invocan `npm run …` via `trySh`, no los archivos `.js` directamente → refactoring del archivo no los rompe mientras el `package.json` script name siga.

## Propuesta
1. Crear `scripts/clean.js` con dos modos seleccionados por flag:
   ```javascript
   // node scripts/clean.js --dist-electron
   // node scripts/clean.js --after-package
   ```
   Un único script de ~50 líneas con switch.

2. En `package.json:scripts`, reemplazar:
   ```json
   "clean:dist-electron": "node scripts/clean-dist-electron.js",
   "clean:after-package": "node scripts/clean-after-package.js",
   ```
   por:
   ```json
   "clean:dist-electron": "node scripts/clean.js --dist-electron",
   "clean:after-package": "node scripts/clean.js --after-package",
   ```

3. Borrar `scripts/clean-dist-electron.js` y `scripts/clean-after-package.js`.

## Cambio de comportamiento
Ninguno. Mismo rm -rf de los mismos paths. Conservados los nombres `npm run` para compatibilidad con `push-loop.js` / `release-loop.js` (los invocan por nombre, no por archivo).

## Riesgo de migración
Ninguno. Scripts de build hygiene, sin tests.

## Verificación
```bash
npm run clean:dist-electron     # debe eliminar dist-electron/ si existe
npm run clean:after-package     # debe eliminar residuos post-electron-builder
npm run build:win                # si está en Windows y se quiere build E2E
```

Manual: hacer dry-run de un build local y verificar que los residuos se limpian igual que antes.

## Opción descartada
Fusionar los "clean" con `bump-version.js` u otros. NO — `bump-version` tiene otra responsabilidad (semver). Mantener `clean.js` separado.
