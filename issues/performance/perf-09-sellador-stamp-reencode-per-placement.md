# perf-09 — Sellador re-codifica el sello por cada placement (P2)

**Severidad:** P2
**Área:** Backend / PDF / sellador

## Bottleneck

En modo `stamp_placements` (sellos en múltiples posiciones), el sello se re-prepara (resize LANCZOS @300DPI + compresión) **por cada posición**, mientras que el path sin placements lo prepara una sola vez.

## Evidence (métrica)

- `backend/core/sellador.py:170-171` (`_apply_stamp_placements`):
  ```python
  for placement in stamp_placements:
      prepared = _prepare_stamp_image(...)        # dentro del loop
      stamp_page = _stamp_image_to_pdf_page(...)  # dentro del loop
  ```
- `_prepare_stamp_image` hace `Image.Resampling.LANCZOS` a 300 DPI; `_stamp_image_to_pdf_page` empaqueta los píxeles con compresión (zlib/Flate) — operaciones costosas repetidas para el **mismo** sello.
- Path sin placements (`apply_sellador:227-228`): prepara el sello **una vez** y lo reutiliza → demuestra que el sello es independiente de la posición.
- N placements → N re-encodes del mismo sello (O(N) en lugar de O(1)).

## Fix concreto que conserva funcionalidad

Preparar el sello **una sola vez** antes del bucle y reutilizar el `stamp_page` resultante para todas las posiciones. El sello ya renderizado no depende de (x, y); solo el `merge_page(transform=…)` cambia por placement.

```python
prepared = _prepare_stamp_image(...)        # 1 sola vez
stamp_page = _stamp_image_to_pdf_page(...)  # 1 sola vez
for placement in stamp_placements:
    page.merge_page(stamp_page, ... transform por placement ...)
```

Conserva: el número de sellos, sus posiciones, opacidad/rotación por placement, y el PDF resultante (mismas páginas). Solo se elimina el re-encode redundante.

> Nota: verificar con pypdf que `stamp_page` pueda mergearse múltiples veces (si `merge_page` muta la página fuente, clonar el `stamp_page` por placement con `copy.deepcopy` — sigue siendo O(1) encode + N clones livianos, igual que perf-02).

## Verificación

- Medir tiempo de `apply_sellador` con N=20 placements antes/después.
- Test funcional: comparar PDF de salida (páginas/render) con el actual para 1, 5 y 20 placements.
