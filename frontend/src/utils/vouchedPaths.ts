/**
 * SEC-003/004 Capa 2 (espejo frontend): rastrea las rutas vouched por los
 * diálogos nativos. El main process registra vouchers al responder
 * dialog_files/dialog_dest/dialog_save/dialog_folder y adjunta
 * `vouchedPaths`/`vouchedRoots` a la respuesta (campos aditivos). Este módulo
 * los espeja aquí para que pdfAssets prefiera tokens disk-backed (eficiente)
 * solo para rutas vouched y caiga a data URL para archivos de
 * `<input type=file>`/drag-drop (no vouched).
 *
 * Razón de seguridad: un File de input/drag-drop expone `.path` en Electron,
 * pero esa ruta NO fue elegida por un diálogo nativo, así que el main process
 * no la voucha. Pasarla como `localImagePaths` reabre el vector de disclosure
 * de SEC-004 en modo warn y se descarta en enforce. Caer a data URL cierra el
 * vector en ambos modos y preserva el PDF visible idéntico (costo: más memoria
 * para flujos con muchas imágenes, acotado por la compresión de pdfAssets).
 */

const _vouched = new Set<string>();
const _vouchedLower = new Set<string>();

function _norm(p: string): string {
  return p.trim();
}

function _normLower(p: string): string {
  // Windows es case-insensitive; el main process canonicaliza con lowercase.
  // Guardamos ambas formas para matchear sin depender de la plataforma.
  return p.trim().toLowerCase();
}

export function markVouchedPaths(paths?: string[] | null): void {
  if (!Array.isArray(paths)) return;
  for (const p of paths) {
    if (typeof p === 'string' && p) {
      _vouched.add(_norm(p));
      _vouchedLower.add(_normLower(p));
    }
  }
}

export function isVouchedPath(path?: string | null): boolean {
  if (typeof path !== 'string' || !path) return false;
  const n = _norm(path);
  if (_vouched.has(n)) return true;
  return _vouchedLower.has(_normLower(path));
}

export function clearVouchedPaths(): void {
  _vouched.clear();
  _vouchedLower.clear();
}
