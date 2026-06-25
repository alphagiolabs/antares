import type { ExcelSource, PanelVM } from '../types';

export function normalizePanelDateStr(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}/);
  if (isoMatch) return isoMatch[1];
  const dmyMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}

export function buildExcelPreviewPanels(src: ExcelSource): PanelVM[] {
  const colByNorm = (norm: string): string | null => {
    const idx = src.normalizedColumns.findIndex((n) => n === norm);
    return idx >= 0 ? src.columns[idx] : null;
  };
  const cuadranteCol = colByNorm('cuadrante afectado');
  const fechaCol = colByNorm('fecha de corte');
  const motivoCol = colByNorm('motivo');
  const idCol = colByNorm('id');

  return src.rows.map((row, rowIndex) => ({
    cuadrante: (cuadranteCol && row[cuadranteCol]) || (idCol && row[idCol]) || '',
    fechaCorte: fechaCol ? normalizePanelDateStr(row[fechaCol] ?? '') : '',
    motivo: motivoCol ? (row[motivoCol] ?? '') : '',
    imagenes: [],
    sourceRowIndex: rowIndex,
  }));
}

export function resolveDefaultKeyColumn(src: ExcelSource): string {
  const idIdx = src.normalizedColumns.findIndex((n) => n === 'id');
  return idIdx >= 0 ? src.columns[idIdx] : src.columns[0] ?? '';
}

export function resolveDefaultAddressColumn(src: ExcelSource): string {
  const addrIdx = src.normalizedColumns.findIndex((n) => n === 'direccion');
  return addrIdx >= 0 ? src.columns[addrIdx] : '';
}
