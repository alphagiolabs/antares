// SEC-012: tests del path de parseo de PreviewPanelView.parseFile. No renderiza
// React (parseFile está embebido en el componente con setters de estado); en su
// lugar replica el path exacto de safeRead/safeSheetToJson + el skip inline de
// claves __proto__/constructor/prototype (parseFile:370) contra un xlsx real.
// Valida que el hardening aplica al path de preview-panel sin tocar el componente.
import { describe, it, expect } from 'vitest';
import {
  loadXlsx,
  assertXlsxSize,
  safeRead,
  safeSheetToJson,
  MAX_XLSX_BYTES,
  type XLSXModule,
} from '../../utils/xlsxSafe';

async function buildXlsxU8(
  aoa: unknown[][],
  sheetName = 'Sheet1',
  overrideRef?: string,
): Promise<{ XLSX: XLSXModule; uint8: Uint8Array }> {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (overrideRef) ws['!ref'] = overrideRef;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  // XLSX.write({type:'array'}) devuelve un ArrayBuffer (no Uint8Array); lo
  // envolvemos para que .length y [i] funcionen al construir el binary string.
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return { XLSX, uint8: new Uint8Array(out) };
}

// Réplica fiel de PreviewPanelView.parseFile (sin FileReader/React): mismas
// opts de safeRead (type:binary, cellDates:false, cellNF:true) y safeSheetToJson
// (header:1, raw:true, dateNF:'dd/mm/yy') + el skip inline de claves peligrosas.
async function parseLikePreviewPanel(u8: Uint8Array, size: number) {
  assertXlsxSize(size);
  const XLSX = await loadXlsx();
  let bstr = '';
  for (let i = 0; i < u8.length; i++) bstr += String.fromCharCode(u8[i]); // == readAsBinaryString
  const wb = safeRead(XLSX, bstr, { type: 'binary', cellDates: false, cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const { rows: jsonData, truncated } = safeSheetToJson<unknown[]>(XLSX, ws, {
    header: 1,
    raw: true,
    dateNF: 'dd/mm/yy',
  });
  if (!jsonData.length) return { headers: [] as string[], data: [] as Record<string, unknown>[], truncated };
  const headers = jsonData[0] as string[];
  const data = jsonData.slice(1).map((row) => {
    const obj: Record<string, unknown> = {};
    const arr = row as unknown[];
    headers.forEach((h, i) => {
      const cellValue = arr[i];
      // SEC-012: no asignar claves peligrosas aunque un header las nombrase (parseFile:370).
      if (h !== '__proto__' && h !== 'constructor' && h !== 'prototype') obj[h] = cellValue;
    });
    return obj;
  });
  return { headers, data, truncated };
}

describe('SEC-012 preview-panel parse path (réplica de parseFile)', () => {
  it('happy path: headers + data desde xlsx válido (raw:true)', async () => {
    const { uint8 } = await buildXlsxU8([['name', 'age'], ['Alice', 30], ['Bob', 25]]);
    const { headers, data } = await parseLikePreviewPanel(uint8, uint8.length);
    expect(headers).toEqual(['name', 'age']);
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ name: 'Alice', age: 30 });
    expect(data[1]).toEqual({ name: 'Bob', age: 25 });
  });

  it('SEC-012: skip inline de claves __proto__/constructor/prototype; Object.prototype intacto', async () => {
    const beforePolluted = ({} as Record<string, unknown>).polluted;
    const { uint8 } = await buildXlsxU8([
      ['name', '__proto__', 'constructor', 'prototype', 'age'],
      ['Alice', 'poll', 'c', 'p', 30],
    ]);
    const { data } = await parseLikePreviewPanel(uint8, uint8.length);
    expect(data).toHaveLength(1);
    expect(Object.keys(data[0]).sort()).toEqual(['age', 'name']);
    // Object.prototype no fue contaminado por el header malicioso.
    expect(({} as Record<string, unknown>).polluted).toBe(beforePolluted);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('SEC-012: rechaza > MAX_XLSX_BYTES vía assertXlsxSize (antes de leer)', async () => {
    await expect(parseLikePreviewPanel(new Uint8Array(0), MAX_XLSX_BYTES + 1)).rejects.toThrow(/demasiado grande/i);
  });

  it('SEC-012: row cap → truncated=true cuando el sheet supera MAX_XLSX_SHEET_ROWS', async () => {
    const { uint8 } = await buildXlsxU8([['name'], ['Alice']], 'S', 'A1:A60000');
    const { truncated } = await parseLikePreviewPanel(uint8, uint8.length);
    expect(truncated).toBe(true);
  });
});
