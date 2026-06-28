# Auditoría de Simplificaciones — Resumen de Cambios

**Fecha:** 2026-06-27
**Proyecto:** antares
**Alcance:** 26 issues de `issues/simplification/` (simplification-001 a 026)
**Regla rectora:** preservar 100% de la funcionalidad, no modificar tests existentes, no romper contratos IPC ni formatos de salida.

---

## Resumen ejecutivo

| Estado | Cantidad | Issues |
|---|---|---|
| IMPLEMENTADOS | 17 | 003, 004, 005, 006, 007, 008, 009, 010, 011, 013, 014, 015, 018, 019, 023, 024, 025 |
| DESCARTADOS | 6 | 001, 002, 012, 017, 020, 021 |
| PENDIENTES | 3 | 016, 022, 026 |
| **Total** | **26** | |

Cada descarte está documentado en el `.md` del issue correspondiente con la evidencia (`grep`, line numbers, tests afectados).

---

## Verificación final de funcionalidad

La funcionalidad se verificó tras aplicar los cambios. Resultado: **cero regresiones**.

### Backend (pytest)
```
collected 458 items / 3 deselected / 455 selected
443 passed, 12 failed in 81.35s
```
Los **12 failures son el baseline pre-existente** (no introducidos por simplifications):
- 4 × `tests/panel_aviso_corte/test_rendering.py` — `OSError: cannot load library 'libgobject-2.0-0'` (WeasyPrint requiere libs nativas ausentes en este entorno Windows; ambiental).
- 1 × `tests/test_optimizer_handler.py::test_image_optimizer_zip_can_write_many_files_directly_to_disk` — código del audit de performance pre-existente (no de simplification).
- 7 × `tests/test_rename_audit.py` — refactor `perf-13` previo cambió la auto-detección de key-column a `database.contar_matches_por_columna`, pero los tests aún monkeyparchean la función vieja `database.buscar_por_columna`; los mocks quedan inefectivos contra una DB vacía. Pre-existente, no regresión de simplification.

Tests relevantes a simplifications **todos en verde**: `test_formatos_*` (007), `test_plugins` (024), `test_run_types`/`test_history_*` (018), `test_database`/`test_database_mapping` (005), `test_path_sanitization`/`test_validators` (013), `test_jobs`/`test_scheduler` (014), `test_ubicaciones_*` (003, 006), `test_backend_main`/`test_ipc*` (004), `test_conversion_*`/`test_stress_conversion` (025), `test_performance_audit`.

### Frontend (typecheck)
```
npx tsc --noEmit  → exit 0, sin errores
```
Confirma que 008 (CSS extraído), 009 (comment CSS), 011 (rename template + comment) no rompen tipos.

### Scripts CI (015)
- `node --check` OK en `scripts/lib/loop-helpers.js` + los 3 `*-loop.js`.
- `require('./scripts/lib/loop-helpers.js')` OK, `ROOT` resuelve a `C:\Users\Enzon\antares` (repo root).
- `tests/test-push-loop.js` → 7 passed.
- `tests/test-pr-fix-loop.js` → 17 passed.

### Paridad IPC (010)
- `tests/test-backend-heavy-methods-sync.js` → PASS. `api LONG_RUNNING == ipc LONG_RUNNING` (21 métodos); `HEAVY (20) ⊆ LONG_RUNNING`.

### Sin callers huérfanos (005)
- `grep "execute_query|execute_write" tests/` → sin resultados. Las funciones eliminadas de `repository.py` no tenían consumers.

---

## Detalle por issue

### IMPLEMENTADOS (16)

#### 003 — Fix race condition en cache key de ubicaciones
**Archivos:** `backend/handlers/ubicaciones.py`
**Cambios:** Eliminado el global mutable `_preview_excel_ctx` y la función `_sync_excel_context`. En `handle_preview_ubicacion` se reemplazó la llamada a `_sync_excel_context(excel_path)` por `excel_ctx = (excel_path, os.path.getmtime(excel_path))`, incorporando el `mtime` del Excel dentro de la cache key. Esto elimina la race condition (el thread daemon de prefetch leía el global sin lock consistente).
**Verificación:** `test_ubicaciones_compose.py`, `test_ubicaciones_static_map.py` en verde.

#### 004 — `ErrorBudget` dataclass en el main loop
**Archivos:** `backend/main.py`
**Cambios:** Introducida la dataclass `ErrorBudget` para agrupar `_consecutive_errors` y lógica relacionada. El loop de `main()` usa una instancia de `ErrorBudget` en vez de variables locales sueltas. Comportamiento 1:1 preservado.
**Verificación:** `test_backend_main.py`, `test_ipc_validation.py` en verde.

#### 005 — Eliminar helpers unreachable de `repository.py`
**Archivos:** `backend/core/repository.py`
**Cambios:** Eliminadas `execute_query(...)` y `execute_write(...)` (cero callers en runtime ni tests). El import `Any` quedó sin uso y se removió (`from typing import TYPE_CHECKING, Any` → `from typing import TYPE_CHECKING`).
**Verificación:** `grep` confirma 0 referencias en tests; `test_database*` en verde.

#### 006 — `lru_cache` en caches de assets de ubicaciones
**Archivos:** `backend/handlers/ubicaciones.py`
**Cambios:** Añadido `import functools`. Removidos los dicts globales `_font_cache`, `_footer_cache`, `_pin_cache`. Decoradas `_get_font`, `_get_footer_image`, `_get_pin_rgba` con `@functools.lru_cache(maxsize=...)` y simplificados sus cuerpos (eliminada la lógica manual de cache). Reemplaza caches ad-hoc por primitiva stdlib.
**Verificación:** `test_ubicaciones_*` en verde (sólo patchean `_http_get` y `ThreadPoolExecutor`, no las caches).

#### 007 — Archivar `formatos/catalog.json`
**Archivos:** borrado `formatos/catalog.json`; creado `formatos/_archive/catalog.json-legacy.md`.
**Cambios:** `formatos/catalog.json` era un orphan: cero lectores en runtime (el catálogo activo está en `data/formatos/catalog.json` resuelto por `_CATALOG_PATH` en `backend/core/formatos.py`). Además tenía valores **divergentes** del catálogo activo y de `_BUILTIN_FORMATS` en Python (`televisiva.y = 41.0` aquí vs `25` en Python), lo que inducía a creer que editarlo cambiaba el catálogo en runtime. Se archiva su contenido en `formatos/_archive/catalog.json-legacy.md` con nota explicativa. Los `.b64` (`template-d.b64`, `maquina.b64`, `televisiva.b64`) sí se leen vía `_resolve_path` y se conservan sin cambios.
**Verificación:** `test_formatos_delete.py`, `test_formatos_handlers.py`, `test_formatos_mapping.py` en verde.

#### 008 — Extraer CSS de login decor a su propio archivo
**Archivos:** `frontend/src/auth/_loginDecor.css` (nuevo), `frontend/src/auth/loginDecor.tsx`, `frontend/src/index.css`.
**Cambios:** El bloque `.lg-*` (187 líneas, incluyendo `@keyframes` y `@media`) se movió de `frontend/src/index.css` a `frontend/src/auth/_loginDecor.css`. `loginDecor.tsx` agrega `import './_loginDecor.css';` como primera línea. En `index.css` el bloque se reemplazó por un comment apuntando al nuevo archivo.
**Verificación:** `tsc --noEmit` exit 0.

#### 009 — Documentar fragilidad del CSS del date picker
**Archivos:** `frontend/src/index.css`
**Cambios:** Añadido un comment block antes de las reglas `.app-date-picker` documentando su dependencia de cascade/orden en `index.css` (fragilidad si se mueve o reordena). Sólo documentación, sin cambio de comportamiento.
**Verificación:** `tsc --noEmit` exit 0.

#### 010 — Test de paridad `LONG_RUNNING`/`HEAVY_METHODS`
**Archivos:** `tests/test-backend-heavy-methods-sync.js` (nuevo), `package.json`.
**Cambios:** Nuevo test Node que valida consistencia entre `LONG_RUNNING_METHODS` (en `frontend/src/api.ts`), `LONG_RUNNING_METHODS` (en `electron/ipc-methods.js`) y `HEAVY_METHODS` (en `backend/main.py`). Invariantes corregidos vía doubt-driven: `api LONG_RUNNING == ipc LONG_RUNNING` (igualdad, 21 métodos) y `HEAVY ⊆ LONG_RUNNING` (todo método heavy es long-running; `html_to_pdf` es long-running pero no heavy, por eso no se asserta igualdad total). Integrado al script `test` de `package.json`.
**Verificación:** `node tests/test-backend-heavy-methods-sync.js` → PASS.

#### 011 — Templates HTML con espacios en el nombre
**Archivos:** renombrado `backend/templates/aniegos chorrillos.html` → `backend/templates/aniegos-chorrillos.html` (vía `git mv`); `frontend/src/components/preview-panel/PreviewPanel.tsx`.
**Cambios:** Re-verification doubt-driven encontró un consumer no listado en el issue: `PreviewPanel.tsx` hace matching por substring `normalized.includes('maq balde sjl')` para `volan maq balde sjl.html` en `isMaqBaldeTemplate` / `KNOWN_TEMPLATES`. Renombrar ese archivo rompería el layout A4 fijo del preview. Decisión: renombrar sólo el template seguro (`aniegos chorrillos` → `aniegos-chorrillos`) y documentar el acoplamiento backend→frontend con un comment en `PreviewPanel.tsx` advirtiendo no renombrar `volan maq balde sjl.html` sin actualizar el string.
**Verificación:** `tsc --noEmit` exit 0; `templates_list`/`template_get` usan `f.stem`/`f.name` + `glob("*.html")` no recursivo, comportamiento preservado.

#### 013 — Unificar denylist de system-sensitive paths
**Archivos:** `backend/utils/paths.py`, `backend/utils/validators.py`.
**Cambios:** En `paths.py` se reemplazaron `_SYSTEM_SENSITIVE_ROOTS_WIN`, `_SYSTEM_SENSITIVE_ROOTS_UNIX` y `_system_sensitive_roots()` por listas unificadas `_SYSTEM_SENSITIVE_ROOTS` y `_SYSTEM_SENSITIVE_ROOTS_PREFIXED`; `is_system_sensitive_path` ahora usa comparación de strings. En `validators.py` se removieron las denylists duplicadas (`_SYSTEM_SENSITIVE_PATH_EXACT`, `_SYSTEM_SENSITIVE_PATH_PREFIXES`) y `_is_system_sensitive_path_str` importa y usa las listas de `paths.py` (single source of truth).
**Verificación:** `test_path_sanitization.py`, `test_validators.py` en verde.

#### 014 — Unificar detectores de hardware limits
**Archivos:** `backend/core/system_limits.py` (nuevo), `backend/core/jobs.py`, `backend/core/scheduler.py`.
**Cambios:** Creado `backend/core/system_limits.py` como single source of truth para límites derivados de CPU/RAM: dataclass `HardwareLimits` (con properties `max_concurrent_jobs`, `light_workers`, `heavy_workers`, `heavy_queue_limit`) y `detect_hardware_limits()`. `jobs.py` (`_detect_max_concurrent()`) y `scheduler.py` (`_detect_limits()`) ahora delegan a `detect_hardware_limits()` en vez de replicar la lógica de `os.cpu_count()`/`psutil`.
**Verificación:** `test_jobs.py`, `test_scheduler.py` en verde.

#### 015 — Extraer `scripts/lib/loop-helpers.js`
**Archivos:** `scripts/lib/loop-helpers.js` (nuevo), `scripts/push-loop.js`, `scripts/pr-fix-loop.js`, `scripts/release-loop.js`.
**Cambios:** Creada `scripts/lib/loop-helpers.js` exportando las primitivas comunes duplicadas en los 3 scripts: `sh`, `trySh`, `step`, `skip`, `die`, constantes (`REPO_OWNER`, `REPO_NAME`, `BASE_BRANCH`, `ROOT`) y `currentBranch`. Los 3 `*-loop.js` refactorizados para importarlas. `ROOT` sube 2 niveles desde `scripts/lib/` (= repo root, mismo path que antes).
**Ajustes doubt-driven (preservar comportamiento exacto):**
- `workingTreeDirty` **no** se unificó: diverge (`sh` en push-loop vs `trySh` en pr-fix-loop — ante un error de git, uno lanza y el otro retorna `false`). Se mantiene local en cada script.
- `slugifyBranchName`/`defaultBranchName`/`defaultPrBody` **no** se extrajeron: single-use en push-loop (no hay duplicación real).
- `parseArgs`, `runGit`/`runGh`, `validateEnvironment`, `runQualityGate` se mantienen locales (específicos o divergentes).
**Verificación:** `node --check` OK (4 archivos); `require` OK con `ROOT` correcto; `test-push-loop.js` 7/7, `test-pr-fix-loop.js` 17/17.

#### 018 — Re-exportar `RUN_TYPE_*` desde `run_types.py`
**Archivos:** `backend/core/history.py`.
**Cambios:** `history.py` importa `RUN_TYPE_REGISTRY` de `run_types` (además de `ALL_RUN_TYPES`) y reemplaza los literales hardcodeados `RUN_TYPE_*` por `RUN_TYPE_REGISTRY[...].id`. Re-exporta `RUN_TYPE_REGISTRY`. Single source of truth para los IDs de run type en `run_types.py`.
**Verificación:** `test_run_types.py`, `test_history_export.py`, `test_history_migrations.py` en verde.

#### 019 — Documentar deuda técnica de `process_state` legacy singleton
**Archivos:** `backend/handlers/common.py`.
**Cambios:** Añadido un comment block sobre `process_state = ProcessState()` documentando que es legacy, qué tests lo consumen (impidiendo su remoción) y el path de migración requerido para esos tests. Sólo documentación (la remoción requiere migrar tests, lo cual cae bajo 026).
**Verificación:** sin cambio de comportamiento; `test_handlers.py` en verde.

#### 024 — Deprecación del sistema de plugins
**Archivos:** `backend/core/plugins.py`, `backend/core/format_registry.py`, `backend/handlers/info.py`.
**Cambios:** Notas de deprecation: docstring en `plugins.py` y `format_registry.py`, comment sobre la función `plugin_formats` en `info.py`. Marca el sistema como legacy para una futura remoción (requiere decisión de PO sobre si aún hay usuarios de plugins).
**Verificación:** `test_plugins.py` en verde; sin cambio de comportamiento.

#### 025 — Deprecación de `format_strategies/legacy_xobject.py`
**Archivos:** `backend/core/format_strategies/legacy_xobject.py`.
**Cambios:** Expandido el docstring documentando la dependencia de la estructura interna del PDF (xobjects) y la pregunta de deprecation. Marca la estrategia legacy para evaluación futura.
**Verificación:** `test_converter.py` en verde; sin cambio de comportamiento.

#### 023 — Eliminar la triple fuente de verdad de formatos built-in
**Archivos:** `data/formatos/catalog.json`, `backend/core/formatos.py`, `tests/test_formatos_catalog_sync.py` (nuevo), `cambios_auditoria_simplificaciones.md`.
**Decisión de PO:** `_BUILTIN_FORMATS` (Python) es la fuente canónica de los defaults built-in. Motivos: producción en fresh install ya usa Python (el bundle no empaqueta `data/`); `tests/test_formatos_mapping.py` y `tests/test_performance_audit.py` ya asumen valores Python (`x: 535`); el `catalog.json` del repo contenía calibración float + un upload de dev (`upload-ec959497`) que no es un default limpio de producto.
**Cambios:**
1. Sincronizadas las entradas built-in (`template-d`, `maquina`, `televisiva`) de `data/formatos/catalog.json` a los valores exactos de `_BUILTIN_FORMATS` en Python (ej. `maquina.x` 531.47→535, `maquina.width` 27.23→140, `televisiva.y` 40.21→25, `televisiva.font_size` 13→15). La entrada uploaded `upload-ec959497` se preserva intacta.
2. Añadido un comment de Single Source of Truth sobre `_BUILTIN_FORMATS` en `formatos.py` explicando que Python es el default canónico y `catalog.json` es el estado persistido (customizaciones UI + uploads).
3. Nuevo `tests/test_formatos_catalog_sync.py`: guardrail anti-drift que compara campo a campo (incluido cada campo del `mapping`) cada built-in del `catalog.json` del repo contra `_BUILTIN_FORMATS`. Lee el archivo de disco de forma independiente del `_CATALOG_PATH` del módulo (que otros tests monkeyparchean) para reflejar siempre el archivo commiteado. Ignora entradas uploaded. Falla si alguien edita solo una de las dos fuentes.
**Desviación deliberada vs. propuesta original del issue:** NO se bloqueó el override de mapeos built-in desde el catálogo persistido (paso 4 de la propuesta). Eso habría roto `update_mapping` + `FormatosView.handleSaveMapping` (los usuarios recalibran Máquina/Televisiva y persisten via UI). La lógica de merge de `_load_catalog` se conserva intacta; el cambio es puramente de datos + documentación + guardrail.
**Verificación:** `test_formatos_catalog_sync.py`, `test_formatos_mapping.py`, `test_formatos_delete.py`, `test_formatos_handlers.py` (14 passed) + `test_performance_audit.py::test_formatos_visual_overlay_*` (2 passed). Cero cambios en contratos IPC, estrategias PDF, ni tests existentes.
**Impacto visual:** prod fresh install sin cambios (ya usaba Python); dev/repo alinea la posición del correlativo de Máquina/Televisiva a los defaults de Python; overrides persistidos por usuarios en sus propios `catalog.json` siguen cargándose sin cambios.

---

### DESCARTADOS (6)

#### 001 — Eliminar alias `_notify_complete` en `conversion.py`
**Razón:** 3 archivos de test (`test_rename_audit.py`, `test_conversion_record_sequence.py`, `test_conversion_mapping.py`) monkeyparchean el alias `_notify_complete` directamente. Eliminar el alias y llamar a `_emit_complete_notifications` rompería los patches de los tests. **Descartado por restricción de tests** (regla "tests sin modificar").
**Estado en .md:** `STATUS: NO APLICABLE`.

#### 002 — Mover imports locales de `database` a top-level en `conversion.py`
**Razón:** Al mover los imports locales de `backend.core.database` al top-level de `conversion.py`, las funciones de conversion se bindean a las referencias al momento del import del módulo. Los tests que hacen `monkeypatch.setattr(conversion, "_notify_complete", ...)` / patches de funciones de `database` **dejaban de atrapar** (el binding ya estaba fijado). Rompió 15 tests (`test_conversion_mapping`, `test_conversion_record_sequence`, `test_rename_audit`). **Revertido.**
**Lección:** el patrón de imports locales existe precisamente para que los monkeypatches de tests atrapen en runtime.

#### 012 — Mergear `clean-dist-electron.js` + `clean-after-package.js` en `clean.js`
**Razón:** Consolidar los dos scripts de higiene de build en `clean.js` y actualizar `package.json` rompió `tests/test-build-size-guards.js`, que aserte sobre los **nombres exactos de archivo** y las **strings de comando** de los scripts originales. Moverlos viola "tests sin modificar". **Revertido.**

#### 017 — Extraer `_run_conversion_job` / `_prepare_chunk_tasks` de `conversion.py`
**Razón:** El issue claimaba "Ningún test parchea `_run_conversion_job` o `_prepare_chunk_tasks` directamente", pero `grep` sobre el código actual muestra **mucho más acoplamiento** del documentado:
- `_calculate_chunk_size` — parcheada en **6 archivos** (record_sequence, mapping, scheduler, stress, rename_audit ×4).
- `_run_conversion_job` — parcheada directamente en `test_stress_conversion:85` Y llamada en 6 archivos.
- `_prepare_chunk_tasks` — llamada directamente en `test_conversion_mapping:228`.
- `_notify_complete` + `_resolve_key_column` — parcheadas (esto sí lo decía el issue).

El refactor completo sólo preserva los patches si las llamadas internas a `_calculate_chunk_size`/`_notify_complete`/`_resolve_key_column` se hacen vía **attribute access al módulo `conversion`** (no import estático). Un error sutil produce **regresión silenciosa**: el test pasa (verifica `ok_count`/`progress`, no que el patch atrapó) pero el comportamiento runtime cambia. `002` ya rompió 15 tests en este mismo módulo. Beneficio = legibilidad (no bug/perf). Riesgo > beneficio. **Descartado** bajo "completamente funcional" + "tests sin modificar".
**Estado en .md:** `STATUS: DESCARTADO` con evidencia.

#### 020 — Migrar frontend a notificaciones `job.*` y eliminar dual `process.*` en backend
**Razón:** Safety net insuficiente para garantizar "completamente funcional":
- **No existe test de `useProcessRunner`** (Glob confirma: sólo el hook, sin `.test.tsx`).
- `api.startProcess` (`api.ts:254`) tipa el retorno como `{ started: boolean }` — no declara `job_id` (aunque el backend sí lo envía en runtime).
- Ningún test Python referencia `process.progress`/`process.complete`/`is_legacy_default_job` (el dual emit no está cubierto por aserciones de nombre).
- **No se puede verificar manualmente** — el issue exige "correr conversión real" para confirmar que el progreso llega, y no se puede correr la app Electron interactivamente.

Sutilezas que el issue no aborda: `startProcess` descarta el `job_id` retornado; el listener se registra una vez (`useEffect` deps `[]`) → capturar `jobId` del closure dejaría `null` siempre (requiere `ref` para resolver timing/closure). Beneficio = optimización (elimina duplicación 2→1 notifications), no bug/perf. Toca el hook central de progreso → un bug sutil congela el progreso live y ningún test lo detecta. **Descartado.**
**Consecuencia:** bloquea `026` (que tiene a 020 como prerrequisito explícito).
**Estado en .md:** `STATUS: DESCARTADO` con evidencia.

#### 021 — Reemplazar `_preview_excel_ctx` global mutable en `ubicaciones.py`
**Razón:** **Duplicado intencional con 003.** Su propuesta central (mtime en cache key, eliminar `_preview_excel_ctx` y `_sync_excel_context`) **ya se implementó como parte de 003**. El resto de su propuesta (encapsular `_map_screenshot_cache`/`_preview_composed_cache`/`_excel_cache` en una clase `UbicacionesCache` thread-safe) depende de `016` (split del módulo, pendiente). No se aplica como issue separado: su parte segura quedó cubierta por 003, su parte estructural queda pendiente vía 016.

---

### PENDIENTES (3)

#### 016 — Split del módulo `ubicaciones` en un package
**Por qué pendiente:** Refactor medio. Módulo grande con caches y threads; mover código puede romper imports/monkeypatches. **Mismo perfil de riesgo que 017/020**: requiere verificar acoplamiento con tests antes de aplicar. No se abordó para no arriesgar regresión sin safety net adecuado.

#### 022 — Consolidar el triplet de key-column
**Por qué pendiente:** Refactor **alto**. Cambia el algoritmo de auto-detección de key-column (`_detect_best_key_column` / `_resolve_key_column` / `contar_matches_por_columna`). Se cruza directamente con los **7 failures pre-existentes de `test_rename_audit.py`** (refactor `perf-13`): tocar ese flujo sin poder modificar esos tests es delicado y requiere resolver primero la inconsistencia perf-13.

#### 026 — Eliminar dualismo modern jobs + legacy single-job
**Por qué pendiente/bloqueado:** Refactor **alto + bloqueado por 020**. Su propio issue dice "no aplicar aquí: requiere 020 + tocar `test_handlers.py`/`test_race_condition.py`" (lo cual viola "tests sin modificar"). Como 020 se descartó, 026 queda **doble bloqueado**: prerrequisito descartado y requiere modificación de tests.

---

## Notas metodológicas

- **Doubt-driven:** cada issue se re-verificó contra el código actual (no sólo la descripción del issue). Esto detectó claims inexactas en 010 (invariante propuesta inválida), 011 (consumer no listado en `PreviewPanel.tsx`), 015 (divergencia `workingTreeDirty`), 017 (acoplamiento de monkeypatch subestimado) y 020 (safety net insuficiente + sutilezas de timing/closure).
- **Regla "tests sin modificar":** los issues 002 y 012 se descartaron (revertidos) precisamente porque rompían tests existentes. 001, 017 se descartaron por la misma restricción (monkeypatch de tests). 020 se descartó por ausencia de safety net que permita verificar.
- **Baseline pre-existente:** los 12 failures de pytest (4 WeasyPrint + 1 optimizer + 7 rename_audit) son anteriores a los simplifications y se preservan sin aumento. Son el resultado de audits de perf/security previos no finalizados, no de este trabajo.
