# simplification-001 — Eliminar alias `_notify_complete` en `conversion.py` (Descartado → sin acción)

> **STATUS: NO APLICABLE (descartado por restricción de tests)**

## Skill
`simplification` + `doubt-driven`

## Ubicación
`backend/handlers/conversion.py:317`

```python
# Backwards-compatible alias (used internally by _run_conversion_job)
_notify_complete = _emit_complete_notifications
```

## Por qué parecía un Quick Win
El alias `_notify_complete = _emit_complete_notifications` solo sirve para llamar a `_emit_complete_notifications` desde `_run_conversion_job` (mismo archivo). Aparentemente redundante, eliminarlo y llamar directamente a `_emit_complete_notifications` reduciría 1 línea + ruido.

## Verificación de consumers (CRÍTICA — encontrado)

Búsqueda: `grep -r "_notify_complete" tests/`

**3 archivos de test parchean el alias directamente con monkeypatch:**

- `tests/test_rename_audit.py` (4 apariciones)
- `tests/test_conversion_record_sequence.py` (2 apariciones)
- `tests/test_conversion_mapping.py` (5 apariciones)

Ejemplo de patch de los tests:
```python
monkeypatch.setattr(conversion, "_notify_complete", lambda *a, **k: None)
```

Esto significa que los tests SUPONEN la existencia del atributo de módulo `conversion._notify_complete` para stubear las notificaciones de completitud. Si eliminamos el alias, los 3 archivos de tests fallan con `AttributeError: module 'conversion' has no attribute '_notify_complete'`.

## Restricción incumplida
- "Cualquier cambio en tipos/comportamiento debe ser verificado por los tests existentes SIN modificarlos." — Eliminar este atributo rompe los tests existentes.

## Decisión
**Descartado.** No tomar acción. El alias NO es accidental: es la superficie pública de monkey-patching de los tests. Si en el futuro se quieren consolidar, primero hay que cambiar los tests para parchear `_emit_complete_notifications` directamente (lo cual requiere autorización del usuario para tocar tests).

## Alternativa viable (si se admite tocar tests)
Sustituir en los 3 archivos de test todos los `setattr(conversion, "_notify_complete", ...)` por `setattr(conversion, "_emit_complete_notifications", ...)`. Mantiene la aserción. Pero requiere modificar tests → fuera del scope de esta auditoría.
