# perf-17 — `_recordStderr` escribe cada chunk a `process.stderr` (+ split/filter) (P3)

**Severidad:** P3
**Área:** Electron / backend lifecycle / logging

## Bottleneck

El monitoreo del `stderr` del backend duplica cada chunk a `process.stderr` del proceso Electron y lo splitea/filtra en cada `data` event. Si el backend loguea verbosamente, esto agrega I/O y CPU de string processing en el main process.

## Evidence (métrica)

- `electron/backend-spawner.js:131-134` (`_recordStderr`):
  - `process.stderr.write(text)` por cada chunk.
  - Además mantiene un buffer rolling `_stderrBuffer` para diagnóstico.
  - Splitea/filtra líneas (p.ej. para suprimir ruido conocido) en cada chunk.
- En producción, el `stderr` de Electron suele ir a /dev/null o a un log; reenviar el del backend duplica el volumen.

## Fix concreto que conserva funcionalidad

- Condicionar `process.stderr.write(text)` a **`isDev`** (o a una flag `VERBOSE_BACKEND`). En producción, mantener solo el buffer rolling para diagnóstico (que ya se usa ante errores).
- Conservar la detección de patrones de error fatal y el buffer (eso es lo que alimenta diagnósticos al usuario); solo se elimina el echo duplicado en prod.
- Mantener el split/filter solo si es necesario para el buffer; si el filter es solo para el echo, moverlo detrás de la misma flag.

No afecta la captura de errores ni los mensajes mostrados al usuario; solo reduce I/O/CPU en producción.

## Verificación

- Medir: con backend verbosamente logueando (p.ej. nivel DEBUG), contar writes a `process.stderr` en prod antes (N) vs después (0).
- Test funcional: ante un error fatal del backend, el diagnóstico al usuario (buffer) sigue igual.
