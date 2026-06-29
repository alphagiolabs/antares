# simplification-025 — Decisión: ¿reemplazar `legacy_xobject` strategy por overlay? (open question)

## Skill
`doubt-driven` + `deprecation`

## Ubicación
- `backend/core/format_strategies/legacy_xobject.py` (110 líneas)
- `backend/core/format_strategies/__init__.py:5,14` (registro)
- `backend/core/formatos.py:31` (`LEGACY_XOBJECT = "legacy_xobject"`)
- `frontend/src/types.ts:MappingStrategy`
- `frontend/src/components/formatos/FormatosView.tsx` (dos branches basados en `legacy_xobject`)
- `formatos/catalog.json` y `data/formatos/catalog.json` — entry `template-d` con `strategy: legacy_xobject`.
- `formatos/template-d.b64` (327KB) — el PDF template en sí.

## Por qué es cuestionable
`LegacyXObjectStrategy.generate` hace cirugía de bajo nivel sobre los bytes del PDF: parsea `xobject.set_data((...).encode("latin-1"))` con marcadores mágicos `b"1 0 0 rg"`, `b"/H2 <</MCID 93 >> BDC"`, contando `Tj` tokens (`_NUMBER_XOBJECT_DRAW_COUNT = 7`). Es decir, depende de la estructura interna específica del PDF "Formato D SEDAPAL".

Si el PDF original (que produce el template `template-d.b64`) fuera regenerable, se podría sustituir por una plantilla con una caja blanca donde el número correlativo se dibuje con `VisualOverlayStrategy` (texto en posición XY con color RGB configurable, igual que "Máquina" y "Televisiva"). Eliminaría el hacky xobject path.

PERO: el template `template-d.b64` viene aparentemente de SEDAPAL (empresa externa). Si es un documento oficial con firma electrónica o con metadata específica del sistema SEDAPAL, regenerarlo rompe compliance.

## Verificación de consumers

### runtime
- `_strategies["legacy_xobject"]` registrado en `__init__.py:14`.
- `formatos.py` invoca `get_strategy(fmt["strategy"]).generate(...)` — si `strategy == "legacy_xobject"`, llama a `LegacyXObjectStrategy().generate`.

### Frontend
`grep "legacy_xobject" frontend/`:
```
.\src\types.ts:export type MappingStrategy = 'legacy_xobject' | 'visual_overlay' | 'simple_overlay';
.\src\components\formatos\FormatosView.tsx:    return isValid && (format.strategy === 'legacy_xobject' || format.strategy === 'simple_overlay' || format.has_mapping);
.\src\components\formatos\FormatosView.tsx:    const canGenerate = isValid && (selected?.strategy === 'legacy_xobject' || selected?.strategy === 'simple_overlay' || selected?.has_mapping);
```

El frontend SÍ usa el string `'legacy_xobject'` en 2 ramas de UI (probablemente para decidir cuándo mostrar el UI de configuración XY de mapeo). Eliminar el strategy requiere tocar el frontend.

### Tests
`grep "legacy_xobject\|LegacyXObjectStrategy" tests/`:

```
.\tests\test_formatos_handlers.py → posiblemente
```

(Verificar si test_formatos_handlers fixturea un Formato D y lo procesa. Si lo hace, eliminar rompe el test.)

## Decisión requerida (preguntas)
1. ¿El template `template-d.b64` (Formato D SEDAPAL) es editable / regenerable por el equipo, o viene de un sistema externo inmutable?
2. Si es regenerable: ¿se puede sustituir por una nueva plantilla con un cuadro blanco + estrategia VisualOverlay, manteniendo el mismo aspecto visual (incluyendo membrete, firma, etc.)?
3. Si la firma electrónica / metadata del PDF original es requerida: NO se puede migrar — el strategy queda como deuda técnica permanente.

## Propuesta (acción segura: SOLO decisión)
1. Documentar la dependencia de la estructura interna del PDF template en el código de `legacy_xobject.py` con comentarios explicativos (si no ya).
2. NO eliminar: cubierto por handler activo, frontend activo, y consumer en producción ("Formato D" aparece en pestaña Formatos).
3. Abrir el issue al dueño del producto: ¿regenerar el template o dejar como deuda?

## Cambio de comportamiento
Ninguno (acción = solo documento).

## Riesgo de migración
Ninguno (acción = solo documento).

## Verificación
Ninguna (acción = solo documento).

## Alternativas (si la decisión fuera "regenerar")
1. Generar nuevo PDF template "Formato D" con la apariencia SEDAPAL pero con un rectángulo blanco donde va el número correlativo. Guardar como `template-d-v2.b64`.
2. Cambiar `data/formatos/catalog.json` entry de "template-d": cambiar `strategy: legacy_xobject` → `visual_overlay`, añadir `mapping: {page:0, x:..., y:..., width:..., height:..., font_size:..., font_name:"Helvetica-Bold", color_r:..., color_g:..., color_b:...}`.
3. Actualizar `frontend/src/types.ts:MappingStrategy` para quitar `'legacy_xobject'`.
4. Actualizar `frontend/src/components/formatos/FormatosView.tsx` para quitar branches en `legacy_xobject`.
5. Borrar `backend/core/format_strategies/legacy_xobject.py` y la línea de registro en `__init__.py`.
6. Borrar `LEGACY_XOBJECT = "legacy_xobject"` de `formatos.py` (cuidado: hay tests que lo pueden referenciar — verificar antes de borrar).
7. Visual diff: generar el Formato D con códigos 1, 100, 9999999 y comparar con un PDF generado pre-migración.

Etapas 5-6 eliminan ~120 líneas. Etapas 3-4 eliminan código frontend. Cuidado con tests.

## Recomendación final
Esperar respuesta sobre el estatus del template SEDAPAL. Mientras tanto, documentar.
