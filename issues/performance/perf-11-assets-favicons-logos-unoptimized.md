# perf-11 — Assets sin optimizar: favicons oversized + 16 variantes + logos PNG (P2)

**Severidad:** P2
**Área:** Assets / installer / static

## Bottleneck

`frontend/public/` contiene favicons PNG oversized y ~16 variantes boilerplate web (apple-touch, android, etc.) innecesarias en una app de escritorio Electron, además de logos PNG que podrían ser WebP/SVG. Todo este peso va al installer.

## Evidence (métrica)

| Archivo | Tamaño |
|---------|--------|
| `favicon1.png` | 112 KB |
| `favicon2.png` | 108 KB |
| `logo1.png` | 55 KB |
| `logo2.png` | 49 KB |
| 16 variantes favicon (16–228px) | ~400 KB total |
| **Total favicons/logos** | **~620 KB** en `public/` |

- Electron usa `assets/icon.ico` (11 KB) / `icon.icns` (78 KB) para ventana/barra de tareas — los favicons web son en gran parte redundantes.
- `index.html` referencia solo algunos favicons; el resto son boilerplate copiado de un template web.

## Fix concreto que conserva funcionalidad

1. **Auditar referencias**: grep `<link rel=` en `index.html` y `manifest` (si existe) para saber qué favicons se referencian realmente; **eliminar los no referenciados** (no se borra nada que el `index.html` use).
2. **Optimizar los que quedan**:
   - Favicons: re-exportar a tamaño correcto y comprimir (o WebP si el `link type` lo soporta). Un favicon 16×16/32×32 no debería pesar >2–5 KB.
   - Logos `logo1.png`/`logo2.png`: convertir a **WebP** (con transparencia) o **SVG** si son vectoriales; reducción esperada ~5–10×.
3. Conservar el `icon.ico`/`icon.icns` de `assets/` intactos (son los que Electron usa para la ventana).

No se elimina ninguna funcionalidad ni imagen en uso; se comprimen/eliminan solo los assets redundantes o no referenciados.

## Verificación

- `Get-ChildItem frontend/public` antes/después: delta de KB.
- Abrir la app y la ventana: ícono de ventana/barra de tareas idéntico; login/logos se ven igual (mismo pixel art, nuevo formato).
- Verificar `index.html` no queda con `<link>` rotos a favicons eliminados.

## Resultado (2026-06-27) — IMPLEMENTADO

Auditoría de referencias: `index.html` referencia `favicon.ico`, `favicon-32/96/128/152/180.png` y `icon.png` (256). `BrandMark.tsx` referencia `favicon1/2.png` (ojo) y `logo1/2.png` (texto). No existe `manifest.webmanifest`. Las 4 marcas grandes eran **oversize en píxeles**, no solo bytes: `favicon1/2.png` 2000×2000 renderizadas a 24–30 px; `logo1/2.png` 1749×400 renderizadas a maxHeight 30–40 px.

Acción (conserva funcionalidad, **0 edits de código** — mismos nombres de archivo):

1. **Re-exportar las 4 marcas** a tamaño retina-safe con LANCZOS + `optimize=True` (Pillow, dep ya instalada), mismas rutas:
   | Archivo | Antes | Después |
   |---|---|---|
   | `favicon1.png` | 2000×2000, 110 KB | 96×96, 5.1 KB |
   | `favicon2.png` | 2000×2000, 106 KB | 96×96, 4.9 KB |
   | `logo1.png` | 1749×400, 54 KB | 525×120, 21.8 KB |
   | `logo2.png` | 1749×400, 49 KB | 525×120, 19.3 KB |
   (96 px = 3× del render md=30; 120 px alto = 3× del render md=40 — cubre displays 3×. RGBA/transparencia preservada.)
2. **Eliminar 8 variantes boilerplate no referenciadas**: `favicon-16/48/57/72/120/144/192/228.png` (verificado: ninguna aparece en `index.html` ni en código). Ahorro 43 KB.
3. **Conservar intactos** `favicon.ico`, `favicon-32/96/128/152/180.png`, `icon.png` (referenciados y ya a tamaño correcto) y `assets/icon.ico`/`icon.icns` (ícono de ventana Electron).

**Ahorro total: ~317 KB** del installer (273 KB de las 4 marcas + 43 KB de variantes + ~1 KB extra). `BrandMark.test.tsx` pasa; los 11 assets referenciados existen; `index.html` sin `<link>` rotos. Visual idéntico (mismo pixel art, menor resolución de fuente — invisible a 24–40 px de render).
