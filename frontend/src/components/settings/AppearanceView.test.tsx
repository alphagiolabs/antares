import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../../i18n';
import AppearanceView from './AppearanceView';
import { ToastProvider } from '../../hooks/useToast';

const baseTheme = {
  name: 'Precision Linear',
  bg: '#0A0D12',
  bg_secondary: '#111522',
  fg: '#FFFFFF',
  fg_muted: '#7C8494',
  fg_secondary: '#555555',
  fg_tertiary: '#565656',
  accent: '#5E6AD2',
  accent_light: '#8B93FF',
  accent_hover: '#4D57BE',
  accent_dark: '#343B8F',
  border: '#27304E',
  blue_hover: '#22C7A9',
  error: '#EB001B',
  warning: '#F79E1B',
  success: '#76b900',
  orange: '#8B93FF',
};

const lightTheme = {
  ...baseTheme,
  name: 'Professional Light',
  bg: '#F6F7FB',
  bg_secondary: '#FFFFFF',
  fg: '#111827',
  fg_muted: '#6B7280',
  accent: '#2563EB',
  accent_light: '#60A5FA',
  accent_hover: '#1D4ED8',
};

function renderAppearance() {
  return render(
    <ToastProvider>
      <AppearanceView />
    </ToastProvider>,
  );
}

describe('AppearanceView', () => {
  it('shows professional appearance style cards and applies a selected style', async () => {
    window.electronAPI = {
      invoke: async (method: string, params?: Record<string, unknown>) => {
        if (method === 'theme_get') return baseTheme;
        if (method === 'theme_presets') return { presets: ['Precision Linear', 'Professional Light'] };
        if (method === 'theme_preset' && params?.name === 'Professional Light') return lightTheme;
        return {};
      },
      onNotify: () => () => {},
      onUpdateAvailable: () => () => {},
      onUpdateDownloaded: () => () => {},
    };

    renderAppearance();

    expect(await screen.findByText('Estilos de apariencia')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Precision Linear/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Professional Light/i }));

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('#F6F7FB');
      expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('#2563EB');
    });
  });
});
