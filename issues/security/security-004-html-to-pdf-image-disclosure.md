# SEC-004 — `html_to_pdf`: `localImagePaths` lee cualquier imagen absoluta → exfiltración

- **Severidad:** P1 (Alta)
- **Categoría:** Path Traversal / Local File Disclosure (CWE-22)
- **Archivos afectados:** `electron/dialog-handlers.js:15-25` (`_localImageEntries`), `92-94` (allowlist de `fileUrl`)

## Vulnerabilidad

`html_to_pdf` permite al renderer pasar `localImagePaths: { [token]: "/ruta/absoluta/a/imagen" }`. `_localImageEntries` valida el token y la extensión, y exige que el path sea absoluto — pero **no lo confina** a nada:

```js
function _localImageEntries(rawPaths) {
  if (!rawPaths || typeof rawPaths !== 'object' || Array.isArray(rawPaths)) return [];
  const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff', '.ico']);
  return Object.entries(rawPaths).flatMap(([token, rawPath]) => {
    if (typeof token !== 'string' || !/^antares-local-image:[a-zA-Z0-9_-]{1,120}$/.test(token)) return [];
    if (typeof rawPath !== 'string' || !path.isAbsolute(rawPath)) return [];   // ← solo exige absoluto
    if (!allowedExtensions.has(path.extname(rawPath).toLowerCase())) return [];
    return [{ token, fileUrl: pathToFileURL(rawPath).toString() }];   // ← cualquier ruta absoluta
  });
}
```

Esas `fileUrl` se añaden a `allowedFileUrls` y se inyectan en el HTML; el filtro `webRequest` las **deja pasar** explícitamente:

```js
const filter = (details, callback) => {
  if (details.url.startsWith('data:') || allowedFileUrls.has(details.url)) {
    callback({ cancel: false });   // ← la imagen local del atacante se carga
  } else { callback({ cancel: true }); }
};
```

Cuando el renderer llama `html_to_pdf` **sin `outputPath`**, el PDF resultante se devuelve como `pdf_base64` al renderer (`dialog-handlers.js:204-212`). Así, un renderer comprometido construye un HTML que referencia `antares-local-image:token` → `C:\Users\victim\Documents\id_card.png`, el main process lo incrusta en el PDF, y devuelve el PDF en base64 → el atacante descifra la imagen del PDF.

## Impacto

Exfiltración de **cualquier archivo de imagen** (con extensión permitida) legible por el usuario del proceso Electron, devuelto al renderer comprometido como PDF embebido. Incluye imágenes personales, escaneos de documentos, fotos de identificaciones, capturas de pantalla sensibles, etc. Prerrequisito: renderer comprometido (XSS) — mismo prerrequisito que SEC-003, y de hecho es la variante main-process de la misma clase de bug.

## Fix propuesto (aditivo, conserva la funcionalidad)

Reutilizar la Capa 2 de SEC-003: el main process solo acepta `localImagePaths` cuyas rutas estén bajo una **raíz vouched** que el propio main process emitió en un diálogo nativo reciente (`dialog_files`/`dialog_folder`). Se añade un registro en memoria de raíces vouched (con TTL corto) en el main process, y se valida cada `rawPath` contra él.

`electron/dialog-handlers.js` (cambios aditivos):

```js
// Registro de raíces vouched por el diálogo nativo (main process = límite de confianza).
// TTL corto: un renderer comprometido no puede reusar una raíz de hace horas.
const _vouchedRoots = new Map(); // rootPath -> expiresAt
const VOUCH_TTL_MS = 10 * 60 * 1000;

function _addVouchedRoot(absPath) {
  if (typeof absPath !== 'string' || !absPath) return;
  _vouchedRoots.set(path.resolve(absPath).toLowerCase(), Date.now() + VOUCH_TTL_MS);
}
function _isVouched(absPath) {
  const resolved = path.resolve(absPath).toLowerCase();
  const now = Date.now();
  // limpiar expiradas
  for (const [k, exp] of _vouchedRoots) if (exp <= now) _vouchedRoots.delete(k);
  // ¿alguna raíz vouched es prefix del path?
  for (const root of _vouchedRoots.keys()) {
    if (resolved === root || resolved.startsWith(root + path.sep)) return true;
  }
  return false;
}

function _localImageEntries(rawPaths) {
  if (!rawPaths || typeof rawPaths !== 'object' || Array.isArray(rawPaths)) return [];
  const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff', '.ico']);
  return Object.entries(rawPaths).flatMap(([token, rawPath]) => {
    if (typeof token !== 'string' || !/^antares-local-image:[a-zA-Z0-9_-]{1,120}$/.test(token)) return [];
    if (typeof rawPath !== 'string' || !path.isAbsolute(rawPath)) return [];
    if (!allowedExtensions.has(path.extname(rawPath).toLowerCase())) return [];
    // ← aditivo: solo imágenes bajo una raíz vouched por el diálogo nativo
    if (!_isVouched(rawPath)) return [];
    return [{ token, fileUrl: pathToFileURL(rawPath).toString() }];
  });
}
```

Y en los handlers de diálogo (`dialog_files`, `dialog_folder`, `dialog_save`), llamar `_addVouchedRoot(...)` con la carpeta elegida (igual que el `vouchedRoots` de SEC-003 Capa 2). Así, las imágenes locales solo se incrustan si el usuario las eligió explícitamente en un diálogo reciente.

> Conserva la funcionalidad: el flujo legítimo (el usuario selecciona imágenes con el diálogo, el renderer las referencia en el HTML del PDF) sigue funcionando — ahora validado contra el vouching. Solo se bloquean paths que el renderer inventó sin diálogo.

**Belt-and-suspenders (opcional):** además, aplicar el screen de system-sensitive de SEC-003 Capa 1 a `rawPath` (rechazar `C:\Windows\...`, `/etc/...`) antes del vouching, para que incluso un bug en el vouching no permita leer assets del sistema.

## Testing (sin romper nada)

1. **`tests/test-electron-dialogs.js`** — extender:
   - `dialog_files` selecciona `tmp/a.png` → `_vouchedRoots` contiene `tmp` (o se expone `vouchedRoots` en el resultado).
   - `_localImageEntries({ 'antares-local-image:t': '<tmp>/a.png' })` → incluye la entrada (happy path intacto).
   - `_localImageEntries({ 'antares-local-image:t': 'C:\\Users\\victim\\secret.png' })` (no vouched) → `[]` (bloqueado).
   - Después del TTL, un path previamente vouched → `[]`.
2. **`tests/test-html-sanitizer.js`** — sin cambios (el sanitizer no se toca).
3. **Smoke manual:** generar un PDF con logos locales elegidos por diálogo → funciona igual que antes.
