# simplification-024 — Decisión: ¿mantener el sistema de plugins del backend? (open question)

## Skill
`doubt-driven` + `deprecation` + `security`

## Ubicación
- `backend/core/plugins.py` (155 líneas, AST sandbox + fingerprinting)
- `backend/core/format_registry.py` (50 líneas, registry expuesto a plugins)
- Llamada en runtime: `backend/main.py:36` → `load_plugins_from_dir()` en startup.

## Por qué es cuestionable
El subsistema completo de plugins:

1. Implementa un AST sandbox casero (`_is_safe_plugin`) que bloquea imports/nombres/atributos peligrosos. El propio comentario del code admite: "Treat third-party plugins as use at your own risk. The AST walk gives false sense of security."
2. Expone `PluginRegistry.add_format(name, ext, modes, encoder)` para que plugins registren formatos de imagen nuevos.
3. Se invoca en startup, lee `user_data_path("plugins")/*.py`.

Preguntas doubt-driven:
- ¿Hay plugins en uso en algún deployment real?
- `get_registry().list_formats()` expuesto por el handler `plugin_formats` (`backend/handlers/info.py`) — ¿el frontend alguna vez muestra formatos de plugins?

## Verificación de consumers

### Backend
- `load_plugins_from_dir` llamado en `backend/main.py:36` dentro del bloque `try: … Exception: log`.
- `_is_safe_plugin` no se llama directamente desde fuera del módulo.
- `PluginRegistry.add_format` SOLO llamado por `module.register(registry)` dentro del exec_module (es decir, por plugins cargados).

### Tests
- `tests/test_plugins.py` (2.3KB) — valida comportamiento de `_is_safe_plugin` con plugins de fixture y carga exitosa/fallida.

### Frontend
Búsqueda `grep -r "plugin_formats\|pluginFormats" frontend/`:

```
.\src\api.ts:  plugin_formats: (params?: Record<string, unknown>) => api.invoke<PluginFormatsResult>('plugin_formats', params),
.\src\api.ts:  PluginFormatsResult,  # type alias
.\electron\ipc-methods.js:  'plugin_formats',
```

Existe un handler. ¿Alguna UI lo llama?
`grep "api.pluginFormats\|plugin_formats\|pluginFormats" frontend/src/components/` → SIN resultados.

→ El handler existe, el frontend lo declara en `api.ts`, pero NINGÚN componente de UI lo invoca. Zombie en el cliente.

## Decisión requerida (preguntas)
1. ¿El feature de plugins es real o aspiracional?
2. Si es aspiracional, ¿vale la pena mantener 155+50=205 líneas + el riesgo de RCE bypassable?
3. Si es real, ¿se necesita mejorar el sandbox (subprocess, RestrictedPython) o el AST walk actual es suficiente dado el threat model (plugins son del propio usuario en su `%LOCALAPPDATA%/Antares/plugins`)?

El código de plugins (AST sandbox) está cubierto por `tests/test_plugins.py`. Si se quiere deprecar, también hay que migrar/borrar ese test. → TOCAR tests, descartado en esta auditoría.

## Propuesta (acción segura: SOLO decisión, no refactor)
1. Marcar `plugins.py`, `format_registry.py`, `load_plugins_from_dir`, `plugin_formats` handler como `# DEPRECATED — see simplification-024`.
2. NO eliminar: cubierto por tests y por la restricción "tests sin modificar".
3. Abrir el issue al dueño del producto: confirmar o eliminar el feature en `next minor`.

## Cambio de comportamiento
Ninguno (acción = solo documento).

## Riesgo de migración
Ninguno (acción = solo documento).

## Verificación
Ninguna (acción = solo documento).

## Alternativas (si se admite tocar tests)
- **Eliminar el feature:** borrar `plugins.py`, `format_registry.py`, `load_plugins_from_dir` call en `main.py`, `plugin_formats` handler, y `tests/test_plugins.py`. Require también actualizar `FORMATOS_SOPORTADOS` para que no dependa del registry (verificar si `converter.py` aún usa `get_registry()` — SÍ lo usa para declarar formatos base, pero esos están en `_registry.add_format(...)` inline, NO dependen de plugins cargados). Eliminar 205 líneas + un test.
- **Endurecer el sandbox:** sustituir AST walk por [RestrictedPython](https://restrictedpython.readthedocs.io/) o ejecución en subprocess aislado con timeout. Es refactor separado de security (ver issues `security-002`).

## Recomendación final
Esperar decisión del dueño del producto antes de cualquier cambio. Marcar como pendiente.
