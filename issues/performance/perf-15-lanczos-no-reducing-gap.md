# perf-15 — `LANCZOS` sin `reducing_gap` en downscale pesado (P3)

**Severidad:** P3
**Área:** Backend / imágenes / resize

## Bottleneck

Los downscales grandes usan `LANCZOS` directo sobre el raster completo, sin `reducing_gap`. Para imágenes muy grandes reducidas mucho, `LANCZOS` puro es más lento que un downscale multi-paso sin pérdida perceptible de calidad.

## Evidence (métrica)

- `backend/core/converter.py:175, 242, 251` y `backend/handlers/ubicaciones.py:595`: `Image.Resampling.LANCZOS` (o alias `getattr(Image, "Resampling", Image).LANCZOS`).
- Caso típico: 6000×4000 → 400 px (factor ~15×). LANCZOS opera sobre el raster completo en un solo paso.
- Pillow soporta `reducing_gap` en `thumbnail()`/`resize()` para downscales por etapas.

## Fix concreto que conserva funcionalidad

**Medir primero** la ganancia antes de cambiar (calidad es subjetiva). Para downscales con factor > ~2, pasar `reducing_gap=2.0` (o 3.0) en `thumbnail()`/`resize()`. Mismo tamaño de salida, mismo modo, mismo formato. La calidad es equivalente o mejor para downscales; `reducing_gap` solo afecta downscales (no cambia upscales).

```python
img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS, reducing_gap=2.0)
```

Conserva toda la salida existente (mismas dimensiones objetivo, mismo formato). No tocar los paths que ya redimensionan poco (factor ≤2) — YAGNI.

## Verificación

- Benchmark: redimensionar un set de imágenes 6000×4000 → 400 px antes/después; medir tiempo y comparar SSIM/PSNR contra la salida actual para confirmar que la calidad no degrada.
- Si la ganancia es <5 % o la calidad baja, **no** aplicar (dejar registro de la medición).
