# perf-01 — Build de producción roto: imports dinámicos `xlsx` no resuelven (P0)

**Severidad:** P0 (bloqueador de build)
**Área:** Frontend / build / bundle

## Bottleneck

`npm run build` (que ejecuta `tsc -b && vite build`) falla en la fase de type-checking, por lo que **no se genera un bundle de producción reproducible**. El `dist/` actual (9.70 MB) proviene de un build anterior y está stale. Sin build, ninguna optimización de bundle es medible ni deployable.

## Evidence (métrica)

- `frontend/package.json` declara la dependencia **`@e965/xlsx`** (fork de SheetJS); el paquete original **`xlsx` no está instalado**.
- Tres archivos usan **imports dinámicos** con el specifier roto `'xlsx'`:

| Archivo | Línea | Código |
|---------|-------|--------|
| `frontend/src/components/padron/excel.ts` | 142 | `const XLSX = await import('xlsx');` |
| `frontend/src/components/volantes/utils/import.ts` | 15 | `const loadXlsx = () => import("xlsx");` |
| `frontend/src/components/preview-panel/PreviewPanelView.tsx` | 338 | `const XLSX = await import('xlsx');` |

- `tsc` reporta (log completo, `exit_code: 2`, ~40s):
  ```
  src/components/padron/excel.ts(142,29):            error TS2307: Cannot find module 'xlsx'
  src/components/preview-panel/PreviewPanelView.tsx(338,31): error TS2307: Cannot find module 'xlsx'
  src/components/volantes/utils/import.ts(15,31):     error TS2307: Cannot find module 'xlsx'
  src/components/volantes/utils/import.ts(92,18):     error TS2347: Untyped function calls may not accept type arguments.
  src/components/volantes/utils/import.ts(98,37):     error TS7006: Parameter 'value' implicitly has an 'any' type.
  src/components/volantes/utils/import.ts(109,16):    error TS2347: Untyped function calls may not accept type arguments.
  src/components/volantes/utils/import.ts(114,32):    error TS7006: Parameter 'row' implicitly has an 'any' type.
  src/components/volantes/utils/import.ts(129,11/16): error TS7006: 'row'/'index' implicitly 'any'.
  src/components/volantes/utils/import.ts(130,14):    error TS7006: Parameter 'record' implicitly has an 'any' type.
  ```
- Los `TS2347`/`TS7006` en `volantes/utils/import.ts` son **downstream** del `TS2307`: como `import("xlsx")` no resuelve, el módulo queda `any`, por lo que `XLSX.utils.sheet_to_json<{...}>()` (call con type args sobre función untyped → TS2347) y los params de callbacks `.map((row, index) => …)` quedan `any` implícito (TS7006). Mismo root cause.
- `vite.config.ts` ya prepara el chunk `vendor-data` con `['@e965/xlsx']`, confirmando que `@e965/xlsx` es el paquete correcto.

## Fix concreto que conserva funcionalidad

Reemplazar el specifier dinámico `'xlsx'` por `'@e965/xlsx'` en los 3 sitios. `@e965/xlsx` expone la misma API (`read`, `write`, `utils.*`) que `xlsx`, así que todas las llamadas (`XLSX.read(buffer, {type:'array'})`, `XLSX.utils.sheet_to_json`, etc.) quedan idénticas. No se toca lógica de negocio.

```diff
- const XLSX = await import('xlsx');
+ const XLSX = await import('@e965/xlsx');
```

## Verificación

`npm run build` debe terminar con `exit_code: 0` y `tsc` sin errores; regenerar `dist/` y re-medir tamaños de chunk (ver `PERF-AUDIT-REPORT.md`).
