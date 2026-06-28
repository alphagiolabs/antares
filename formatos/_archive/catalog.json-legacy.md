# catálogo legacy (sin uso)

Este archivo **NO se lee en runtime**. El catálogo activo está en
`data/formatos/catalog.json` (resuelto por `_CATALOG_PATH` en
`backend/core/formatos.py`). Ver `issues/simplification/simplification-023-...md`
para la triple fuente de verdad de formatos built-in.

Movido desde `formatos/catalog.json` (simplification-007). Conservado por
historial: era un duplicado con valores **divergentes** del catálogo activo y de
`_BUILTIN_FORMATS` en Python (ej. `televisiva.y = 41.0` aquí vs `25` en Python;
`maquina.height = 21.0` aquí vs `20` en Python), lo que inducía a creer que
editarlo cambiaba el catálogo en runtime. No lo hacía.

Los archivos `.b64` (`template-d.b64`, `maquina.b64`, `televisiva.b64`) **sí** se
leen vía `_resolve_path` y permanecen en `formatos/` (sin cambios).

## Contenido original (formatos/catalog.json)

```json
[
  {
    "id": "template-d",
    "nombre": "Formato D (SEDAPAL)",
    "origen": "builtin",
    "storage_path": "template-d.b64",
    "enabled": true,
    "persisted": true,
    "strategy": "legacy_xobject",
    "mapping": null,
    "filename_pattern": "formato_d_{desde}.pdf",
    "max_pages": 500,
    "number_min": 1,
    "number_max": 9999999,
    "has_mapping": false
  },
  {
    "id": "maquina",
    "nombre": "Máquina",
    "origen": "builtin",
    "storage_path": "maquina.b64",
    "enabled": true,
    "persisted": true,
    "strategy": "visual_overlay",
    "mapping": {
      "page": 0,
      "x": 535.0,
      "y": 25.0,
      "width": 140.0,
      "height": 21.0,
      "font_size": 13.0,
      "font_name": "Helvetica-Bold",
      "color_r": 0.1176,
      "color_g": 0.2275,
      "color_b": 0.5412,
      "padding": 5,
      "blank_x": null,
      "blank_y": null,
      "blank_width": null,
      "blank_height": null,
      "redraw_top_border": false,
      "redraw_ot_badge": false,
      "blank_mcids": null
    },
    "filename_pattern": "maquina_{desde}.pdf",
    "max_pages": 500,
    "number_min": 1,
    "number_max": 9999999,
    "has_mapping": true
  },
  {
    "id": "televisiva",
    "nombre": "Televisiva",
    "origen": "builtin",
    "storage_path": "televisiva.b64",
    "enabled": true,
    "persisted": true,
    "strategy": "visual_overlay",
    "mapping": {
      "page": 0,
      "x": 534.0,
      "y": 41.0,
      "width": 150.0,
      "height": 24.0,
      "font_size": 13.0,
      "font_name": "Helvetica-Bold",
      "color_r": 0.1176,
      "color_g": 0.2275,
      "color_b": 0.5412,
      "padding": 5,
      "blank_x": null,
      "blank_y": null,
      "blank_width": null,
      "blank_height": null,
      "redraw_top_border": false,
      "redraw_ot_badge": false,
      "blank_mcids": [
        63
      ]
    },
    "filename_pattern": "televisiva_{desde}.pdf",
    "max_pages": 500,
    "number_min": 1,
    "number_max": 9999999,
    "has_mapping": true
  }
]
```
