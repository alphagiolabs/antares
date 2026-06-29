# SEC-017 — Sanitizer HTML de PDF basado en regex (no DOMPurify) — robustez defense-in-depth

- **Severidad:** P3 (Baja)
- **Categoría:** XSS / Sanitization (CWE-79, defense-in-depth)
- **Archivos afectados:** `shared/html-sanitizer.js:33-78`, usado por `electron/dialog-handlers.js:6,171` (main process, PDF render)

## Vulnerabilidad

`sanitizeHtmlForPdf` hace sanitización **regex** (strip de `<script>`/`<iframe>`/`<object>`/`<embed>`/`<link>`, event handlers `on*`, URIs `javascript:`/`vbscript:`, normalización de `url()`) e inyecta un `<meta CSP default-src 'none'>`. Los regex son cuidadosos (dos pasadas, cubre boolean `on*`, backticks, CSS `url(javascript:)`), pero **un sanitizer regex es estructuralmente más frágil** que un parser basado en DOM (DOMPurify): casos de anidación rara, encoding, atributos desconocidos, y evolución de HTML pueden dejar residuos.

**Mitigaciones ya presentes** (no borrar): el PDF render window usa `contextIsolation: true`, `sandbox: true`, sesión/partición dedicada, filtro `webRequest` que bloquea todo load externo/file salvo allowlist, y el CSP `default-src 'none'` que el propio sanitizer inyecta. Así, aunque el regex falle, los scripts no corren (CSP) y no hay red (`default-src 'none'` + filtro). Por eso es P3 y no P2: es robustez de una capa, no un hole explotable hoy.

`frontend/package.json` ya tiene un override `dompurify@^3.4.11` (transitivo de jspdf), pero `shared/html-sanitizer.js` **no lo usa** — DOMPurify no está cableado al path de PDF.

## Impacto

Bajo hoy (CSP + sandbox + filtro webRequest contienen). Riesgo futuro: si se añade un sink `dangerouslySetInnerHTML`/export HTML en el renderer sin cablear el sanitizer, o si un bypass del regex + un cambio en el filtro webRequest coinciden, la capa regex sería la única. P3 (defense-in-depth: hacer la capa de sanitización tan robusta como las demás).

## Fix propuesto (aditivo, conserva la funcionalidad de PDF)

Reemplazar el núcleo de sanitización por **DOMPurify** (ya en el árbol de deps vía override), manteniendo el mismo contract (`sanitizeHtmlForPdf(html)` devuelve HTML seguro con la CSP meta) y el filtro `url()` allowlist de data URIs que el sanitizer actual provee.

`shared/html-sanitizer.js` (cambios aditivos — el sanitizer actual queda como fallback):
```js
let _purify = null;
function _loadPurify() {
  if (_purify !== null) return _purify;
  try {
    // jsdom en main process: DOMPurify necesita un DOM. En Electron main,
    // usar el DOM de un BrowserWindow offscreen o 'dompurify' con un jsdom
    // window. Si no está disponible, caer al sanitizer regex (fallback).
    _purify = require('dompurify');   // + polyfill window si hace falta
  } catch { _purify = false; }
  return _purify;
}

function sanitizeHtmlForPdf(html) {
  const purify = _loadPurify();
  let clean;
  if (purify) {
    clean = purify.sanitize(String(html), {
      ALLOWED_TAGS: ['style','div','span','p','img','table','thead','tbody','tr','td','th',
                     'h1','h2','h3','h4','ul','ol','li','br','b','i','strong','em','hr'],
      ALLOWED_ATTR: ['style','src','width','height','colspan','rowspan','class','id','alt'],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script','iframe','object','embed','link','meta','form','input','svg','math'],
      FORBID_ATTR: ['onerror','onload','onclick','href','xlink:href'],   // href bloqueado: solo imágenes embebidas
    });
  } else {
    clean = _sanitizeRegex(String(html));   // ← el sanitizer regex actual, renombrado como fallback
  }
  // Mantener el allowlist de data-URIs de imágenes y la inyección de CSP meta (contract actual).
  clean = _collapseUnsafeUrls(clean);
  return _injectCspMeta(clean);
}
```

> Conserva toda la funcionalidad: el HTML de los reportes/volantes/padrón se renderiza igual (mismas tags permitidas). Solo cambia el motor de sanitización a DOMPurify (más robusto) con fallback regex si DOMPurify no carga en main process. La CSP meta y el filtro `url()` se mantienen.

**Lint rule complementaria (opcional):** prohibir `dangerouslySetInnerHTML` en `frontend/src` sin import del sanitizer:
```jsonc
// eslint config
"no-restricted-syntax": ["warn", {
  "selector": "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  "message": "dangerouslySetInnerHTML requiere sanitizeHtmlForPdf/DOMPurify."
}]
```

## Testing (sin romper nada)

1. **`tests/test-html-sanitizer.js`** (existe) — todos los payloads existentes siguen neutralizándose (`<script>`, `onerror=`, `javascript:`, `url(javascript:)`, `<script><script>x</script>` anidado, `<svg onload>` boolean). Ampliar con:
   - `<img src=x onerror=alert(1)>` → sin `onerror`.
   - `<a href="javascript:alert(1)">` → sin `href` (o `href` vacío).
   - `<style>@import url(https://evil.com)</style>` → sin `@import` (o `url()` collapsed).
2. **Smoke de PDF:** generar un PDF de un reporte técnico / volante / panel-aviso-corte existente → el PDF se ve idéntico al de antes (mismo layout, mismas imágenes embebidas).
3. **Fallback:** si DOMPurify no carga (mock `_loadPurify` → false), el sanitizer regex sigue pasando los tests (defensa en profundidad).
