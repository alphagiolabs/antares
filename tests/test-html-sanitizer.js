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

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) process.exit(1);
}

run();
