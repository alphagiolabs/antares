import { describe, it, expect } from 'vitest';
import { safeThemeValue } from './themeValidate';

describe('safeThemeValue (SEC-016)', () => {
  it('acepta colores válidos para variables conocidas', () => {
    expect(safeThemeValue('--bg-base', '#0A0D12')).toBe('#0A0D12');
    expect(safeThemeValue('--accent-primary', '#f97316')).toBe('#f97316');
    expect(safeThemeValue('--accent-primary-glow', '#f9731633')).toBe('#f9731633');
    expect(safeThemeValue('--text-primary', '#fff')).toBe('#fff');
    expect(safeThemeValue('--bg-surface', 'rgba(0,0,0,0.5)')).toBe('rgba(0,0,0,0.5)');
    expect(safeThemeValue('--bg-surface', 'red')).toBe('red');
  });

  it('acepta longitudes y fuentes válidas', () => {
    expect(safeThemeValue('--app-font-size', '13px')).toBe('13px');
    expect(safeThemeValue('--app-interface-font', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif')).toBe(
      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    );
    expect(safeThemeValue('--app-code-font', 'ui-monospace, Consolas, monospace')).toBe(
      'ui-monospace, Consolas, monospace',
    );
  });

  it('rechaza inyección CSS (url, @import, ;, var)', () => {
    expect(safeThemeValue('--bg-base', 'red; background: url(https://evil.com)')).toBeNull();
    expect(safeThemeValue('--bg-base', 'url(https://evil.com/leak)')).toBeNull();
    expect(safeThemeValue('--bg-base', '@import url(https://evil.com)')).toBeNull();
    expect(safeThemeValue('--bg-base', 'var(--x)')).toBeNull();
    expect(safeThemeValue('--app-interface-font', 'sans-serif; --x: url(evil)')).toBeNull();
    expect(safeThemeValue('--app-interface-font', 'monospace @import url(evil)')).toBeNull();
  });

  it('rechaza variables desconocidas y claves inválidas', () => {
    expect(safeThemeValue('--evil-var', 'red')).toBeNull();
    expect(safeThemeValue('evil', 'red')).toBeNull();
    expect(safeThemeValue('--bg-base', '')).toBeNull();
    expect(safeThemeValue('--bg-base', 'x'.repeat(201))).toBeNull();
    expect(safeThemeValue('--bg-base', 123 as unknown as string)).toBeNull();
  });
});
