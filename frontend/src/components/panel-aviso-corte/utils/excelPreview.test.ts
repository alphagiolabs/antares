import { describe, expect, it } from 'vitest';
import type { ExcelSource } from '../types';
import {
  buildExcelPreviewPanels,
  normalizePanelDateStr,
  resolveDefaultAddressColumn,
  resolveDefaultKeyColumn,
} from './excelPreview';

const templateSource: ExcelSource = {
  filename: 'datos.xlsx',
  columns: ['ID', 'DIRECCION', 'FECHA DE CORTE', 'CUADRANTE AFECTADO', 'MOTIVO'],
  normalizedColumns: ['id', 'direccion', 'fecha de corte', 'cuadrante afectado', 'motivo'],
  rows: [
    {
      ID: '1001',
      DIRECCION: 'Calle 1',
      'FECHA DE CORTE': '2024-05-15',
      'CUADRANTE AFECTADO': 'CUADRANTE A-12',
      MOTIVO: 'Mantenimiento',
    },
    {
      ID: '1002',
      DIRECCION: 'Calle 2',
      'FECHA DE CORTE': '15/05/2024',
      'CUADRANTE AFECTADO': 'CUADRANTE B-05',
      MOTIVO: 'Reparación',
    },
  ],
  warnings: [],
};

describe('excelPreview', () => {
  it('builds one preview panel per excel row', () => {
    const panels = buildExcelPreviewPanels(templateSource);
    expect(panels).toHaveLength(2);
    expect(panels[0]).toMatchObject({
      cuadrante: 'CUADRANTE A-12',
      fechaCorte: '2024-05-15',
      motivo: 'Mantenimiento',
      sourceRowIndex: 0,
      imagenes: [],
    });
    expect(panels[1].fechaCorte).toBe('2024-05-15');
  });

  it('defaults key column to ID and address to DIRECCION', () => {
    expect(resolveDefaultKeyColumn(templateSource)).toBe('ID');
    expect(resolveDefaultAddressColumn(templateSource)).toBe('DIRECCION');
  });

  it('normalizes panel dates', () => {
    expect(normalizePanelDateStr('15/05/2024')).toBe('2024-05-15');
    expect(normalizePanelDateStr('2024-05-15 00:00:00')).toBe('2024-05-15');
  });
});
