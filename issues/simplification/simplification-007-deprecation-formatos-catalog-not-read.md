# simplification-007 — Archivar `formatos/catalog.json` (no leído en runtime)

## Skill
`deprecation` + `doubt-driven`

## Ubicación
`formatos/catalog.json` (raíz del repo, 2.1KB)

NO confundir con `data/formatos/catalog.json` (este SÍ se lee en runtime).

## Por qué es un problema (confirmado)
`backend/core/formatos.py:25-26` define:
```python
_BUILTIN_DIR = _PROJECT_DIR / "formatos"
_CATALOG_PATH = _DATA_DIR / "catalog.json"     # ← SOLO este es leído
```

`_load_catalog` (líneas ~118+) abre `_CATALOG_PATH` (que es `data/formatos/catalog.json`). NUNCA abre `formatos/catalog.json`.

`formatos/` SOLO se usa para resolver storage_path de plantillas built-in (`_BUILTIN_DIR / fname`, en `_resolve_path`), que espera archivos `.b64`, no `catalog.json`.

Verificación:
```
grep -rn "BUILTIN_DIR / \"catalog" backend/      → sin resultados
grep -rn "formatos/catalog.json" backend/        → sin resultados
```

El `formatos/catalog.json` es un archivo huérfano que duplica (con valores divergentes) la data leída de `data/formatos/catalog.json`. Fuente de confusión si alguien cree que está "editando el catálogo".

## Verificación de consumers
- Lectura en runtime: cero (confirmado arriba).
- Lectura por tests/build scripts: `grep -rn "formatos/catalog" tests/ scripts/ electron/` → sin resultados.

## Propuesta
Mover `formatos/catalog.json` a `formatos/_archive/catalog.json-legacy.md` con un README breve:

```
# catálogo legacy (sin uso)
Este archivo NO se lee en runtime. El catálogo activo está en data/formatos/catalog.json
(ver simplification-023 para la triple fuente de verdad). Conservado por historial.
```

Mantener todos los `.b64` en `formatos/` intactos — esos SÍ se leen.

## Cambio de comportamiento
Ninguno. Cero lectores.

## Riesgo de migración
Ninguno. Move-only de un archivo que nadie lee.

## Verificación
```bash
cd backend && python -m pytest ../tests/test_formatos_*.py -v
```

Los tests leen `data/formatos/catalog.json` (vía `monkeypatch` de `_CATALOG_PATH` o directorio `data/formatos/`). El move de `formatos/catalog.json` no los afecta.

Discutir con el dueño del repo antes de mover si se quiere mantener `.b64` + `catalog.json` juntos como "fuente canónica del repo" en algún flujo manual (no encontrado).
