# perf-18 — `html_to_pdf`: BrowserWindow + session partition nuevos por llamada (P3, bajo)

**Severidad:** P3 (bajo — ver justificación)
**Área:** Electron / PDF / lifecycle

## Bottleneck

Cada `html_to_pdf` crea y destruye una `BrowserWindow` oculta + una `session.fromPartition` única. Esto cuesta ~100–300 ms por llamada.

## Evidence (métrica)

- `electron/dialog-handlers.js:111-124` (`renderHtmlToPdf`):
  - `session.fromPartition('pdf-render-<ts>-<rand>')` por llamada.
  - `new BrowserWindow({ show:false, sandbox:true, … })` por llamada.
  - Tras `printToPDF`: `win.destroy()` + `session.fromPartition(...).close()`.
- Call sites (verificados, **1 llamada por acción de export**, no en loop):
  - `frontend/src/components/reportes-campo/utils/export.ts:216, 274` — `exportReportPdf` y `exportConsolidatedReportPdf` (1 HTML grande con todas las fotos/paneles → 1 PDF).
  - `frontend/src/components/technical-reports/TechnicalReportsApp.tsx` — export individual + consolidado.
  - `frontend/src/components/preview-panel/PreviewPanelView.tsx:540` — export del preview.

## Por qué es P3 (no P2)

A diferencia de lo que parecía, `htmlToPdf` **no se llama en un loop per-item**: cada export del usuario arma un único HTML y produce un único PDF. El costo de ventana es **1 por acción de export** (~100–300 ms one-time), no N. Eso es aceptable para el uso actual.

## Fix concreto que conserva funcionalidad

Solo si se confirma con métricas que el costo de arranque de ventana es perceptible en el flujo de export, **reusar una ventana oculta** (o un pool pequeño) entre llamadas, manteniendo el aislamiento que hoy da la partition única:
- Reusar una `BrowserWindow` oculta con una `session partition` fija; entre llamadas, navegar a `about:blank` y re-registrar los interceptores de red (`protocol`/`session.webRequest`) que el HTML necesita.
- Si el aislamiento per-call es requerido por razones de estado, rotar entre 2–3 partitions pre-creadas en vez de crear/destruir cada vez.

Conserva: el resultado del PDF (mismo HTML → mismo PDF), el aislamiento entre exportaciones, el manejo de `localImagePaths`. **No aplicar sin medir** — el costo actual one-time puede no justificar la complejidad.

## Verificación

- **Medir primero**: cronometrar `renderHtmlToPdf` para un HTML típico (startup de ventana vs `printToPDF` vs destroy). Si el startup es <15 % del total, cerrar sin fix.
- Si se aplica: test funcional que exporte 3 PDFs seguidos y verifique que cada uno es correcto y que no hay leaks de sesión entre exports.
