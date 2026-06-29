/**
 * Shared HTML sanitizer for PDF rendering (Electron main + renderer).
 * Strips active content and external resource URLs before printToPDF.
 *
 * This is a defense-in-depth layer. The authoritative guard against
 * external resources is the webRequest interceptor in dialog-handlers.js
 * (which now covers both HTTP/HTTPS schemes and the file scheme), plus
 * the CSP meta injected below. The regexes here catch the common payload
 * shapes so the rendered HTML never even attempts a blocked request.
 *
 * SEC-017: además del sanitizer regex (default), se cablea DOMPurify
 * (basado en DOM, más robusto) como OPT-IN via `ANTARES_PDF_SANITIZER=purify`.
 * DOMPurify necesita un DOM; en el main process de Electron se usa jsdom
 * (devDep, disponible en dev/test). En prod (jsdom ausente) cae al regex.
 * ponytail: el regex sigue siendo el default para no arriesgar el output de
 * PDF sin un smoke test; upgrade path: flipar el default a 'purify' tras
 * verificar que los PDFs (reportes/volantes/padrón) se ven idénticos.
 */

const CSP_META =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data: file:; font-src data:;\">";

// data: URIs we consider safe to keep in CSS url() / img src. SVG is
// intentionally excluded — `data:image/svg+xml` can carry `<script>` and
// event handlers, and Chromium will execute them in some contexts.
const SAFE_DATA_URI_PREFIXES = [
  'data:image/png',
  'data:image/jpeg',
  'data:image/jpg',
  'data:image/gif',
  'data:image/bmp',
  'data:image/webp',
  'data:image/x-icon',
];

function isSafeDataUrl(url) {
  const lowered = String(url).trim().toLowerCase();
  return SAFE_DATA_URI_PREFIXES.some((prefix) => lowered.startsWith(prefix));
}

let _purify = undefined; // undefined = no probeado; null = no disponible; objeto = listo

function _loadPurify() {
  if (_purify !== undefined) return _purify;
  if (!process || !process.env || process.env.ANTARES_PDF_SANITIZER !== 'purify') {
    _purify = null;
    return _purify;
  }
  try {
    const mod = require('dompurify');
    const createDOMPurify =
      typeof mod === 'function' ? mod : mod && (mod.default || mod.createDOMPurify);
    const jsdom = require('jsdom');
    const JSDOM = jsdom && (jsdom.JSDOM || (jsdom.default && jsdom.default.JSDOM));
    const dom = new JSDOM('', { url: 'about:blank' });
    _purify = createDOMPurify(dom.window);
  } catch (_err) {
    _purify = null;
  }
  return _purify;
}

const PURIFY_OPTS = {
  // Incluir 'meta' y 'svg': los reportes usan <meta charset="UTF-8"> y <svg>
  // como placeholder de logo. DOMPurify sanea el contenido activo (script/on*)
  // y FORBID_ATTR neutraliza http-equiv/xlink:href.
  ALLOWED_TAGS: [
    'style', 'meta', 'div', 'span', 'p', 'img', 'svg', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'br', 'b', 'i', 'strong', 'em', 'hr',
  ],
  ALLOWED_ATTR: ['style', 'src', 'width', 'height', 'colspan', 'rowspan', 'class', 'id', 'alt', 'charset', 'viewBox'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'href', 'xlink:href', 'http-equiv'],
};

function _sanitizeRegex(html) {
  const stripped = String(html)
    // Strip active-content element pairs non-greedily first.
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    // SEC-017: strip SOLO <meta http-equiv=...> (refresh / CSP override que
    // podría neutralizar nuestro CSP). Conservar <meta charset>/viewport: los
    // reportes usan <meta charset="UTF-8"> y quitarlo rompería la codificación
    // del PDF (acentos). Nuestro CSP meta se inyecta post-sanitize, intacto.
    .replace(/<meta\b[^>]*?\bhttp-equiv\s*=[^>]*>/gi, '')
    // SEC-017: strip @import dentro de <style> (exfil CSS). El collapse de
    // url() ya neutraliza url(...), pero esto remueve el @import entero.
    // ponytail: no se strip <svg>/<math>/<form>: los reportes usan <svg> como
    // placeholder de logo (PreviewPanel.tsx), y el contenido activo de svg
    // (onload, <script> hijo) ya lo neutralizan los regex de event-handlers/script.
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (m) => m.replace(/@import\b[^;]*;?/gi, ''))
    // Second pass to mop up residuals from nested/script-trick payloads
    // (e.g. `<script><script>x</script>` leaves an orphan `<script>`
    // after pass 1) and bare tags with no closing tag.
    .replace(/<script[^>]*>/gi, '')
    .replace(/<\/script>/gi, '')
    .replace(/<iframe[^>]*>/gi, '')
    .replace(/<\/iframe>/gi, '')
    // Strip inline event handlers (onload=, onerror=, onclick=, ...) which
    // can execute script even after <script> tags are removed. Cover all
    // quote styles: double, single, backtick, and unquoted. Also handle
    // boolean form `<svg onload>` (no `=value`) which the browser treats
    // as a present attribute and fires on load.
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*`[^`]*`/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\son[a-z]+\b(?=\s|>|\/)/gi, '')
    // Neutralise javascript:/vbscript: URIs in href/src/xlink:href/etc.
    .replace(/(href|src|xlink:href)\s*=\s*(['"]?)\s*(?:javascript|vbscript):[^"'>\s]*\2/gi, '$1=$2$2')
    // Neutralise javascript:/vbscript: URIs inside CSS url(...) — the
    // href/src regex above does not reach into CSS. Without this, a
    // payload like `<style>.x{background:url(javascript:alert(1))}</style>`
    // survives intact.
    .replace(/url\(\s*(['"]?)\s*(?:javascript|vbscript):[^'")\s]*\1\s*\)/gi, "url('')")
    // For all other url(...) references, allow only safe data: image URIs;
    // everything else (http, file, blob without an allowlisted token, etc.)
    // is collapsed to an empty url so the renderer never tries to fetch it.
    // External resources are blocked by the webRequest interceptor too,
    // but collapsing here avoids even triggering that path.
    .replace(/url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi, (match, _quote, urlValue) => {
      return isSafeDataUrl(urlValue) ? match : "url('')";
    });
  return stripped;
}

function _collapseUnsafeUrls(html) {
  // Re-aplica el allowlist de url() por si DOMPurify dejó urls externas en
  // <style> (defense-in-depth; idempotente sobre la salida del regex).
  return String(html)
    .replace(/url\(\s*(['"]?)\s*(?:javascript|vbscript):[^'")\s]*\1\s*\)/gi, "url('')")
    .replace(/url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi, (match, _quote, urlValue) => {
      return isSafeDataUrl(urlValue) ? match : "url('')";
    });
}

function _injectCspMeta(html) {
  // Inject CSP into the first <head> only. Multiple <head> elements would
  // be malformed HTML and a second one would bypass CSP, so if there's no
  // <head> at all we prepend the meta to guarantee coverage.
  const injectedHtml = String(html).replace(/<head([^>]*)>/i, `<head$1>${CSP_META}`);
  return /<head/i.test(injectedHtml) ? injectedHtml : CSP_META + injectedHtml;
}

function sanitizeHtmlForPdf(html) {
  const purify = _loadPurify();
  let clean;
  if (purify) {
    try {
      clean = purify.sanitize(String(html), PURIFY_OPTS);
    } catch (_err) {
      clean = _sanitizeRegex(String(html));
    }
  } else {
    clean = _sanitizeRegex(String(html));
  }
  clean = _collapseUnsafeUrls(clean);
  return _injectCspMeta(clean);
}

module.exports = { sanitizeHtmlForPdf, CSP_META, isSafeDataUrl };
