/**
 * Shared HTML sanitizer for PDF rendering (Electron main + renderer).
 * Strips active content and external resource URLs before printToPDF.
 */

const CSP_META =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data: file:; font-src data:;\">";

function sanitizeHtmlForPdf(html) {
  const stripped = String(html)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/url\(\s*(['"]?)(.+?)\1\s*\)/gi, (match, _quote, urlValue) => {
      return String(urlValue).trim().toLowerCase().startsWith('data:') ? match : "url('')";
    });
  const injectedHtml = stripped.replace(/<head([^>]*)>/i, `<head$1>${CSP_META}`);
  return /<head/i.test(injectedHtml) ? injectedHtml : CSP_META + injectedHtml;
}

module.exports = { sanitizeHtmlForPdf, CSP_META };
