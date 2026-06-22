import { describe, expect, it } from 'vitest';
import {
  computeMappingRenderScale,
  formatMappingLoadError,
  isStaleBackendError,
  MAPPING_RENDER_DPR_CAP,
  MAPPING_RENDER_SCALE_CAP,
} from './mappingPdfRender';

describe('mappingPdfRender', () => {
  it('caps render scale at 2.5 without a high minimum', () => {
    expect(computeMappingRenderScale(1200, 595, MAPPING_RENDER_DPR_CAP)).toBe(MAPPING_RENDER_SCALE_CAP);
    expect(computeMappingRenderScale(200, 595, MAPPING_RENDER_DPR_CAP)).toBeCloseTo(0.504, 3);
  });

  it('returns actionable IPC restart message for stale backend methods', () => {
    expect(formatMappingLoadError(new Error('IPC method not allowed: formatos_render_template_page'))).toMatch(
      /reinicia la aplicación.*npm run dev/i,
    );
    expect(formatMappingLoadError(new Error('Método desconocido: formatos_render_template_page'))).toMatch(
      /reinicia la aplicación.*npm run dev/i,
    );
    expect(formatMappingLoadError(new Error('IPC method not allowed: formatos_get_template'))).toMatch(
      /reinicia la aplicación.*npm run dev/i,
    );
  });

  it('detects stale backend errors', () => {
    expect(isStaleBackendError(new Error('IPC method not allowed: formatos_render_template_page'))).toBe(true);
    expect(isStaleBackendError(new Error('Método desconocido: formatos_render_template_page'))).toBe(true);
    expect(isStaleBackendError(new Error('Algo totalmente distinto'))).toBe(false);
  });

  it('preserves timeout message', () => {
    expect(formatMappingLoadError(new Error('Tiempo agotado cargando el template.'))).toBe(
      'Tiempo agotado cargando el template.',
    );
  });
});
