# Issues pendientes de implementación — Auditorías Antares

**Fecha:** 2026-06-28  
**Referencias:** `cambios_auditoria_performance.md`, `cambios_auditoria_security.md`, `cambios_auditoria_simplificaciones.md`

Este documento lista solo lo que **falta implementar**, está **bloqueado**, requiere **acción manual del usuario**, o fue **descartado** con razón documentada.

---

## Resumen

| Auditoría | Implementados | Cerrados sin fix / scope | Pendientes implementación |
|---|---|---|---|
| Performance (perf-01…19) | 14 | 2 (perf-06, perf-08) | 3 (perf-07, perf-18, perf-19) |
| Security (SEC-001…019) | 19 (con scope acotado) | — | 4 ítems de follow-up manual o upgrade path |
| Simplification (001…026) | 19 | 6 descartados | 1 (026, bloqueado) |

---

## Performance — pendientes de implementación

### perf-07 — Technical reports: JSON único con rewrite completo (P2)

**Estado:** No implementado  
**Razón:** Migración de storage mayor (JSON → SQLite vía `repository.py`, migración one-shot al arrancar). Depriorizada frente al cluster core.  
**Opción intermedia:** caché en memoria de la lista normalizada (menor diff, mejora `list` sin migrar storage).  
**Medir primero:** N=1000, tiempo de `list` y `update` antes/después.

### perf-18 — `html_to_pdf`: BrowserWindow por llamada (P3)

**Estado:** Diferido (medir-primero)  
**Razón:** P3; `html_to_pdf` se invoca 1 vez por export (no en loop). Costo de arranque ~100–300 ms aceptable hoy.  
**Aplicar fix solo si:** startup de ventana > 15 % del total de `renderHtmlToPdf` en perfil real (Electron).

### perf-19 — `React.memo` escaso (P3)

**Estado:** Diferido (medir-primero)  
**Razón:** Hipótesis no confirmada. Requiere React DevTools Profiler en la app real para identificar re-renders costosos antes de memoizar.

---

## Performance — cerrados sin fix (no reimplementar sin nueva evidencia)

| Issue | Conclusión |
|---|---|
| perf-06 | Lock global SQLite **no** es bottleneck; remover lock ~8× más lento en harness. |
| perf-08 | `toBlob` JPEG cede event loop; hiccups < 65 ms no justifican Web Worker. |

---

## Security — follow-up (no son omisiones de fix)

| Ítem | Estado | Acción requerida |
|---|---|---|
| SEC-005 firma Windows | Skeleton listo | Agregar secrets `WINDOWS_CERT_B64` / `WINDOWS_CERT_PASSWORD` y disparar release. |
| SEC-006 smoke runtime | Código listo (Electron 42) | `npm run dev`, `npm run build:win`; verificar `process.versions.electron` / `chrome`. |
| SEC-012 migración total al backend | Híbrido implementado | Opcional: mover los 3 flujos renderer al backend (refactor grande). |
| SEC-013 npm audit bloqueante | No-bloqueante intencional | Tras triage, quitar `continue-on-error` / `\|\| true` en CI. |

Todos los SEC-001…019 tienen fix + tests en código. Los ítems arriba son **upgrade path** o **verificación manual**.

---

## Simplification — pendiente

### simplification-026 — Eliminar dualismo jobs modern + legacy single-job

**Estado:** Bloqueado  
**Prerrequisito:** simplification-020 (descartado).  
**Razón:** Requiere migrar frontend a `job.*`, eliminar dual `process.*` en backend, y tocar `test_handlers.py` / `test_race_condition.py` (violaba regla “tests sin modificar” en el plan original).

---

## Simplification — descartados (no reabrir sin cambiar restricciones)

| Issue | Razón |
|---|---|
| 001 | Tests monkeypatchean `_notify_complete`; eliminar alias rompe patches. |
| 002 | Imports top-level rompen 15 tests de monkeypatch en `conversion.py`. |
| 012 | Merge clean scripts rompe `test-build-size-guards.js` (strings de comando). |
| 017 | Refactor `_run_conversion_job` — acoplamiento de monkeypatch subestimado; riesgo > beneficio. |
| 020 | Sin tests de `useProcessRunner`; hook central de progreso sin safety net. |
| 021 | Duplicado de 003 (mtime cache key); parte estructural cubierta por 016. |

---

## Smoke manual recomendado (post-auditoría)

1. **Electron 42 (SEC-006):** IPC, diálogos, PDF, sellador, login persistente (SEC-009).
2. **Excel (SEC-012):** import real en padrón, volantes, preview-panel + panel-aviso-corte; rechazo >10 MB / >50k filas.
3. **Firma (SEC-005):** release con certificado cuando esté disponible.
4. **perf-07 / perf-18 / perf-19:** medir en app real antes de implementar.

---

## Commits por issue

Los issues implementados tienen commit individual en la rama actual (prefijos `perf(...)`, `fix(SEC-...)`, `refactor(simplification-...)`). Issues cuyo código está agrupado en otro commit usan `--allow-empty` con referencia al commit que contiene el diff (ej. perf-03/04/15 y simplification-003/006 → `simplification-016`).
