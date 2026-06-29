# simplification-011 — Renombrar templates HTML con espacios en el nombre

## Skill
`deprecation` + `doubt-driven`

## Ubicación
`backend/templates/`

```
aniegos chorrillos.html          (12.1KB)
volan maq balde sjl.html          (16.8KB)
```

(otros 15 archivos usan guiones/guiones-bajos consistentes)

## Por qué es un problema
1. Nombres con espacios rompen URIs, complican CLI (`cat "aniegos chorrillos.html"`), y son inconsistentes con el resto.
2. `backend/handlers/templates.py:templates_list` devuelve `{id: f.stem, name: f.name, filename: f.name}` para todos los `*.html` del directorio → estos archivos aparecen con `id="aniegos chorrillos"` (espacios en el id) y `filename="aniegos chorrillos.html"`.
3. `template_get` valida con `target.relative_to(templates_dir.resolve())` — los espacios funcionan, pero el frontend que consume `templates_list` puede tener problemas con el id con espacios (depende de cómo se use en keys de objetos en JS).

## Verificación de consumers
`grep -r "aniegos\|chorrillos\|volan maq" frontend/` → buscar si el frontend los lista/selecciona por id.

**Resultado al momento de la auditoría: no se encontraron referencias hardcodeadas.** El frontend obtiene la lista dinámicamente desde `templates_list`.

Sin embargo, no se puede garantizar sin correr la UI que estos templates estén en uso (algunos tienen contenido SJL/chorrillos — posiblemente templates en producción).

## Propuesta (conservadora, sin borrar)
1. **Verificar consumo real primero** con el dueño del producto (¿aparecen en la UI de "Reportes campo"? ¿son plantillas obsoletas?).
2. Si la respuesta es "sí en uso": renombrar a `aniegos-chorrillos.html` y `volan-maq-balde-sjl.html`. NO cambiar el `id` expuesto (usar `f.stem` ya devuelve "aniegos-chorrillos" automáticamente).
3. Si la respuesta es "no / no se sabe": archivar a `backend/templates/_archive/` (mantenerlos accesibles en git history + en disco, pero fuera del listado de `templates_list`). Ajustar `templates_list` para filtrar `_archive/`:

```python
def templates_list(params: dict[str, Any]) -> dict[str, list[dict[str, str]]]:
    templates_dir = _preview_templates_dir()
    if not templates_dir.exists():
        return {"templates": []}
    return {"templates": [
        {"id": f.stem, "name": f.name, "filename": f.name}
        for f in sorted(templates_dir.glob("*.html"))
        if not f.name.startswith("_")   # ← excluir _archive/ (ya no glob aquí porque _archive/ es subdir)
    ]}
```

Detalle técnico: `templates_dir.glob("*.html")` no recorre subdirs, así que mover a `_archive/` (subdir) los quita del listado automáticamente sin tocar código.

## Cambio de comportamiento
- Si se renombran: el id (f.stem) pasa de "aniegos chorrillos" a "aniegos-chorrillos" — si el frontend persistía el id (no encontrado → no persiste), cambio inobservable. Si persistía: cambio requeriría migración.
- Si se archivan: dejan de aparecer en `templates_list` → el frontend ya no los ofrece. CAMBIO DE COMPORTAMIENTO.

## Riesgo de migración
Medio (rename) / Medio (archive, porque cambia el listado). Require verificación con dueño del producto.

## Verificación
```bash
# Antes de cualquier acción, correr:
cd backend && python -m pytest ../tests/test_handlers.py -v
node tests/test-electron-ipc-allowlist.js    # allowlist no incluye templates → no afecta

# Después (si se renombran):
cd backend && python -m pytest ../tests/test_handlers.py -v
# Manual: lanzar UI, abrir pestaña Reportes campo (o donde se listen plantillas), verificar que las renombradas siguen disponibles y se renderizan.

# Después (si se archivan):
cd backend && python -m pytest ../tests/test_handlers.py -v
# Manual: lanzar UI, verificar que NO aparecen, y que las activas siguen apareciendo.
```

## Acción recomendada
**No tomar acción hasta confirmar con el dueño del producto.** Crear issue de verificación y discutir antes.
