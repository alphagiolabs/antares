# SEC-012 — `@e965/xlsx` parsea Excel no confiado en el renderer

- **Severidad:** P2 (Media)
- **Categoría:** Dependency / DoS / Prototype Pollution (CWE-1333 / CWE-1321)
- **Archivos afectados:** `frontend/src/components/preview-panel/PreviewPanelView.tsx:338`, `frontend/src/components/padron/excel.ts:144`, `frontend/src/components/volantes/utils/import.ts:81` (y `frontend/package.json:13` `@e965/xlsx@^0.20.3`)

## Vulnerabilidad

El renderer parsea archivos Excel/CSV **subidos por el usuario** con `@e965/xlsx` (fork de SheetJS). El paquete `xlsx` original tiene historial de CVEs:
- **CVE-2023-30533** — prototype pollution vía archivos crafted.
- **CVE-2024-22363** — ReDoS en parsing CSV.

`@e965/xlsx` es un fork mantenido que **puede** tenerlos parcheados, pero **no se pudo confirmar** porque `npm audit` está bloqueado por el registry mirror (SEC-013). Mientras tanto, un `.xlsx` malicioso abierto por el usuario se procesa en el proceso renderer: un prototype pollution puede corromper Object globals (alterando comportamiento de React/librerías), y un ReDoS puede colgar el renderer.

## Impacto

Un archivo Excel malicioso (que el usuario abre convencido o que recibe por email y carga en Antares) puede causar DoS del renderer o prototype pollution. El prototype pollution en un renderer con `localStorage` de tokens (SEC-009) y CSP estricta es de impacto acotado pero no cero (puede alterar lógica de la app, p.ej. bypass de validaciones client-side, o prepara el terreno para un XSS lógico). P2.

## Fix propuesto (aditivo, conserva la funcionalidad de importar Excel)

Opción preferida (mejor aislamiento): **mover el parsing al backend Python** que ya tiene `panelAvisoCorteParseExcel` con `openpyxl` (Python, sin prototype pollution por diseño del lenguaje) y confinement de paths (SEC-003). El renderer sube el archivo al backend vía IPC y recibe JSON.

```ts
// En lugar de:
//   const wb = XLSX.read(arrayBuffer, { type: 'array' });
// Llamar al backend:
const result = await window.electronAPI.invoke('panelAvisoCorteParseExcel', {
  path: selectedFile.path,
  allowed_roots: [vouchedRoot],          // SEC-003
});
// result = { sheets: [{ name, rows }] }   // (contract existente del backend)
```
> Conserva la funcionalidad: el usuario sigue importando Excel; el parsing cambia de renderer a backend. Aplica a `padron/excel.ts`, `volantes/utils/import.ts`, `preview-panel/PreviewPanelView.tsx`. Reusa el handler de backend ya existente o añade uno ligero `excel_parse` que devuelva `{sheets, rows}`.

Opción alternativa (si mover al backend es demasiado invasivo ahora):
1. Confirmar el patch status de `@e965/xlsx@0.20.3` (changelog del fork / `npm audit` con registry oficial — SEC-013). Si no está parcheado, actualizar a la última del fork.
2. **Hardening aditivo en el renderer** antes de `XLSX.read`:
   ```ts
   const MAX_XLSX_BYTES = 10 * 1024 * 1024;        // rechazar >10MB
   const MAX_XLSX_SHEET_ROWS = 50_000;
   if (file.size > MAX_XLSX_BYTES) throw new Error('Excel demasiado grande');
   const wb = XLSX.read(arrayBuffer, { type: 'array', cellHTML: false, cellFormula: false });
   // sheet_to_json con range limitado a MAX_XLSX_SHEET_ROWS
   ```
   `cellFormula: false` y `cellHTML: false` reducen superficie. Validar tamaño/filas limita ReDoS.
3. **Sanitización post-parse** aditiva: deep-clone con `Object.assign(Object.create(null), ...)` por fila para mitigar prototype pollution, o freeze `Object.prototype` (defensivo).

> La opción "mover al backend" es la más segura (aisla el parser del renderer con tokens). La opción "hardening in-renderer" conserva la arquitectura actual y añade límites.

## Testing (sin romper nada)

1. **`frontend/src/components/padron/excel.test.ts`, `volantes/utils/import.test.ts`, `preview-panel/xlsxParse.test.ts`** — los happy paths existentes siguen pasando (parsing de Excel válido → mismas filas).
2. **Nuevos casos aditivos:** Excel de 15MB → error "demasiado grande"; sheet con 60k filas → se trunca a 50k + aviso; Excel sin fórmulas → `cellFormula:false` no cambia datos.
3. **Payload prototype pollution** (`__proto__` en cabecera de un xlsx crafted) → tras el parse, `({}).polluted` sigue `undefined` (verificar que el hardening/sanitización lo neutraliza).
4. **Si se mueve al backend:** `tests/panel_aviso_corte/test_handlers.py` (parse_excel) ya cubre el parsing server-side; añadir un test que el handler rechace paths fuera de `allowed_roots` (SEC-003).
