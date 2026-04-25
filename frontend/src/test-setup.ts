import '@testing-library/jest-dom';

// Mock electronAPI for tests
Object.defineProperty(window, 'electronAPI', {
  value: {
    invoke: async (method: string, params?: Record<string, unknown>) => {
      if (method === 'version') return { version: '0.2.0' };
      if (method === 'formats') return { formats: ['JPEG', 'PNG', 'WEBP'] };
      if (method === 'db_records') return { records: [], fields: ['codigo'] };
      if (method === 'db_fields') return { fields: [{ name: 'codigo', type: 'string', required: true, unique: false }] };
      if (method === 'theme_get') return {
        name: 'Mastercard Cream', bg: '#F3F0EE', bg_secondary: '#FCFBFA',
        fg: '#141413', fg_muted: '#696969', accent: '#CF4500',
        accent_light: '#F37338', accent_hover: '#9A3A0A',
        accent_dark: '#9A3A0A', border: '#D1CDC7', blue_hover: '#3860BE',
        error: '#EB001B', warning: '#F79E1B', success: '#76b900', orange: '#F37338'
      };
      if (method === 'theme_presets') return { presets: ['Mastercard Cream'] };
      return {};
    },
    onNotify: () => () => {},
    onUpdateAvailable: () => () => {},
    onUpdateDownloaded: () => () => {},
  },
  writable: true,
});
