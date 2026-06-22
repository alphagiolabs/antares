/**
 * Decode a base64 string into a `Uint8Array`.
 *
 * Extracted as a pure module so other components (MappingPreviewPanel,
 * sellador/pdfjs) can import it without dragging in the full FormatosView
 * bundle, which previously created a dynamic-import cycle:
 *   MappingPreviewPanel -> import('./FormatosView') -> MappingPreviewPanel
 *
 * Validates the input shape before calling `atob` so corrupt payloads
 * raise a typed Error instead of a cryptic DOMException.
 */
export function safeBase64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  if (!b64 || typeof b64 !== 'string') throw new Error('Datos base64 inválidos');
  const cleaned = b64.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 === 1) {
    throw new Error('Datos base64 corruptos');
  }
  let binary: string;
  try {
    binary = atob(cleaned);
  } catch {
    throw new Error('Datos base64 corruptos');
  }
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
