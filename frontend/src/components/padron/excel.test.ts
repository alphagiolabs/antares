// SEC-012: happy-path + hardening tests de parseWorkbook (padron/excel.ts).
// Valida que el parsing de Excel válido sigue produciendo los mismos domain
// objects ahora que el path pasa por xlsxSafe (size cap + safeRead +
// safeSheetToJson + sanitizeRecords). Corre en jsdom (File/arrayBuffer).
import { describe, it, expect } from 'vitest';
import { parseWorkbook } from './excel';
import { loadXlsx, MAX_XLSX_BYTES } from '../../utils/xlsxSafe';

async function buildXlsxFile(aoa: unknown[][], name = 'padron.xlsx'): Promise<File> {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  return new File([u8], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('SEC-012 padron/excel.parseWorkbook', () => {
  it('happy path: mapea importedItems desde headers de item reconocidos', async () => {
    const aoa = [
      ['N°', 'Nombres y Apellidos', 'Dirección', 'Hora de Comunicacion'],
      [1, 'Alice Test', 'Av. Lima 100', '08:00'],
      [2, 'Bob Test', 'Av. Arequipa 200', '09:00'],
    ];
    const result = await parseWorkbook(await buildXlsxFile(aoa));
    expect(result.workbookName).toBe('padron.xlsx');
    expect(result.importedItems).toHaveLength(2);
    expect(result.importedItems[0]).toMatchObject({
      item: 1,
      nombresApellidos: 'Alice Test',
      direccion: 'Av. Lima 100',
    });
    expect(result.importedItems[1]).toMatchObject({ item: 2, nombresApellidos: 'Bob Test' });
  });

  it('happy path: detecta records desde headers de campo (FIELD_ALIASES)', async () => {
    const aoa = [
      ['Centro de Servicio', 'Servicio Afectado', 'Motivo de la Interrupcion'],
      ['CENTRO 1', 'AGUA', 'Fuga'],
    ];
    const result = await parseWorkbook(await buildXlsxFile(aoa));
    expect(result.records.length).toBeGreaterThanOrEqual(1);
    expect(result.records[0].data).toMatchObject({
      centro: 'CENTRO 1',
      servicioAfectado: 'AGUA',
      motivoInterrupcion: 'Fuga',
    });
  });

  it('SEC-012: rechaza archivo > MAX_XLSX_BYTES antes de leer (assertXlsxSize)', async () => {
    const big = {
      name: 'big.xlsx',
      size: MAX_XLSX_BYTES + 1,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as File;
    await expect(parseWorkbook(big)).rejects.toThrow(/demasiado grande/i);
  });

  it('SEC-012: sin headers reconocidos → fallback al record manual', async () => {
    const result = await parseWorkbook(await buildXlsxFile([['foo', 'bar'], ['x', 'y']]));
    expect(result.records).toHaveLength(1);
    expect(result.records[0].id).toBe('manual-0');
    expect(result.importedItems).toHaveLength(0);
  });
});
