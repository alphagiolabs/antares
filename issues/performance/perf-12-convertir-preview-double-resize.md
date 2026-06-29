# perf-12 — `convertir_a_preview`: doble resize cuando se provee `resize` explícito (P3)

**Severidad:** P3
**Área:** Backend / imágenes / preview

## Bottleneck

`convertir_a_preview` siempre redimensiona a 400 px (lado más largo) y, si se provee `resize` explícito, vuelve a redimensionar. Si el `resize` explícito es >400 px, hace **upsampling** desde la imagen de 400 px → resultado borroso + CPU desperdiciada.

## Evidence (métrica)

- `backend/core/converter.py` (`convertir_a_preview`):
  - Línea 242: resize a **400 px** máximo (siempre).
  - Líneas 250-251: si se pasa `resize`, se vuelve a redimensionar a ese tamaño.
- Doble resize = dos pases LANCZOS (ver perf-15) sobre la misma imagen.
- Caso de degradación: `resize=800` → la preview sale interpolada desde 400 px (blur).

## Fix concreto que conserva funcionalidad

Si se provee `resize`, aplicarlo **directamente** sobre la imagen original (clamp-eado a un máximo razonable de preview, p.ej. 1200 px para no exceder el caso de uso de preview), saltando el resize intermedio a 400 px. Si no se provee `resize`, conservar el comportamiento actual (400 px). Misma firma, misma salida para el path sin `resize`.

```python
if resize:
    target = resize
    # opcional: clamp(target, 1, MAX_PREVIEW)
else:
    target = 400
img = img.resize(...)   # un solo paso
```

Conserva el contrato de la función y todas las llamadas existentes.

## Verificación

- Test: llamar `convertir_a_preview` con `resize=800` sobre una imagen 3000×2000 y verificar que la salida no está interpolada desde 400 (comparar nitidez/proporciones con un resize directo).
- Medir CPU por preview antes/después (un paso menos de LANCZOS).
