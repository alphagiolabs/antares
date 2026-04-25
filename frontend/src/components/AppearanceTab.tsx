import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { ThemeConfig } from '../types';
import Button from './ui/Button';

export default function AppearanceTab() {
  const { t, i18n } = useTranslation();

  const editableKeys = [
    { label: t('appearance.bg'), key: 'bg' },
    { label: t('appearance.bg_secondary'), key: 'bg_secondary' },
    { label: t('appearance.fg'), key: 'fg' },
    { label: t('appearance.fg_muted'), key: 'fg_muted' },
    { label: t('appearance.accent'), key: 'accent' },
    { label: t('appearance.accent_hover'), key: 'accent_hover' },
    { label: t('appearance.accent_light'), key: 'accent_light' },
    { label: t('appearance.border'), key: 'border' },
    { label: t('appearance.error'), key: 'error' },
    { label: t('appearance.warning'), key: 'warning' },
  ];

  const themeNameKey: Record<string, string> = {
    'Mastercard Cream': 'theme.mastercardCream',
    'NVIDIA Dark': 'theme.nvidiaDark',
    'Professional Light': 'theme.professionalLight',
    'Midnight Blue': 'theme.midnightBlue',
    'Carbon Gray': 'theme.carbonGray',
    'High Contrast': 'theme.highContrast',
  };

  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [presets, setPresets] = useState<string[]>([]);

  function applyThemeToCSS(theme: Record<string, string>) {
    const root = document.documentElement;
    const mapping: Record<string, string> = {
      bg: '--mc-canvas',
      bg_secondary: '--mc-lifted',
      fg: '--mc-ink',
      fg_muted: '--mc-slate',
      fg_secondary: '--mc-granite',
      fg_tertiary: '--mc-graphite',
      accent: '--mc-signal',
      accent_light: '--mc-signalLight',
      accent_hover: '--mc-clay',
      accent_dark: '--mc-clay',
      border: '--mc-dust',
      blue_hover: '--mc-linkBlue',
      error: '--mc-red',
      warning: '--mc-yellow',
      success: '--mc-success',
      orange: '--mc-signalLight',
    };
    for (const [key, cssVar] of Object.entries(mapping)) {
      if (theme[key]) root.style.setProperty(cssVar, theme[key]);
    }
  }

  const refresh = async () => {
    const t = await api.getTheme();
    setTheme(t);
    applyThemeToCSS(t);
    const p = await api.getPresets();
    setPresets(p.presets);
  };

  useEffect(() => { refresh(); }, []);

  const applyPreset = async (name: string) => {
    const t = await api.applyPreset(name);
    setTheme(t);
    applyThemeToCSS(t);
  };

  const save = async () => {
    if (!theme) return;
    await api.saveTheme(theme);
    applyThemeToCSS(theme);
    alert(t('appearance.savedAlert') || 'Tema guardado');
  };

  const reset = async () => {
    const t = await api.resetTheme();
    setTheme(t);
    applyThemeToCSS(t);
  };

  const updateColor = (key: string, value: string) => {
    setTheme((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const themeVal = (key: string) => (theme as Record<string, string>)[key] || '';

  if (!theme) return (
    <div className="flex items-center justify-center h-full text-mc-slate animate-fade-in">
      {t('appearance.loading')}
    </div>
  );

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      <div className="w-[280px] shrink-0 flex flex-col border-r border-mc-dust/20 bg-mc-white">
        <div className="p-5 border-b border-mc-dust/20">
          <div className="mc-eyebrow mb-2">{t('appearance.personalization')}</div>
          <h2 className="text-lg font-medium tracking-tight">{t('appearance.title')}</h2>
        </div>
        <div className="flex-1 p-4 space-y-2 overflow-hidden">
          <div className="text-xs font-bold uppercase tracking-eyebrow text-mc-slate mb-2">{t('appearance.presets')}</div>
          {presets.map((name) => (
            <button
              key={name}
              onClick={() => applyPreset(name)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm font-medium transition-all duration-200 ${
                theme.name === name
                  ? 'bg-mc-ink text-mc-canvas shadow-card'
                  : 'text-mc-ink hover:bg-mc-lifted'
              }`}
            >
              <span
                className="w-4 h-4 rounded-full shrink-0 border border-mc-dust"
                style={{ backgroundColor: themeVal('accent') || '#CF4500' }}
              />
              {themeNameKey[name] ? t(themeNameKey[name]) : name}
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-mc-dust/20">
          <div className="text-xs font-bold uppercase tracking-eyebrow text-mc-slate mb-2">{t('appearance.lang')}</div>
          <select
            className="mc-input w-full"
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="p-4 border-t border-mc-dust/20 space-y-2">
          <Button variant="primary" className="w-full justify-center" onClick={save}>{t('appearance.save')}</Button>
          <Button variant="ghost" className="w-full justify-center" onClick={reset}>{t('appearance.reset')}</Button>
        </div>
      </div>

      {/* Right panel — color editor */}
      <div className="flex-1 flex flex-col min-w-0 bg-mc-canvas p-6 overflow-hidden">
        <div className="mb-5">
          <div className="mc-eyebrow mb-1">{t('appearance.editor')}</div>
          <h3 className="text-lg font-medium">{t('appearance.colors')}</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {editableKeys.map((k) => (
              <div
                key={k.key}
                className="flex items-center gap-3 p-3 rounded-card bg-mc-white border border-mc-dust/30 transition-colors hover:border-mc-dust"
              >
                <span className="text-sm text-mc-ink w-36 font-medium">{k.label}</span>
                <div className="relative w-8 h-8 rounded-full overflow-hidden border border-mc-dust shrink-0">
                  <input
                    type="color"
                    value={themeVal(k.key) || '#000000'}
                    onChange={(e) => updateColor(k.key, e.target.value)}
                    className="absolute -top-2 -left-2 w-14 h-14 p-0 border-0 cursor-pointer"
                  />
                </div>
                <input
                  className="mc-input w-24 font-mono text-xs py-1 px-2"
                  value={themeVal(k.key)}
                  onChange={(e) => updateColor(k.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
