# SEC-013 — Auditoría de CVEs no garantizada: `npm audit` fuera de CI + registry mirror bloquea el audit local

- **Severidad:** P2 (Media)
- **Categoría:** Dependency / Process (CWE-1104: mantenimiento de dependencias)
- **Archivos afectados:** `package.json:36` (script `ci`), `frontend/.npmrc` (registry `npmmirror.com`), `.github/workflows/*`

## Vulnerabilidad

Dos problemas complementarios de proceso:

1. **`npm audit` no está en CI.** El script `ci` (`package.json:36`) ejecuta `audit:python` (`pip-audit .`) pero **no** `npm audit`. Las dependencias npm del renderer (electron, pdfjs-dist, @e965/xlsx, jspdf, supabase-js, dompurify, vite, etc.) **nunca se chequean** automáticamente contra CVEs.

2. **El registry npm local apunta a `npmmirror.com`** (mirror chino), cuyo endpoint de audit **no está implementado**:
   ```
   npm error audit endpoint returned an error
   "404 Not Found - POST https://registry.npmmirror.com/-/npm/v1/security/advisories/bulk
    - [NOT_IMPLEMENTED] /-/npm/v1/security/* not implemented yet"
   ```
   (Capturado en `frontend/npm-audit-raw.json` durante esta auditoría.) Consecuencia: incluso si un dev ejecuta `npm audit` manualmente, **falla** con 404. El equipo no tiene forma local de ver CVEs npm.

Resultado: CVEs conocidos en dependencias del renderer (p.ej. SEC-006 electron, SEC-012 @e965/xlsx) pueden pasar desapercibidos hasta que un incidente los descubra.

## Impacto

Deuda de seguridad estructural: las dependencias del renderer (que procesan PDFs, Excel e imágenes no confiables, y corren en un Chromium que puede tener CVEs) no se monitorizan. P2 (no es un bug del código, pero deja sin cobertura a SEC-006/SEC-012 y a futuros CVEs).

## Fix propuesto (aditivo, conserva el registry mirror para installs)

El registry mirror es legítimo para installs rápidos; el fix es **auditar contra el registry oficial** sin cambiar el default de install.

1. **Añadir `npm audit` al CI apuntando al registry oficial.** En `.github/workflows/ci.yml` (o el de release), un step:
   ```yaml
   - name: npm audit (renderer deps)
     working-directory: frontend
     env:
       # Forzar el registry oficial solo para el audit, sin tocar .npmrc
       npm_config_registry: https://registry.npmjs.org
     run: npm audit --omit=dev --audit-level=high || true
   ```
   Y/o `npx osv-scanner --lockfile frontend/package-lock.json` (OSV no depende del registry de npm, más robusto). Para el backend, `npm run audit:python` ya está en CI.

2. **Añadir un script `audit:npm` en `package.json`** (aditivo, no rompe `ci` existente):
   ```json
   "audit:npm": "cd frontend && npm audit --omit=dev --registry=https://registry.npmjs.org"
   ```
   Y opcionalmente añadirlo al `ci` script:
   ```
   ... && npm run audit:python && npm run audit:npm && npm run typecheck:frontend && npm test
   ```

3. **Documentar** en `SECURITY-AUDIT-REPORT.md` / README que para auditar localmente se debe usar `--registry=https://registry.npmjs.org` (o `osv-scanner`), dado que el mirror no soporta audit.

4. **Dependabot/Renovate** (complementario): habilitar PRs automáticos para `electron`, `pdfjs-dist`, `@e965/xlsx`, `@supabase/supabase-js`, `dompurify` en `frontend/package.json` y `electron`/`electron-updater` en root `package.json`.

> Conserva toda la funcionalidad: no se cambia el registry de install (el mirror sigue acelerando `npm install`), no se eliminan scripts; solo se **añade** auditoría contra el registry oficial.

## Testing (sin romper nada)

1. **`npm install`** local sigue usando el mirror (rápido) — sin cambios.
2. **`npm run audit:npm`** corre contra `registry.npmjs.org` y devuelve el reporte de vulnerabilidades (o "found 0 vulnerabilities"). No afecta builds.
3. **CI:** el step `npm audit`/`osv-scanner` corre en cada PR; si hay high/critical, falla el check (o warning con `|| true` inicial hasta cerrar SEC-006/SEC-012).
4. **`npm run ci`** local sigue pasando (se añade `audit:npm` al final; si falla por CVEs existentes, usar `|| true` en la primera iteración para no bloquear mientras se remedian).
