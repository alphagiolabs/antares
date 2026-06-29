# perf-19 — `React.memo` escaso: medir re-renders antes de memoizar (P3)

**Severidad:** P3 (medir primero)
**Área:** Frontend / React / re-renders

## Bottleneck

Las vistas pesadas usan `useCallback`/`useMemo` extensivamente, pero los componentes hijos no están `React.memo`-izados. Si reciben props inestables (objetos literales/arrays nuevos por render), pueden re-renderizar sin necesidad. Sin embargo, memoizar a ciegas agrega overhead y complejidad; conviene **perfilar primero**.

## Evidence (métrica)

- `rg "React.memo|memo\("` → solo **3 archivos** lo usan explícitamente: `Toast`, `FileCard`, `FileGrid`.
- `useCallback`/`useMemo`: image-optimizer (53 usos), sellador (15), reportes-campo (15) — mucha estabilización de handlers/valores en padres, pero los children consumidores no están memoizados.
- Esto es una **hipótesis**, no un bottleneck confirmado: la estabilización de los padres puede ser suficiente si los children reciben props primitivas o estables.

## Fix concreto que conserva funcionalidad

**No memoizar especulativamente.** Flujo:

1. Abrir React DevTools Profiler y grabar una interacción típica (cargar Excel, cambiar selección, exportar).
2. Identificar componentes que se re-renderizan **sin cambio de salida** y consumen tiempo de render no trivial.
3. Solo para esos, verificar por qué re-renderizan:
   - Si es por props inestables (nuevo `{}`/`[]` por render) → estabilizar la prop en el padre (`useMemo`/`useCallback`) **antes** de memoizar el child.
   - Si tras estabilizar las props el child sigue re-renderizando sin razón → `React.memo` en ese child (con `propsAreEqual` custom solo si hay props anidadas).
4. No tocar componentes que renderizan en <1 ms o que cambian de salida legítimamente.

Conserva toda la funcionalidad; solo cambia cuándo se re-renderiza.

## Verificación

- Profiler antes/después: conteo de renders y tiempo de render del subárbol afectado.
- Test funcional: misma UI/interacción que hoy.
