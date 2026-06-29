# simplification-009 — Documentar dependencia de cascada del CSS del date-picker (sin mover)

## Skill
`frontend` + `doubt-driven`

> **DECISIÓN: NO MOVER el CSS.** Solo documentar el acoplamiento y reducir el riesgo futuro. La auditoría previa proponía mover el bloque `.app-date-picker-*` a CSS module; verificación muestra que rompería la cascada.

## Ubicación
`frontend/src/index.css` líneas ~160-280 (~120 reglas `.app-date-picker-*`)

## Verificación de consumers
DOS componentes `DatePicker.tsx`:
- `frontend/src/components/ui/DatePicker.tsx` (estándar, aplica `.app-date-picker-*`)
- `frontend/src/components/volantes/components/DatePicker.tsx` (variant, también aplica `.app-date-picker-*`)

Clientes del primero:
- `frontend/src/components/volantes/VolantesView.tsx` (importa el DatePicker de `volantes/components/`, no el de `ui/`)
- `frontend/src/components/panel-aviso-corte/components/HeaderForm.tsx`
- `frontend/src/components/padron/PadronView.tsx`

**Cascada dependiente:**
```css
/* frontend/src/components/padron/vpad-styles.css */
.vpad-field .app-date-picker-trigger { … }
.vpad-field .app-date-picker-trigger:hover:not(:disabled) { … }
.vpad-field .app-date-picker-trigger:focus-visible,
.vpad-field .app-date-picker-trigger.is-open { … }
[data-theme="light"] .vpad-field .app-date-picker-trigger { … }
```

`vpad-styles.css` redefine `.app-date-picker-*` con especificidad `.vpad-field` (mayor que la clase suelta). Si se mueve el CSS base fuera del global (a un CSS module), `vpad-styles.css` ya no encontrará la regla base y/o el orden de cascada podría romper el override.

## Propuesta (acción segura)
1. **No mover las reglas.** Mantenerlas en `index.css`.

2. Agregar al inicio del bloque CSS un comentario de advertencia (sin tocar CSS):

```css
/* ─── DatePicker: NO EXTRAER a CSS module ─────────────────--------------- */
/* vpad-styles.css overrides .app-date-picker-* con especificidad .vpad-   */
/* field. Mover estas reglas fuera del CSS global rompería la cascada del   */
/* tema claro/oscuro del PadronView. Ver issues/simplification/009.          */
```

3. Opcional: si se quiere encapsular, refactor PRIMERO `vpad-styles.css` para llevar sus overrides al CSS module del PadronView, y recién entonces extraer. Eso requiere tocar el archivo de overrides (no los tests) — fuera de scope de Quick Win.

## Cambio de comportamiento
Ninguno (solo documento).

## Riesgo de migración
Ninguno.

## Verificación
Ningún comando necesario. La acción es solo de documentación.

Si en el futuro se decide extraer el bloque, el plan de migración correcto es:
1. Mover TODOS los overrides `.vpad-field .app-date-picker-*` de `vpad-styles.css` al CSS module del `PadronView.tsx`.
2. Entonces mover las reglas base `.app-date-picker-*` a un CSS module del `components/ui/DatePicker.tsx`.
3. Verificar visualmente PadronView con theme light + theme dark.
