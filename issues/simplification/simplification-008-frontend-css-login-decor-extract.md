# simplification-008 — Mover bloque `.lg-*` del `index.css` a `auth/_loginDecor.css`

## Skill
`frontend` + `simplification`

> **CORREGIDO vs auditoría previa:** el bloque `.lg-*` se consume en `frontend/src/auth/loginDecor.tsx`, NO en `LoginScreen.tsx`. Esta versión importa en el archivo correcto.

## Ubicación
`frontend/src/index.css` líneas ~440-700 (~260 líneas de reglas `.lg-orb`, `.lg-sparkle`, `.lg-aurora-blob--*`, `.lg-shimmer-text`, `.lg-btn`, `.lg-input`, etc. + las `@keyframes lg-*`)

Consumidor real:
```
.\frontend\src\auth\loginDecor.tsx:        className="lg-orb"
.\frontend\src\auth\loginDecor.tsx:      <div className="lg-aurora-blob lg-aurora-blob--indigo" />
.\frontend\src\auth\loginDecor.tsx:        className="lg-btn relative mx-auto flex items-center justify-center …"
.\frontend\src\auth\loginDecor.tsx:          className="lg-btn-ripple"
```

## Por qué es un problema
1. ~36% del CSS global (260/715 líneas) son animaciones exclusivas del login, pero se cargan en TODA la app (en `index.html` se importa `index.css` desde Vite config).
2. Animaciones `lg-aurora-drift` (28s infinite), `lg-orb-spin` (40s infinite) son pesadas y consumen compositor incluso cuando el login no está visible (si quedan residentes).
3. El bloque tiene `@media (prefers-reduced-motion: reduce)` al final (línea ~695-700) que SÓLO aplica a estas clases — mezclado con el resto del CSS global.

## Verificación de consumers
- Solo `loginDecor.tsx` usa las clases (grep confirmado).
- `LoginScreen.tsx` importa `loginDecor` para mostrar el decorativo → lazy loading de `_loginDecor.css` coincide con el montaje del LoginScreen (solo se monta si `!user`).
- Tests: `LoginScreen.test.tsx` renderiza `<LoginScreen />` y verifica mocks — no asertan sobre reglas CSS específicas.

## Propuesta
1. Crear `frontend/src/auth/_loginDecor.css` con todo el bloque `.lg-*` y las `@keyframes lg-*` (incluida la regla `@media (prefers-reduced-motion: reduce)` al final del archivo).

2. En `loginDecor.tsx`, agregar al inicio:
   ```typescript
   import './_loginDecor.css';
   ```
   (Vite admite import de CSS side-effect; el CSS entra al bundle solo cuando `loginDecor` es imported.)

3. Borrar el bloque correspondiente de `frontend/src/index.css`.

## Cambio de comportamiento
Ninguno visual. Las clases se aplican exactamente igual. La diferencia es SOLO de bundle: el CSS del login se separa en un chunk CSS (idealmente cargado perezosamente junto con `LoginScreen` vía el AuthGate lazy-load, si se code-split). En el peor caso (Vite no code-split CSS por componente), el CSS sigue bundle-global pero con mejor organización de archivo.

## Restricción preservada: mantener cascada
El bloque `.lg-*` NO tiene dependencia de cascada con reglas globales que vengan ANTES en `index.css` (las reglas `.lg-*` son autónomas: usan solo `var(--accent-primary)` y similares ya definidos en `:root`). Verificado: ninguna regla `.lg-*` extiende `.btn-pill` o `.mc-card` u otra utilidad global.

## Riesgo de migración
Bajo. Si la cascada global fuera dependiente (NO lo es), habría riesgo. Aquí es self-contained.

## Verificación
```bash
cd frontend && npm run build                   # build pasa sin warnings de CSS
cd frontend && npx vitest run src/auth/LoginScreen.test.tsx
```

Manual: lanzar la app, abrir la pantalla de login → verificar que las animaciones (orb, aurora, shimmer) siguen presentes visualmente.
