// SEC-012: happy-path + hardening tests de importSpreadsheet (volantes/utils/import.ts).
// Valida que la importación de Excel válido sigue produciendo los mismos
// FlyerRecord ahora que el path pasa por xlsxSafe (size cap + safeRead +
// safeSheetToJson + sanitizeRecords). Corre en jsdom (File/arrayBuffer).
import { describe, it, expect } from 'vitest';
import { importSpreadsheet } from './import';
import { loadXlsx, MAX_XLSX_BYTES } from '../../../utils/xlsxSafe';

async function buildXlsxFile(aoa: unknown[][], name = 'volantes.xlsx'): Promise<File> {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'volantes');
  const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  return new File([u8], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const REQUIRED = ['distrito', 'fecha', 'hora_inicio', 'hora_fin', 'reservorio'];

describe('SEC-012 volantes/utils.importSpreadsheet', () => {
  it('happy path: importa records con todas las columnas requeridas', async () => {
    const aoa = [
      ['distrito', 'fecha', 'hora_inicio', 'hora_fin', 'reservorio', 'sector', 'zonas_afectadas'],
      ['ATE VITARTE', '2026-02-26', '08:00', '20:00', 'CR-121 HUASCAR', 'SECTOR 411', 'AH Huascar'],
    ];
    const result = await importSpreadsheet(await buildXlsxFile(aoa));
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      distrito: 'ATE VITARTE',
      reservorio: 'CR-121 HUASCAR',
      fecha: '2026-02-26',
      horaInicio: '08:00',
      horaFin: '20:00',
    });
  });

  it('SEC-012: faltan columnas requeridas → throw con mensaje claro', async () => {
    const aoa = [['distrito', 'fecha'], ['ATE', '2026-01-01']];
    await expect(importSpreadsheet(await buildXlsxFile(aoa))).rejects.toThrow(/faltan columnas requeridas/i);
  });

  it('SEC-012: columnas presentes pero filas vacías → throw "no se encontraron filas válidas"', async () => {
    const aoa = [REQUIRED, ['', '', '', '', '']];
    await expect(importSpreadsheet(await buildXlsxFile(aoa))).rejects.toThrow(/no se encontraron filas/i);
  });

  it('SEC-012: rechaza archivo > MAX_XLSX_BYTES antes de leer', async () => {
    const big = {
      name: 'big.xlsx',
      size: MAX_XLSX_BYTES + 1,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as File;
    await expect(importSpreadsheet(big)).rejects.toThrow(/demasiado grande/i);
  });
});
