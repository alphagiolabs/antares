# SEC-019 — `isDev` del preload basado en `NODE_ENV` puede ser true en builds empaquetadas

- **Severidad:** P3 (Baja)
- **Categoría:** Hardening / Info Leak (CWE-489 debug activo en prod)
- **Archivos afectados:** `electron/preload.js:28`

## Vulnerabilidad

```js
const isDev = process.env?.NODE_ENV !== 'production';
```

Electron **no** setea `NODE_ENV=production` automáticamente al empaquetar. A menos que el proceso que lanza la app (o un script) lo setee, `process.env.NODE_ENV` es `undefined` en un build empaquetado → `isDev` queda `true` → el preload ejecuta:

```js
if (isDev) {
  console.debug('[preload] Preload script executing...');
  ...
  console.error('[preload] Failed to expose electronAPI:', err);
  console.error('Renderer error:', e.error);
}
```

El preload es un archivo aparte cargado por Electron; **no** pasa por Vite/terser (que sí dropea `console` del renderer bundle). Así, esos `console.debug/error` del preload sobreviven en producción y, si `isDev` es erróneamente true, se ejecutan → ruido en la consola del renderer y menor info leak (mensajes de error del preload/renderer a la consola, accesibles vía DevTools — ver SEC-014).

## Impacto

Mínimo: logs de debug/error del preload en producción si `NODE_ENV` no está seteado. No es RCE ni data leak significativo (los mensajes son genéricos). P3.

## Fix propuesto (aditivo, conserva la funcionalidad de debug en dev)

Derivar `isDev` de una fuente confiable de Electron en lugar de `NODE_ENV`. El preload ya recibe el allowlist vía `additionalArguments` (que el main process controla), así que se puede inyectar un flag `--antares-env=production|development` igual de confiable:

`electron/window-manager.js` (en `createWindow`, donde ya se construye `allowedMethodsArg`):
```js
const envArg = `--antares-env=${isDev ? 'development' : 'production'}`;
// ...
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true, nodeIntegration: false, sandbox: true,
  additionalArguments: [allowedMethodsArg, envArg],   // ← aditivo
}
```

`electron/preload.js`:
```js
function resolveIsDev() {
  const prefix = '--antares-env=';
  const arg = (process.argv || []).find((a) => typeof a === 'string' && a.startsWith(prefix));
  if (arg) return arg.slice(prefix.length) !== 'production';
  // Fallback conservador para tests Node (sin Electron): respetar NODE_ENV,
  // pero en un preload real siempre llega el arg inyectado por el main process.
  return process.env?.NODE_ENV !== 'production';
}
const isDev = resolveIsDev();
```

> Conserva toda la funcionalidad: en dev, `isDev` sigue true (debug logs del preload activos, útil). En prod, `isDev` es false (sin logs del preload). El fallback `NODE_ENV` cubre los tests Node (`tests/test-electron-preload.js`) que no inyectan el arg.

Alternativa más simple (sin tocar window-manager): en el preload usar `process.defaultApp` (true cuando se corre `electron .` en dev, ausente al empaquetar):
```js
const isDev = !!process.defaultApp || process.env?.NODE_ENV !== 'production';
```
`process.defaultApp` es seteado por Electron cuando la app se ejecuta desde source (dev), y no está en builds empaquetados. Es la fuente más estándar. **Recomendada** por ser una línea.

## Testing (sin romper nada)

1. **`tests/test-electron-preload.js`** — el preload se expone correctamente en ambos modos (el test corre en Node sin el arg → fallback `NODE_ENV`; verificar `window.electronAPI` se expone). Sin cambios en el contract.
2. **Smoke dev:** `npm run dev` → los `console.debug` del preload aparecen (isDev true).
3. **Smoke prod:** `npm run build:win`, correr el instalable → los `console.debug/error` del preload **no** aparecen (isDev false). `window.electronAPI` se expone normal.
