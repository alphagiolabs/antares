// Regression test: shared HTML sanitizer used by Electron and frontend.
const { sanitizeHtmlForPdf } = require('../shared/html-sanitizer');
const { _sanitizeHtmlForPdf } = require('../electron/dialog-handlers');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function run() {
  console.log('Testing shared html sanitizer...\n');

  const html = `
    <html>
      <head><style>
        .safe { background-image: url(data:image/png;base64,AAAA); }
        .local { background-image: url("file:///etc/passwd"); }
        .remote { background-image: url(https://example.com/a.png); }
      </style></head>
      <body>
        <script>alert(1)</script>
        <iframe src="file:///etc/passwd"></iframe>
      </body>
    </html>
  `;

  const shared = sanitizeHtmlForPdf(html);
  const electron = _sanitizeHtmlForPdf(html);

  assert(shared === electron, 'shared and electron wrappers produce identical output');
  assert(shared.includes('Content-Security-Policy'), 'sanitizer injects CSP meta tag');
  assert(!shared.toLowerCase().includes('<script'), 'sanitizer removes script tags');
  assert(!shared.toLowerCase().includes('<iframe'), 'sanitizer removes iframe tags');
  assert(!shared.includes('file:///etc/passwd'), 'sanitizer blocks local file URLs');
  assert(!shared.includes('https://example.com/a.png'), 'sanitizer blocks remote URLs');
  assert(shared.includes('url(data:image/png;base64,AAAA)'), 'sanitizer keeps data URLs');

  // ─── Regression guards for S-CRÍTICO-1 / S-CRÍTICO-2 / M1 fixes ───────
  // CSS url(javascript:) used to survive because the href/src regex did
  // not reach into CSS. It must now be neutralised.
  const cssJsPayload = "<head></head><style>.x{background:url(javascript:alert(1))}</style>";
  const cssJsOut = sanitizeHtmlForPdf(cssJsPayload);
  assert(!cssJsOut.toLowerCase().includes('javascript:alert'), 'S-CRÍTICO-1: neutralises url(javascript:) in CSS');
  assert(cssJsOut.includes("url('')"), 'S-CRÍTICO-1: replaces url(javascript:) with empty url()');

  // Backtick-quoted event handlers used to bypass the double/single-quote
  // regexes. All quote styles must now be stripped.
  const backtickPayload = "<head></head><img src=x onerror=`alert(1)`>";
  const backtickOut = sanitizeHtmlForPdf(backtickPayload);
  assert(!backtickOut.toLowerCase().includes('onerror'), 'S-CRÍTICO-2: strips backtick-quoted event handlers');

  // Boolean-form event handler attribute (no `=value`) used to survive
  // because the regexes required `=`. The browser fires it on load.
  const booleanPayload = "<head></head><svg onload>";
  const booleanOut = sanitizeHtmlForPdf(booleanPayload);
  assert(!booleanOut.toLowerCase().includes('onload'), 'S-CRÍTICO-2: strips boolean-form event handler attributes');

  // Nested script trick: `<script><script>x</script>` left an orphan
  // `<script>` after the non-greedy first pass consumed the inner
  // closing tag. A second pass must mop up the residual.
  const nestedPayload = "<head></head><script><script>alert(1)</script>";
  const nestedOut = sanitizeHtmlForPdf(nestedPayload);
  assert(!nestedOut.toLowerCase().includes('<script'), 'S-ALTO-1: strips residual <script> after nested-trick payload');

  // SVG data: URIs can carry <script> and event handlers, so they must
  // be collapsed like other unsafe url() references.
  const svgDataPayload = "<head></head><style>.x{background:url(data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)}</style>";
  const svgDataOut = sanitizeHtmlForPdf(svgDataPayload);
  assert(!svgDataOut.toLowerCase().includes('data:image/svg'), 'S-MEDIO-1: collapses data:image/svg+xml URIs in CSS');

  // data:image/png must still pass through (parity with the safe case).
  const pngDataPayload = "<head></head><style>.x{background:url(data:image/png;base64,iVBOR=)}</style>";
  const pngDataOut = sanitizeHtmlForPdf(pngDataPayload);
  assert(pngDataOut.includes('data:image/png;base64,iVBOR='), 'S-MEDIO-1: keeps data:image/png URIs in CSS');

  // ─── SEC-017: payloads adicionales (regex path, default) ───────────
  const imgOnerrorPayload = "<head></head><img src=x onerror=alert(1)>";
  const imgOnerrorOut = sanitizeHtmlForPdf(imgOnerrorPayload);
  assert(!imgOnerrorOut.toLowerCase().includes('onerror'), 'SEC-017: strips <img onerror=...>');

  const jsHrefPayload = "<head></head><a href=\"javascript:alert(1)\">x</a>";
  const jsHrefOut = sanitizeHtmlForPdf(jsHrefPayload);
  assert(!jsHrefOut.toLowerCase().includes('javascript:alert'), 'SEC-017: neutralises javascript: href');

  const importPayload = "<head></head><style>@import url(https://evil.com/x.css);</style>";
  const importOut = sanitizeHtmlForPdf(importPayload);
  assert(!importOut.toLowerCase().includes('@import'), 'SEC-017: strips @import in <style>');
  assert(!importOut.includes('https://evil.com'), 'SEC-017: collapses external url() from @import');

  // ─── SEC-017: preservar funcionalidad (no romper reportes) ──────────
  // <meta charset> DEBE sobrevivir (los reportes lo usan para UTF-8).
  const charsetPayload = "<head><meta charset=\"UTF-8\"></head>";
  const charsetOut = sanitizeHtmlForPdf(charsetPayload);
  assert(charsetOut.includes('charset="UTF-8"'), 'SEC-017: preserva <meta charset> (no rompe codificación)');

  // <meta http-equiv="refresh"> DEBE strip (redirección/CSP override).
  // Nota: la meta CSP inyectada por el sanitizer también lleva http-equiv,
  // así que se afirma sobre el contenido del refresh del usuario.
  const refreshPayload = "<head><meta http-equiv=\"refresh\" content=\"0;url=https://evil.com\"></head>";
  const refreshOut = sanitizeHtmlForPdf(refreshPayload);
  assert(!refreshOut.includes('evil.com'), 'SEC-017: strip contenido de <meta http-equiv=refresh>');
  assert(!refreshOut.toLowerCase().includes('refresh'), 'SEC-017: strip <meta http-equiv=refresh>');

  // Placeholder <svg> de logo DEBE sobrevivir (PreviewPanel.tsx lo usa).
  const svgPlaceholderPayload = "<head></head><div class=\"logo\"><svg width=\"100%\" height=\"100%\" viewBox=\"0 0 200 60\"></svg></div>";
  const svgPlaceholderOut = sanitizeHtmlForPdf(svgPlaceholderPayload);
  assert(svgPlaceholderOut.includes('<svg'), 'SEC-017: preserva placeholder <svg> de logo');
  assert(!svgPlaceholderOut.toLowerCase().includes('onload'), 'SEC-017: svg sin event handlers');

  // ─── SEC-017: path DOMPurify (opt-in via ANTARES_PDF_SANITIZER=purify) ─
  try {
    const sanitizerPath = require.resolve('../shared/html-sanitizer');
    delete require.cache[sanitizerPath];
    process.env.ANTARES_PDF_SANITIZER = 'purify';
    const purifyMod = require('../shared/html-sanitizer');
    const purifyOut = purifyMod.sanitizeHtmlForPdf(
      "<head></head><script>alert(1)</script><img src=x onerror=alert(1)><style>.x{background:url(https://evil.com)}</style>",
    );
    assert(!purifyOut.toLowerCase().includes('<script'), 'SEC-017 purify: strips <script>');
    assert(!purifyOut.toLowerCase().includes('onerror'), 'SEC-017 purify: strips onerror');
    assert(!purifyOut.includes('https://evil.com'), 'SEC-017 purify: collapses external url()');
    assert(purifyOut.includes('Content-Security-Policy'), 'SEC-017 purify: injects CSP meta');
    delete require.cache[sanitizerPath];
    delete process.env.ANTARES_PDF_SANITIZER;
  } catch (err) {
    console.log(`  (skipped DOMPurify path: ${err && err.message})`);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) process.exit(1);
}

run();
