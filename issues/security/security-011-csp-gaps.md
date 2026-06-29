# SEC-011 — Gaps de CSP: sin meta CSP en `index.html`; `style-src 'unsafe-inline'` en prod; `script-src 'unsafe-inline'` en dev

- **Severidad:** P2 (Media)
- **Categoría:** CSP (CWE-1021 / CWE-693)
- **Archivos afectados:** `frontend/index.html`, `electron/window-manager.js:46-57`

## Vulnerabilidad

1. **`frontend/index.html`** no tiene `<meta http-equiv="Content-Security-Policy">`. La CSP de la app se setea solo vía `onHeadersReceived` en `electron/window-manager.js`, lo que **solo aplica cuando carga Electron**. Cualquier otra carga del HTML (`vite preview`, tests jsdom, un futuro web build) queda **sin CSP**.

2. **CSP de producción** incluye `style-src 'self' 'unsafe-inline'`:
   ```
   default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
   img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.supabase.co
   ```
   `'unsafe-inline'` en estilos permite inyección CSS. Hoy el renderer no toma CSS del usuario, pero `hc_theme_css_cache` en `localStorage` aplica `setProperty(key, value)` con valores no validados (SEC-016) — combinado, otra app/perfil podría inyectar CSS (`@import url(...)`, `background:url(...)`) para exfiltración/UI spoofing.

3. **CSP de dev** añade `script-src ... 'unsafe-inline'`:
   ```
   script-src 'self' http://localhost:5173 'unsafe-inline'
   ```
   Vite en dev inyecta scripts inline (HMR). `'unsafe-inline'` en dev amplía la superficie XSS en desarrollo.

`script-src` en **prod** es `'self'` (sin unsafe-eval/unsafe-inline) — eso está bien y no se toca.

## Impacto

- Sin meta CSP: cargas no-Electron sin protección (tests, preview, despliegue web futuro).
- `style-src 'unsafe-inline'` en prod: vector de CSS injection si un input alcanza estilos (hoy vía theme cache — ver SEC-016).
- `script-src 'unsafe-inline'` en dev: amplía XSS en desarrollo (menor impacto, dev-only).

P2 (hardening; la app Electron en prod ya tiene `script-src 'self'`, así que el riesgo principal es el vector CSS + las cargas no-Electron).

## Fix propuesto (aditivo, conserva la funcionalidad)

1. **Meta CSP belt-and-suspenders en `frontend/index.html`** (idéntica a la de prod del window-manager, para que cargas no-Electron también estén protegidas):
   ```html
   <head>
     <meta charset="UTF-8" />
     <meta http-equiv="Content-Security-Policy"
           content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
                    img-src 'self' data: blob:; font-src 'self';
                    connect-src 'self' https://*.supabase.co" />
     ...
   ```
   > En Electron, el header de `onHeadersReceived` **tiene prioridad** sobre la meta (o se fusionan restrictivamente), así que no afloja la CSP existente. Conserva toda la funcionalidad de la app Electron.

2. **Eliminar `'unsafe-inline'` de `style-src` en prod** cuando sea viable: migrar los estilos inline críticos (los que Tailwind/inline styles generan) a hashes. Si Tailwind injecta estilos en runtime vía `<style>`, usar un nonce por sesión:
   ```js
   // window-manager.js — generar nonce y aplicarlo a la CSP y a los <style> inyectados
   const styleNonce = crypto.randomBytes(16).toString('base64');
   'style-src \'self\' \'nonce-' + styleNonce + '\''
   ```
   y exponer el nonce al renderer para que lo aplique a sus `<style>`. **Esto puede requerir trabajo** según cómo se inyecten estilos — si rompe la UI, mantener `'unsafe-inline'` temporalmente y documentar como tech debt (la meta CSP ya mitiga lo no-Electron). La prioridad mínima es el punto 1 (meta CSP).

3. **Dev CSP `script-src`:** Vite 5 soporta nonce para HMR en dev; como workaround rápido, restringir el origen en vez de `'unsafe-inline'`:
   ```
   script-src 'self' http://localhost:5173
   ```
   Si Vite necesita inline para HMR, mantener `'unsafe-inline'` **solo en dev** (ya es el caso) — el riesgo es dev-only y aceptable. No cambiar prod.

> El fix mínimo y seguro (punto 1) no rompe nada. Los puntos 2/3 son endurecimiento progresivo.

## Testing (sin romper nada)

1. **Nuevo test estático** `tests/test-html-csp-meta.js` (o en `test-version-sync.js`): leer `frontend/index.html` y verificar que existe `<meta http-equiv="Content-Security-Policy">` con `script-src` sin `'unsafe-eval'` y `default-src 'self'`. Falla si se elimina.
2. **`tests/test-electron-preload.js`:** verificar que la CSP aplicada por `onHeadersReceived` sigue presente (sin cambios).
3. **Smoke `npm run dev` y `npm run build:win`:** la UI renderiza normal (Tailwind, framer-motion). Si tras quitar `'unsafe-inline'` de style-src algo se rompe, revertir ese sub-punto y dejar el punto 1.
4. **`vite preview`:** cargar la app y verificar en DevTools que la meta CSP aplica (carga no-Electron ahora protegida).
