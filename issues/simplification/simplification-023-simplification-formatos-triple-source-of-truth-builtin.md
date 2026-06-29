# simplification-023 — Eliminar la triple fuente de verdad de formatos built-in

## Skill
`code-review` (architecture) + `deprecation` + `simplification` + `performance` (build size)

## Ubicación (3 fuentes, todas divergentes)
1. `backend/core/formatos.py:34-100` — `_BUILTIN_FORMATS` hardcoded en Python con mapeos completos.
2. `formatos/catalog.json` — archivos con espacios en mapeos, redondeados a enteros (DEPRECADO en runtime, ver 007).
3. `data/formatos/catalog.json` — el ÚNICO que se lee en runtime. Mapeos con valores float distintos.

**Inconsistencia confirmada (al momento de la auditoría):**

| Mapeo | `_BUILTIN_FORMATS` (Python) | `data/formatos/catalog.json` |
|-------|------------------------------|------------------------------|
| maquina.x | 535 | 531.47 |
| maquina.y | 26 | 24.60 |
| maquina.width | 140 | 27.23 |
| televisiva.x | 534 | 530.57 |

Los mapeos YA están desincronizados entre las 3 fuentes. Si el código Python toma `_BUILTIN_FORMATS` (que es lo que hace en `_load_catalog`), el usuario ve números corridos en distintas posiciones según si el catálogo se carga de Python o de disco.

## Por qué es un problema
- 3 lugares donde editar la posición del número correlativo.
- Ya divergentes → bug real en producción (los números del Formato "Máquina" aparecen en X=535 si se carga desde Python vs X=531.47 si el usuario persistió una vez el catálogo en `data/`).
- Build size: `template-d.b64` (327KB) es legítimo (PDF base). Los `catalog.json` son chicos. PERO el problema es de CORRECTNESS visual, no de tamaño.

## Verificación de consumers
- `_load_catalog` en `formatos.py` fusiona `_BUILTIN_FORMATS` con el catálogo de disco: los IDs built-in SIEMPRE sobreviven (aunque su `mapping` puede ser overriden por el catálogo persistido). Es decir, si `data/formatos/catalog.json` NO existe, los mapeos X=535 ganan; si existe, los del catálogo pueden pisar los de Python.

```python
# extracto _load_catalog:
if fid in new_formats and new_formats[fid]["origen"] == "builtin":
    if raw.get("mapping") is not None:
        new_formats[fid]["mapping"] = raw["mapping"]   # ← OVERRIDE de Python built-in
        new_formats[fid]["has_mapping"] = True
```

→ El catálogo de disco puede sobrescribir los mapeos Python built-in. Esto significa que el valor X=535 vs 531.47 NO es determinista sin inspeccionar ambos archivos.

Tests:
- `tests/test_formatos_handlers.py` — usa fixtures específicas (no cubren drift entre catálogos).
- Sin tests que comparen `_BUILTIN_FORMATS` vs `data/formatos/catalog.json` para built-in consistency.

## Propuesta (SSoT en Python + generación de catálogo)
1. **`backend/core/formatos.py:_BUILTIN_FORMATS`** es el single source of truth para los mapeos built-in.

2. Las constantes `_BUILTIN_FORMATS` se LIMPIAN para que sean consistentes consigo mismas (elegir una versión como correcta: ¿la de Python o la de `data/formatos/catalog.json`?). Decisión necesaria: ¿qué mapeos son visualmente correctos hoy?
   - Si son los de Python (X=535): forzar `data/formatos/catalog.json` a tener esos valores.
   - Si son los de `data/formatos/catalog.json` (X=531.47): actualizar `_BUILTIN_FORMATS` en Python.

3. Crear `scripts/sync_formatos_catalog.py` (o JS) que genera `data/formatos/catalog.json` desde `_BUILTIN_FORMATS` de Python en build time.

4. Modificar `_load_catalog`: NO permitir override de mapeos built-in desde el catálogo persistido (los built-in son fixos). El catálogo persistido SOLO añade formatos `uploaded` (origen == "uploaded").

5. Borarr `formatos/catalog.json` (ya no-leído, ver 007 — archive).

## Cambio de comportamiento
- **CAMBIO DE COMPORTAMIENTO INTENCIONAL pero VISUALMENTE DETERMINISTA:** si hoy un usuario en producción tiene `data/formatos/catalog.json` con X=531.47 (overrideando a Python), después del refactor ese override se pierde y se aplica X=535 (o viceversa). El render cambia de posición del número correlativo.

ESTO ES UN BUG FIX pero también un cambio de output. Cumple la restricción "no cambiar el formato de salida" solo en el sentido "sigue siendo PDF" — la POSICIÓN del número cambia. Requiere validación visual.

## Restricción a evaluar
- "No se puede cambiar el formato de salida de archivos (PDF, Excel, imágenes)" — interpretación literal: si la posición del número correlativo cambia, el PDF es "diferente". Strict compliance: NO. Practical: yes (bug fix).

## Riesgo de migración
Alto. Cambia el render del Formato "Máquina"/"Televisiva" para usuarios en producción. Hay que:
1. Confirmar con dueño del producto cuál de los 3 sets de mapeos es el CORRECTO (visualmente).
2. Aplicar a las 3 fuentes (o solo a Python + regenerar catálogo).
3. Visual diff pixel-a-pixel con códigos 1, 12345, 1234567 sobre los formatos built-in.

## Verificación
```bash
# Antes:
python -c "import json; d=json.load(open('data/formatos/catalog.json')); print([f['mapping'] for f in d if f.get('mapping')])"
python -c "from backend.core.formatos import _BUILTIN_FORMATS; print([f['mapping'] for f in _BUILTIN_FORMATS if f.get('mapping')])"
# Comparar manualmente.

# Después del refactor:
cd backend && python -m pytest ../tests/test_formatos_*.py -v
node scripts/sync_formatos_catalog.py    # si fue creado
# Visual: generar PDF de Máquina para códigos 1, 100000, 9999999 y comparar con un PDF generado pre-refactor.
```

## Acción recomendada
**NO aplicar este refactor sin decisión del dueño del producto sobre qué mapeo es correcto.** Documentar el drift en el issue y pedir confirmación.
