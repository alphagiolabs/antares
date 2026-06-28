// SEC-012: hardening aditivo del parsing XLSX en el renderer.
// @e965/xlsx@0.20.3 ya es la última versión del fork y ya parchea
// CVE-2023-30533 (prototype pollution, fixed en SheetJS 0.19.3+). Aun así,
// defense-in-depth contra las dos clases de CVE del histórico de SheetJS:
//   - ReDoS / memory blowup (CVE-2024-22363): cap de tamaño del archivo y cap
//     de filas con range-limit real (el parser nunca procesa filas > cap).
//   - Prototype pollution (CVE-2023-30533): cellFormula/cellHTML off reducen
//     superficie, y sanitizeRecord strip claves __proto__/constructor/prototype
//     de cada fila-objeto por si un header malicioso las nombrase.
// Es aditivo: cada caller conserva sus propias read/sheet_to_json opts; este
// helper sólo envuelve XLSX.read / sheet_to_json con los límites de seguridad.
import type * as XLSXNS from '@e965/xlsx';

export const MAX_XLSX_BYTES = 10 * 1024 * 1024;
export const MAX_XLSX_SHEET_ROWS = 50_000;

const POLLUTED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export type XLSXModule = typeof XLSXNS;

export class XlsxTooLargeError extends Error {
  readonly size: number;
  readonly max: number;
  constructor(size: number, max: number) {
    super(`Excel demasiado grande (${(size / 1048576).toFixed(1)} MB > ${(max / 1048576).toFixed(0)} MB).`);
    this.name = 'XlsxTooLargeError';
    this.size = size;
    this.max = max;
  }
}

export function loadXlsx(): Promise<XLSXModule> {
  return import('@e965/xlsx');
}

// SEC-012: rechazar antes de leer el archivo (mitiga ReDoS / memory blowup).
export function assertXlsxSize(size: number, max = MAX_XLSX_BYTES): void {
  if (size > max) throw new XlsxTooLargeError(size, max);
}

// SEC-012: cellFormula:false + cellHTML:false reducen superficie del parser.
// readOpts del caller se preservan y ganan estas dos flags por defecto.
export function safeRead(
  XLSX: XLSXModule,
  data: unknown,
  readOpts: Record<string, unknown> = {},
): XLSXNS.WorkBook {
  return XLSX.read(data, {
    cellHTML: false,
    cellFormula: false,
    ...readOpts,
  } as XLSXNS.ParsingOptions);
}

export interface SafeJsonResult<T> {
  rows: T[];
  truncated: boolean;
  /** Filas a las que se acotó (para mensaje de aviso). */
  cappedTo: number;
}

// SEC-012: range-limit sheet_to_json a maxRows. Mitiga ReDoS reduciendo el
// trabajo del parser: decodifica !ref, acota e.r a (s.r + maxRows - 1) y pasa
// el range acotado, así el parser no recorre filas más allá del cap aunque
// !ref las declare. ponytail: ceiling — el cap cuenta filas totales (incluye
// header en modo header:1); ~50k filas de datos. Upgrade path: parametrizar
// por caller si algún formato legítimo necesita más.
export function safeSheetToJson<T>(
  XLSX: XLSXModule,
  sheet: XLSXNS.WorkSheet,
  jsonOpts: Record<string, unknown> = {},
  maxRows = MAX_XLSX_SHEET_ROWS,
): SafeJsonResult<T> {
  const ref = sheet?.['!ref'] as string | undefined;
  let range = jsonOpts.range as string | number | undefined;
  let truncated = false;

  if (
    ref &&
    typeof XLSX.utils.decode_range === 'function' &&
    typeof XLSX.utils.encode_range === 'function'
  ) {
    const r = XLSX.utils.decode_range(ref);
    if (r && typeof r.s?.r === 'number' && typeof r.e?.r === 'number') {
      const lastRow = r.s.r + maxRows - 1;
      if (r.e.r > lastRow) {
        truncated = true;
        r.e.r = lastRow;
        range = XLSX.utils.encode_range(r);
      }
    }
  }

  const rows = XLSX.utils.sheet_to_json<T>(sheet, {
    ...jsonOpts,
    range,
  } as XLSXNS.Sheet2JSONOpts);

  return { rows, truncated, cappedTo: maxRows };
}

// SEC-012: strip claves __proto__/constructor/prototype de una fila-objeto.
// Las filas-array (modo header:1) pasan tal cual (índices numéricos no
// pollutan Object.prototype). Devuelve un objeto plano con Object.prototype
// limpio. ponytail: no usa Object.create(null) para no romper código que
// asume Object.prototype (hasOwnProperty, etc.); basta con no copiar las
// claves peligrosas.
export function sanitizeRecord<T>(row: T): T {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return row;
  const src = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (POLLUTED_KEYS.has(key)) continue;
    out[key] = src[key];
  }
  return out as T;
}

export function sanitizeRecords<T>(rows: readonly T[]): T[] {
  return rows.map(sanitizeRecord);
}
