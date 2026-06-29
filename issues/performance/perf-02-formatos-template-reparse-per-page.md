# perf-02 — Formatos PDF re-parsea el template completo por cada página (P1)

**Severidad:** P1
**Área:** Backend / PDF / formatos

## Bottleneck

La generación de PDFs numerados (`formatos_generate`) crea un `PdfReader` a partir de los `template_bytes` **dentro** del bucle de páginas, re-parseando el mismo PDF en cada iteración. Con `max_pages=500`, un template de cientos de KB se parsea hasta 500 veces.

## Evidence (métrica)

- `backend/core/format_strategies/visual_overlay.py:152`:
  ```python
  for number in range(desde, hasta + 1):
      ...
      reader = PdfReader(io.BytesIO(template_bytes))   # dentro del loop
  ```
- `backend/core/format_strategies/simple_overlay.py:168`: mismo patrón, `PdfReader(io.BytesIO(template_bytes))` dentro del loop.
- Templates builtin (base64): `televisiva.b64` 352 KB (~260 KB binario), `template-d.b64` 327 KB, `maquina.b64` 221 KB.
- Costo: O(N páginas) parses + decodificación del stream, cuando el parseo del template es independiente del número.
- `backend/core/formatos.py` (`_load_template_bytes`) ya cachea los bytes decodificados (LRU), por lo que el cuello es **el parseo pypdf repetido**, no la lectura de disco.

## Fix concreto que conserva funcionalidad

Parsear el template **una sola vez** fuera del bucle y clonar la página target por iteración. Conserva exactamente las mismas páginas de salida (mismo número, mismo overlay, mismo `page.merge_page`/`writer.add_page`).

```python
reader = PdfReader(io.BytesIO(template_bytes))   # 1 sola vez
src_page = reader.pages[target_page_idx]
for number in range(desde, hasta + 1):
    page = copy.deepcopy(src_page)               # o pypdf clone si disponible
    # ... overlay del número sobre `page` ...
    writer.add_page(page)
```

Si `deepcopy` de `PageObject` resulta costoso o frágil, alternativa: re-leer `template_bytes` (ya cacheados) pero sin re-decodificar base64; **medir** `deepcopy(src_page)` vs `PdfReader(io.BytesIO(template_bytes)).pages[i]` para elegir la ruta más rápida. Reducción esperada: parsing O(N) → O(1) + N clones livianos.

## Verificación

- Test de performance: generar 500 páginas y medir tiempo total antes/después (cProfile en `formatos_generate`).
- Test de regresión funcional: comparar byte-a-byte (o páginas/render) con salida actual para 1, 10 y 500 páginas.
