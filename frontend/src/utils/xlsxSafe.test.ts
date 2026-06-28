// SEC-012: tests del hardening del parsing XLSX. Corre en el env por defecto
// (jsdom) del proyecto; @e965/xlsx es browser-compatible y no usa FileReader
// aquí (opera sobre buffers/strings). Aislado + fileParallelism:false => estable.
import { describe, it, expect } from 'vitest';
import {
  loadXlsx,
  assertXlsxSize,
  safeRead,
  safeSheetToJson,
  sanitizeRecord,
  sanitizeRecords,
  XlsxTooLargeError,
  MAX_XLSX_BYTES,
  MAX_XLSX_SHEET_ROWS,
  type XLSXModule,
} from './xlsxSafe';

async function withXlsx<T>(fn: (XLSX: XLSXModule) => Promise<T> | T): Promise<T> {
  const XLSX = await loadXlsx();
  return fn(XLSX);
}

// Construye un xlsx in-memory a partir de un array-of-arrays y lo devuelve como
// Uint8Array (lo que recibe safeRead con type:'array').
async function buildXlsx(aoa: unknown[][], sheetName = 'Sheet1', overrideRef?: string): Promise<{ XLSX: XLSXModule; uint8: Uint8Array }> {
  return withXlsx((XLSX) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (overrideRef) ws['!ref'] = overrideRef;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
    return { XLSX, uint8: out };
  });
}

describe('SEC-012 xlsxSafe — size cap', () => {
  it('rechaza archivos > MAX_XLSX_BYTES con XlsxTooLargeError', () => {
    expect(() => assertXlsxSize(15 * 1024 * 1024)).toThrow(XlsxTooLargeError);
    expect(() => assertXlsxSize(15 * 1024 * 1024)).toThrow(/demasiado grande/i);
  });
  it('acepta archivos <= MAX_XLSX_BYTES (boundary: == max pasa)', () => {
    expect(() => assertXlsxSize(5 * 1024 * 1024)).not.toThrow();
    expect(() => assertXlsxSize(MAX_XLSX_BYTES)).not.toThrow();
  });
});

describe('SEC-012 xlsxSafe — happy path (cellFormula/cellHTML off no altera datos)', () => {
  it('safeRead + safeSheetToJson devuelven las mismas filas que XLSX directo', async () => {
    const aoa = [['name', 'age'], ['Alice', 30], ['Bob', 25]];
    const { XLSX, uint8 } = await buildXlsx(aoa);

    // Referencia: parseo directo sin hardening.
    const wbDirect = XLSX.read(uint8, { type: 'array' });
    const direct = XLSX.utils.sheet_to_json<Record<string, unknown>>(wbDirect.Sheets['Sheet1'], { defval: '', raw: false });

    // Con hardening.
    const wb = safeRead(XLSX, uint8, { type: 'array' });
    const { rows } = safeSheetToJson<Record<string, unknown>>(XLSX, wb.Sheets['Sheet1'], { defval: '', raw: false });

    expect(rows).toHaveLength(direct.length);
    expect(rows).toEqual(direct);
    expect(rows[0]).toEqual({ name: 'Alice', age: '30' });
    expect(rows[1]).toEqual({ name: 'Bob', age: '25' });
  });

  it('preserva opts del caller (cellDates, raw:true, header:1)', async () => {
    const aoa = [['fecha'], ['2026-01-02'], ['2026-02-03']];
    const { XLSX, uint8 } = await buildXlsx(aoa);
    const wb = safeRead(XLSX, uint8, { type: 'array', cellDates: true });
    const { rows } = safeSheetToJson<unknown[]>(XLSX, wb.Sheets['Sheet1'], { header: 1, raw: true, defval: '' });
    // header:1 => array de arrays, primer fila es header.
    expect(rows[0]).toEqual(['fecha']);
    expect(rows.length).toBe(3);
  });
});

describe('SEC-012 xlsxSafe — row cap (range-limit real, ReDoS mitigation)', () => {
  it('detecta !ref malicioso > cap (default MAX) → truncated=true + cappedTo; preserva el dato real', async () => {
    // Sheet con 1 fila real pero !ref mintiendo 60000 filas (payload ReDoS).
    // SheetJS sólo materializa filas con celdas reales, así que rows.length
    // refleja el dato real (1), no el cap: lo que importa es que el range se
    // acotó (truncated=true, cappedTo=MAX) y el dato real se preserva.
    const { XLSX, uint8 } = await buildXlsx([['name'], ['Alice']], 'S', 'A1:A60000');
    const wb = safeRead(XLSX, uint8, { type: 'array' });
    const res = safeSheetToJson<Record<string, unknown>>(XLSX, wb.Sheets['S'], { defval: '', raw: false }, MAX_XLSX_SHEET_ROWS);
    expect(res.truncated).toBe(true);
    expect(res.cappedTo).toBe(MAX_XLSX_SHEET_ROWS);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0]).toEqual({ name: 'Alice' });
  });

  it('excluye datos reales más allá del cap explícito (enforcement, header:1)', async () => {
    // 200 filas reales (header + 199 datos), cap=100 → range A1:A100; la fila
    // 101 (fill99) queda fuera del cap. Prueba que el parser no recorre más allá.
    const aoa: unknown[][] = [['name']];
    for (let i = 0; i < 199; i++) aoa.push(['fill' + i]);
    const { XLSX, uint8 } = await buildXlsx(aoa, 'S');
    const wb = safeRead(XLSX, uint8, { type: 'array' });
    const res = safeSheetToJson<unknown[]>(XLSX, wb.Sheets['S'], { header: 1, defval: '', raw: false }, 100);
    expect(res.truncated).toBe(true);
    expect(res.rows.length).toBe(100);
    expect(res.rows.some((r) => r[0] === 'fill98')).toBe(true);  // Excel row 100, última incluida
    expect(res.rows.some((r) => r[0] === 'fill99')).toBe(false); // Excel row 101, beyond cap
  });

  it('no trunca sheets dentro del cap (truncated=false, filas reales)', async () => {
    const aoa = [['name'], ['Alice'], ['Bob'], ['Carol']];
    const { XLSX, uint8 } = await buildXlsx(aoa);
    const wb = safeRead(XLSX, uint8, { type: 'array' });
    const res = safeSheetToJson<Record<string, unknown>>(XLSX, wb.Sheets['Sheet1'], { defval: '', raw: false });
    expect(res.truncated).toBe(false);
    expect(res.rows.length).toBe(3); // 3 data rows (header excluded by default header mode)
  });
});

describe('SEC-012 xlsxSafe — prototype pollution defense', () => {
  it('sanitizeRecord strip claves __proto__/constructor/prototype (own keys)', () => {
    const row: Record<string, unknown> = {};
    // __proto__ como own data property (bypass del setter) — simula lo que un
    // parser buggado podría producir.
    Object.defineProperty(row, '__proto__', { value: 'poll', enumerable: true, configurable: true, writable: true });
    row.constructor = 'attacker'; // own key
    row.prototype = 'p'; // own key
    row.name = 'Alice';
    row.age = 30;

    const out = sanitizeRecord(row);
    expect(Object.keys(out).sort()).toEqual(['age', 'name']);
    expect((out as Record<string, unknown>).constructor).toBe(Object); // restaurado al real
  });

  it('sanitizeRecord deja pasar filas-array (header:1) sin tocar', () => {
    const arr = ['a', 'b', 'c'];
    expect(sanitizeRecord(arr)).toBe(arr);
    expect(sanitizeRecord(null)).toBe(null);
    expect(sanitizeRecord(42 as never)).toBe(42);
  });

  it('end-to-end: header __proto__/constructor → filas sanitizadas, Object.prototype intacto', async () => {
    // Snapshot de Object.prototype antes.
    const beforePolluted = ({} as Record<string, unknown>).polluted;
    const beforeConstructor = ({} as Record<string, unknown>).constructor;

    const aoa = [['__proto__', 'constructor', 'name'], [{ polluted: 'yes' }, 'c', 'Alice']];
    const { XLSX, uint8 } = await buildXlsx(aoa);
    const wb = safeRead(XLSX, uint8, { type: 'array' });
    const { rows } = safeSheetToJson<Record<string, unknown>>(XLSX, wb.Sheets['Sheet1'], { defval: '', raw: false });
    const sanitized = sanitizeRecords(rows);

    // Ninguna fila sanitizada lleva claves peligrosas como own keys.
    for (const r of sanitized) {
      expect(Object.keys(r)).not.toContain('__proto__');
      expect(Object.keys(r)).not.toContain('constructor');
      expect(Object.keys(r)).not.toContain('prototype');
    }
    // La columna legítima 'name' se preserva.
    expect(sanitized.some((r) => r.name === 'Alice')).toBe(true);

    // Object.prototype no fue contaminado.
    expect(({} as Record<string, unknown>).polluted).toBe(beforePolluted);
    expect(({} as Record<string, unknown>).constructor).toBe(beforeConstructor);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
