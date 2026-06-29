# perf-16 — IPC stdout: `buffer += data` + `split('\n')` por chunk para payloads base64 grandes (P3)

**Severidad:** P3
**Área:** Electron / IPC / parsing

## Bottleneck

El parser del stdout del backend acumula chunks con `buffer += data.toString()` y re-splitea por `\n` en cada `data` event. Para respuestas base64 multi-MB (preview de imagen, PDF), la concatenación reasigna el string y el split re-procesa el prefijo ya consumido.

## Evidence (métrica)

- `electron/ipc-router.js:58-61`:
  ```js
  proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      ...
  });
  ```
- Limite de payload: 64 MB (`_MAX_PAYLOAD_SIZE` en `backend/ipc_protocol.py`). Un preview/PDF grande puede ser una sola línea de varios MB.
- `split('\n')` en cada chunk reescanea todo el buffer acumulado (incluido lo ya procesado) — O(n²) acumulativo en el peor caso.

## Fix concreto que conserva funcionalidad

- Usar `StringDecoder('utf8')` para no romper codepoints multibyte en el límite del chunk.
- Procesar solo líneas completas con `indexOf('\n')` y **cortar** el buffer consumido (`buffer = buffer.slice(idx + 1)`), evitando re-splittear el prefijo.
- Conserva: el protocolo JSON-RPC línea-por-línea, la correlación por `id`, los timeouts/retries, y el manejo de notifications.

```js
const dec = new StringDecoder('utf8');
proc.stdout.on('data', (data) => {
    buffer += dec.write(data);
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        handleLine(line);
    }
    buffer += dec.end();   // leftovers multibyte
});
```

## Verificación

- **Medir primero**: con un payload de ~10–30 MB base64, medir CPU/memoria del parser antes/después (`process.memoryUsage()` + `console.time`).
- Test funcional: misma secuencia de respuestas/notificaciones entregadas al renderer, mismo orden, mismo `id` matching.
