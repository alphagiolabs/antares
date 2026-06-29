# simplification-010 — Agregar test de paridad para la triplete `LONG_RUNNING_METHODS` / `HEAVY_METHODS`

## Skill
`observability` + `simplification` + `doubt-driven`

## Ubicación (3 listas manuales que deben coincidir)

1. `frontend/src/api.ts` líneas ~50-72 — `LONG_RUNNING_METHODS` set (define timeouts del cliente IPC)
2. `electron/ipc-methods.js` líneas ~60-83 — `LONG_RUNNING_METHODS` set (define timeouts del router Electron)
3. `backend/main.py` líneas ~64-87 — `HEAVY_METHODS` set (define routing al scheduler heavy)

## Por qué es un problema
- Ya existe `tests/test-electron-ipc-allowlist.js` que valida paridad entre 2 de las 3 (`api.ts` ↔ `ipc-methods.js`).
- PERO `main.py.HEAVY_METHODS` no tiene test de paridad. Cualquier endpoint nuevo puede caer en timeout en una capa y no en otra — y solo se detectaría en producción con un timeout silencioso.
- Las 3 listas son mantenidas a mano. Sin sincronización obligatoria, drift garantizado.

## Verificación de consumers
- `tests/test-electron-ipc-allowlist.js` ya existe y cubre `api.ts` ↔ `ipc-methods.js`.
- `main.py.HEAVY_METHODS` no es consumido en tests.

## Propuesta (acción aditiva, sin tocar runtime)
Crear `tests/test-backend-heavy-methods-sync.js` (Node.js) que:

1. Lee `frontend/src/api.ts` y extrae `LONG_RUNNING_METHODS` (regex, igual que el test existente).
2. Lee `electron/ipc-methods.js` y extrae su `LONG_RUNNING_METHODS` (igual).
3. Lee `backend/main.py` y extrae `HEAVY_METHODS` (regex equivalente aplicado a `HEAVY_METHODS = { ... }`).
4. Aserta que `LONGO_RUNNING_METHODS (api) == LONG_RUNNING_METHODS (ipc)` y que `LONG_RUNNING_METHODS (_ipc) ⊆ HEAVY_METHODS (main)` (el backend puede tener más métodos pesados que el frontend no clasifica como long-running; la inclusión es lo importante).

Agrega el test a `package.json:scripts.test` en la cadena (igual que el allowlist).

## Cambio de comportamiento
Ninguno. Es un test NUEVO, no toca runtime.

## Relación con el contrato IPC
No rompe el contrato: el test solo valida metadatos (timeout/queue classification), no cambia métodos disponibles.

## Riesgo de migración
Ninguno. Solo agrega un test.

## Verificación
```bash
# Después de crear el test:
node tests/test-backend-heavy-methods-sync.js

# El test falla intencionalmente si detecta drift entre las 3 listas.
# Correr luego en cadena:
npm test
```

## Nota a futuro
Si se quisiera SSoT real (single source of truth), generar las 3 listas desde un único JSON o TS module en build time. Eso es refactor estructural, no quick win — documentar en un issue aparte si se quiere emprender.
