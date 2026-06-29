# perf-10 — Listas largas sin virtualización (excepto FileGrid) (P2)

**Severidad:** P2
**Área:** Frontend / React / render

## Bottleneck

Solo `FileGrid` usa virtualización (`react-window`). Otras vistas con listas potencialmente largas renderizan todos los nodos DOM, lo que degrada scroll y primera pintura cuando hay cientos de ítems.

## Evidence (métrica)

- `frontend/src/components/conversion/FileGrid.tsx` usa `react-window/Grid` + celda `React.memo` + ResizeObserver + overscan (✅ patrón correcto).
- `rg "react-window|FixedSize|VariableSize"` → **1 solo archivo** en toda la codebase.
- Candidatas sin virtualización (listas que pueden crecer):
  - Technical reports (`TechnicalReportsList`)
  - Reportes de campo (photo grid por panel)
  - Panel aviso de corte (lista de paneles)
  - Padron (resultados)
  - Historial (`history_list` ya pagina en SQL, pero la página puede ser grande)

## Fix concreto que conserva funcionalidad

**Medir primero**: identificar con React DevTools Profiler qué listas reales pasan de ~200 ítems visibles (no todas lo harán). Para las que sí:

- Listas verticales → `react-window/FixedSizeList` (o `VariableSizeList` si las alturas varían).
- Grids → `react-window/FixedSizeGrid` (mismo patrón que `FileGrid`).
- Conservar: orden, selección, scroll-to-item, empty states, headers. `react-window` soporta todos vía props/children render-prop.
- Si una lista rara vez pasa de ~100 ítems, **no** virtualizar (YAGNI) — dejar como está.

No es un cambio global; es selectivo, por vista, tras medir.

## Verificación

- Profiler: tiempo de render y conteo de nodos DOM para una lista de 500/2000 ítems antes/después.
- Test funcional: mismo contenido visible, mismo scroll, misma selección que hoy.
