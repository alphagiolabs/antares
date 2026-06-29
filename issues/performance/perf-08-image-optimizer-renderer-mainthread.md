# perf-08 — Optimizador de imágenes procesa todo en el renderer (main thread) (P2)

**Severidad:** P2
**Área:** Frontend / render / batch

## Bottleneck

El pipeline de optimización de imágenes (`image-optimizer`) hace carga, transformación Canvas y compresión **sincrónicamente en el thread principal del renderer**. En batches grandes o imágenes de alta resolución, esto congela el UI (jank) durante el procesamiento.

## Evidence (métrica)

- `frontend/src/components/image-optimizer/pipeline.ts`:
  - `loadImageElement` decodifica la imagen en el thread principal.
  - `renderTransformedFile` usa `ctx.drawImage` sobre un `<canvas>` 2D (CPU/main thread).
  - `compressImage` itera **hasta 8 veces** `canvas.toBlob` por imagen (loop de quality decreciente hasta alcanzar el tamaño objetivo) → hasta 8 re-encodes por archivo.
- `frontend/src/components/image-optimizer/index.tsx` orquesta estos pasos por archivo dentro del flujo del componente.
- El backend Python ya tiene un scheduler heavy para CPU-bound; este pipeline se eligió frontend-side (quizás para preview inmediato), pero la compresión iterativa es costosa en main thread.

## Fix concreto que conserva funcionalidad

Migrar el trabajo CPU-intensivo a un **Web Worker** con `OffscreenCanvas` (Chromium/Electron lo soporta):
- El worker recibe el `File`/`ArrayBuffer`, hace `createImageBitmap`, `OffscreenCanvas` + `drawImage`, transformaciones y `canvas.convertToBlob` con la misma lógica iterativa de `compressImage`.
- El thread principal solo despacha jobs y recibe el `Blob` resultante + progreso.
- Conserva idéntica salida (mismo algoritmo de compresión iterativa, mismo formato, mismo tamaño objetivo) — solo cambia dónde se ejecuta.
- Los object URLs (`URL.createObjectURL`) se siguen creando/revocando en el thread principal (como hoy, ver `utils.ts:476-478`); el worker devuelve un `Blob` transferible.

Alternativa mínima si no se quiere un worker: **throttle** el procesamiento para ceder al event loop entre imágenes (`await new Promise(r => setTimeout(r, 0))`), reduciendo jank sin mover de thread. Menor ganancia, menor diff.

## Verificación

- **Medir primero** con React DevTools Profiler / Performance: un batch de 20 imágenes de 8 MP — medir bloqueos del main thread (long tasks) antes/después.
- Test funcional: salida byte-idéntica (o tamaño dentro de la tolerancia actual) entre main-thread y worker para la misma input+config.

## Resultado de medición (2026-06-27) — CERRADO sin fix

Medido en Chromium real (mismo motor que el renderer de Electron) vía `PerformanceObserver` + sentinel `setTimeout(0)` para detectar si `canvas.toBlob` cede el event loop. Batch sintético de 6 imágenes de 8 MP (3264×2448) con ruido, replicando el loop iterativo de `compressImage` (8 calidades JPEG decrecientes):

| Métrica | Valor |
|---|---|
| `drawImage` sync (avg / max) | **0.7 ms / 3.7 ms** — GPU-accelerated, despreciable |
| `toBlob` avg / max | 614 ms / 1232 ms por encode |
| **Yield rate del event loop** | **48/48 = 100%** — el sentinel disparó antes de cada callback → encoder off-thread |
| Long tasks (>50ms) | 14, max 63 ms, sum 761 ms (~127 ms/imagen de hiccups de ~55 ms) |
| Wall total | 29.5 s (~4.9 s/imagen, 8 encodes × 0.6 s) |

**Veredicto: la premisa del issue queda desautorizada** (mismo patrón que perf-06). Los 8 re-encodes iterativos **no** bloquean el main thread: `toBlob` corre el encoder JPEG en un hilo background y cede el event loop en el 100% de las llamadas. El main thread queda libre durante los ~0.6 s de cada encode. `drawImage` es GPU-accelerated (0.7 ms). El jank residual son ~14 long tasks de ~55 ms (overhead del handoff canvas/encoder +, en el test, la generación de ruido sintético que en la app real no ocurre — la imagen viene de un `File` decodificado off-thread). Eso son *hiccups* de frame de <65 ms, **no un freeze**, y la UI permanece responsiva.

Una migración a Web Worker + OffscreenCanvas eliminaría esos ~127 ms/imagen de hiccups, pero el costo (nuevo archivo + protocolo de mensajes + fallback de `OffscreenCanvas` para jsdom/tests + rework de tests existentes) **no se justifica** para suprimir hiccups de <65 ms cuando el bulk del trabajo ya corre off-thread. **Cerrar sin fix.** Re-abrir solo si una traza en la app real (no sintética) sobre un batch de 20×8 MP muestra long tasks sostenidos >100 ms o un freeze perceptible.
