# simplification-020 — Migrar frontend a notificaciones `job.*` y eliminar dual `process.*` en backend

> **STATUS: DESCARTADO (verificación de safety net, 2026-06-27)**
>
> El safety net es insuficiente para garantizar "completamente funcional":
> - **No existe test de `useProcessRunner`** (Glob confirma: sólo el hook, sin `.test.tsx`).
>   El issue lo sospechaba ("verificar si existe test") pero no existe.
> - `api.startProcess` (api.ts:254) tipa el retorno como `{ started: boolean }` — **no
>   declara `job_id`** (aunque el backend sí lo envía en runtime). Etapa A requeriría
>   actualizar el tipo + capturar `job_id`.
> - Ningún test Python referencia `process.progress`/`process.complete`/
>   `is_legacy_default_job` → el dual emit del backend no está cubierto por aserciones
>   de nombre (sólo silenciado via `_notify_complete`).
> - **No se puede verificar manualmente**: el issue exige "correr conversión real" para
>   confirmar que el progreso llega, y no se puede correr la app Electron interactivamente.
>
> Sutilezas que el issue NO aborda:
> - `startProcess` (useProcessRunner.ts:38) **descarta el `job_id`** retornado.
> - El listener se registra una vez (`useEffect` deps `[]`); capturar `jobId` del closure
>   dejaría `null` siempre → requiere `ref` para resolver el timing/closure.
>
> El refactor es una **optimización** (elimina duplicación 2→1 notifications), no corrige
> bug ni mejora perf crítica. Toca el hook central de progreso → un bug sutil de
> timing/closure degrada el progreso live (sólo queda polling con lag) y **ningún test
> lo detecta**. Mismo patrón que 017: refactor con safety net insuficiente y riesgo de
> regresión silenciosa. Descartado bajo "completamente funcional".
>
> **Consecuencia:** `simplification-026` (que tiene a 020 como prerrequisito explícito)
> queda **bloqueado** — su propio issue ya dice "no aplicar aquí: requiere 020".

## Skill
`deprecation` + `code-review`

## Ubicación
Backend emite notificaciones DUPLICADAS:
- `backend/handlers/conversion.py` `_emit_progress_notifications` y `_emit_complete_notifications` (líneas ~260, ~330) envían AMBAS:
  - `job.{job_id}.progress` (moderna) + `process.progress` (legacy si `is_default`)
  - `job.{job_id}.complete` (moderna) + `process.complete` (legacy si `is_default`)

Frontend escucha SOLO las legacy:
- `frontend/src/hooks/useProcessRunner.ts` líneas 19-26: escucha `process.progress` y `process.complete`. NO escucha `job.*`.

## Por qué es un problema
Cada evento de progreso envía 2 notificaciones IPC. Duplica tráfico + complica razonamiento.

## Verificación de consumers (frontend)
`grep -r "process\.progress\|process\.complete" frontend/src/`:

```
.\hooks\useProcessRunner.ts:      if (method === 'process.progress') {
.\hooks\useProcessRunner.ts:      else if (method === 'process.complete') {
```

Único consumidor: `useProcessRunner.ts`. NO hay tests frontend que dependan de los nombres `process.progress` (verificado: `grep "process.progress\|process.complete" frontend/src/__tests__/ frontend/src/**/*.test.tsx` → sin resultados).

Verificado también en `frontend/src/api.ts:LONG_RUNNING_METHODS` — sin referencia a `process.*`. Las pruebas frontend (`api.test.ts`) mockean `onNotify` con `vi.fn()` — no asertan sobre nombres de notificación.

## Propuesta (migración frontend → eliminar dual)
1. **Etapa A (frontend):** Migrar `useProcessRunner.ts` para escuchar `job.{job_id}.progress` / `job.{job_id}.complete` con el `job_id` recibido de `api.startProcess()` (`process_start` retorna `{started, job_id, …}`).

Ejemplo:
```typescript
const [jobId, setJobId] = useState<string | null>(null);

const unsub = onNotify((method, params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return;
    const p = params as Record<string, unknown>;
    // … mismo filtering
    if (jobId && method === `job.${jobId}.progress`) { setStatus(...) }
    else if (jobId && method === `job.${jobId}.complete`) { setStatus(...); setRunning(false); }
});

const startProcess = useCallback(async (body: ProcessBody) => {
    const result = await api.startProcess(body);
    if (result?.job_id) setJobId(result.job_id);
    setRunning(true);
    pollStatus();
}, [pollStatus]);
```

Mantiene contrato: `useProcessRunner` sigue devolviendo `{status, running, pollStatus, startProcess, cancelProcess}` con los mismos shapes.

2. **Etapa B (backend, después de validar A):** Eliminar el dual:

   - En `_emit_progress_notifications`: borrar el branch `if is_default:` (líneas ~275-280).
   - En `_emit_complete_notifications`: borrar el branch `if is_default:` (líneas ~340-345).
   - Eliminar `is_legacy_default_job` de conversion.py (mantener el símbolo en `jobs.py` por si otros tests lo referencian — verificado: ninguno).

Resultado: backend siempre envía solo `job.{job_id}.*`. Frontend sabe qué `job_id` escuchar (lo obtuvo de `startProcess`).

## Cambio de comportamiento
Etapa A: NINGUNO. Frontend migra a otra notificación IPC con misma info.
Etapa B: backend deja de emitir `process.progress`/`process.complete`. El frontend (ya migrado en A) no los escuchaba ya.

## Restricción preservada
- `_emit_*_notifications` conserva signatures (acepta `is_default` arg pero lo ignora si se ejecuta sin el branch).
- `_notify_complete = _emit_complete_notifications` alias DEBE PRESERVARSE (ver 001: 3 tests parchean `_notify_complete`).

## Riesgo de migración
Medio. Toca el hook central de progreso del frontend; si falla, el usuario ve progreso congelado.

## Verificación
```bash
# Etapa A:
cd frontend && npx vitest run src/hooks/useProcessRunner.test.tsx src/__tests__/api.test.ts
# (verificar si existe test de useProcessRunner — grep "useProcessRunner" frontend/)
# Manual: correr conversión real; el progreso debe llegar.

# Etapa B (solo tras A verificado):
cd backend && python -m pytest ../tests/test_conversion_*.py ../tests/test_jobs.py -v
# Manual: correr conversión real; el progreso debe seguir llegando vía job.{id}.
```

## Importante
Comprobar `frontend/src/__tests__/` por tests que mockeen `process_*`. Si existen con assertions sobre el string `'process.progress'`, descartar Etapa A o migrar esos tests (lo que requiere tocar tests).

`grep "process.progress" frontend/` → confirmado arriba: solo en `useProcessRunner.ts` (código fuente, no tests).
