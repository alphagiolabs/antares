# perf-03 — Ubicaciones: tiles OSM fetcheados secuencialmente (P1)

**Severidad:** P1
**Área:** Backend / ubicaciones / red

## Bottleneck

`_fetch_osm_tiles_map` descarga los tiles de OpenStreetMap con bucles anidados y una llamada HTTP **bloqueante y secuencial** por tile. La latencia total es la suma de los RTT de cada tile en lugar del máximo.

## Evidence (métrica)

- `backend/handlers/ubicaciones.py:335-348`:
  ```python
  for ty in range(...):           # filas de tiles
      for tx in range(...):       # columnas de tiles
          data = _http_get(url, headers)   # bloqueante, secuencial
          ...
  ```
- Viewport 1024×1024 px a zoom 18 ≈ cuadrícula 4×4 = **16 tiles** por imagen.
- Cada `_http_get` es un `urllib.request.urlopen` con timeout; con RTT ~150–250 ms, 16 tiles seriales ≈ **2.4–4.0 s** de latencia por imagen de mapa.
- El cache (`_get_cached_map_screenshot`, LRU 40) solo ayuda si las coords se repiten; para coords únicas cada fila incurre el costo completo.

## Fix concreto que conserva funcionalidad

Fetchear los tiles **en paralelo** con `concurrent.futures.ThreadPoolExecutor` (operación I/O-bound, el GIL libera en `urlopen`). Componer la imagen después de recolectar todos los bytes, respetando el mismo orden (tx, ty) → posición de píxel. Sin cambios en la composición final ni en el formato de salida.

```python
from concurrent.futures import ThreadPoolExecutor

def _fetch_one(tx, ty):
    return (tx, ty, _http_get(url_for(tx, ty), headers))

with ThreadPoolExecutor(max_workers=8) as ex:
    results = list(ex.map(lambda c: _fetch_one(*c), coords))
# luego componer en el mismo orden que hoy
```

Limitar `max_workers` (p.ej. 8) para no abusar de los tile servers de OSM (policy de uso razonable de OSM). Reducción esperada: 16 RTT seriales → 2 rondas de 8 → ~4–8× menos wall-time por imagen.

## Verificación

- Medir wall-time de `render_imagen_ubicacion` para N coords únicas antes/después.
- Test funcional: pixel-idéntica la imagen compuesta para un viewport dado (mismas tiles, mismo orden).
