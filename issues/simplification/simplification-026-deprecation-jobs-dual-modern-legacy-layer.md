# simplification-026 — Eliminar el dualismo "modern jobs + legacy single-job"

## Skill
`deprecation` + `code-review`

## Ubicación
- `backend/core/jobs.py:14-37` (`DEFAULT_JOB_ID = "default"`, `resolve_job_id`, `is_legacy_default_job`).
- `backend/handlers/conversion.py` — `process_start`/`process_status`/`process_cancel` heredan el `default` cuando el frontend no manda `job_id`.
- `backend/handlers/conversion.py:_emit_*_notifications` — dual emit `job.{id}.*` + `process.*` (ver también 020).
- `backend/handlers/jobs.py` — handlers modernos (`jobs_list`, `jobs_get`, `jobs_cancel`, `jobs_cleanup`) registrados pero sin uso en el frontend.

## Por qué es un problema
Comentario explícito en `jobs.py:14-37`:
```
LEGACY SINGLE-JOB COMPATIBILITY LAYER
…
The modern multi-job system (JobManager + jobs_* IPC methods) is fully
implemented and exposed, but the frontend (api.ts) has not yet migrated.

DO NOT add new features that only work on the modern path while leaving
the legacy path broken. When the frontend is updated, this layer (and
the dual notification logic in conversion.py) can be removed.
```

Deuda técnica anunciada que vive hace rato. Cada handler/concepto de estado tiene que pensar en `default` y en `job_id`. El dualismo duplica tests (tests_jobs + tests_conversion que cubren el mismo concepto con distinta API).

## Verificación de consumers

### Frontend
`grep -r "job_id\|jobs_list\|jobs_get\|jobs_cancel\|jobs_cleanup" frontend/src/`:

```
.\src\api.ts:  // si hay tipos para jobs_* — verificar
```

Confirmado: el frontend NO usa los handlers modernos `jobs_*` por nombre — solo usa `process_start`/`process_status`/`process_cancel` (los legacy). Necesita migración (ver 020 antes de hacer 026).

### Backend handlers
`backend/handlers/jobs.py` define `jobs_list/get/cancel/cleanup`. Ninguna función del frontend los invoca. Solo están en `ipc-methods.js:BACKEND_METHODS` para que el allowlist los permita.

### Tests
`grep -r "jobs_list\|jobs_get\|jobs_cancel\|jobs_cleanup\|JobManager\|Job(" tests/`:
- `tests/test_jobs.py` (4.6KB) — testea el `JobManager` moderno.
- ¿Tests en test_conversion_* que usan `job_id`? (verificar)

## Propuesta (en 2 etapas, requiere 020 primero)

### Etapa 1 (PRERREQUISITO: 020 completado)
Verificar que el frontend está migrado a `job.{id}.*` y ningún componente consume `process.progress`/`process.complete`.

### Etapa 2 (eliminación del legacy)
1. Borrar `DEFAULT_JOB_ID`, `resolve_job_id`, `is_legacy_default_job` de `jobs.py`.
2. Modificar `process_start`/`process_status`/`process_cancel` en `conversion.py` para requierir `job_id` (sin default `"default"`):
   ```python
   def process_start(params):
       job_id = params.get("job_id")
       if not job_id:
           raise ValueError("job_id es requerido")
       # … el resto del body sin el `default` fallback
   ```
   PERO: contrato IPC — el frontend actual puede seguir mandando sin job_id. Si se hace esto, se rompe el contrato. Alternativa: el frontend SIEMPRE manda job_id (auto-generado con `crypto.randomUUID()` si no tiene uno). Esto requiere migrar el frontend (parte de 020).

3. En `_emit_*_notifications`, borrar el branch `if is_default:` y dejar solo `send_notification(f"job.{job_id}.progress", ...)`.
4. En `frontend/src/api.ts`, generar `job_id: crypto.randomUUID()` si no se pasa uno, mandarlo en `process_start`.
5. Migrar `useProcessRunner.ts` a usar el `job_id` retornado (ver 020).
6. Migrar tests `test_handlers.py` (que usan `Handlers.process_start({...})` sin `job_id`) — REQUIERE agregar `job_id: "test-1"` a los inputs. **TOCAR tests**.

Punto 6 viola la restricción "tests sin modificar". Por eso este issue queda **DESCARTADO** en esta auditoría. Listado aquí solo como discusión abierta.

## Cambio de comportamiento
CAMBIO DE CONTRATO IPC (en algunos steps) — el frontend empieza a mandar `job_id`. Si algún caller legacy aún manda sin `job_id`, falla.

## Riesgo de migración
Alto. Toca el API central de process management + requiere tocar tests.

## Verificación
```bash
cd backend && python -m pytest ../tests/test_jobs.py ../tests/test_conversion_*.py ../tests/test_handlers.py ../tests/test_race_condition.py -v
cd frontend && npx vitest run
```

## Acción recomendada
**No aplicar este issue aquí.** Queda como plan a largo plazo DESPUÉS de:
1. 020 (migrar frontend a `job.*` notifications).
2. Decisión del equipo sobre tocar tests para el `job_id` mandatorio.

Mientras tanto, documentar el dualismo en el comentario de `jobs.py` (ya existe — no agregar nada).
