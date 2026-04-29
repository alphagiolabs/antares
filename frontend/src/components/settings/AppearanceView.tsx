import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { ThemeConfig } from '../../types';
import Button from '../ui/Button';
import Toggle from '../ui/Toggle';
import { useToast } from '../../hooks/useToast';

const ACCENTS = [
  { key: 'orange', color: '#FF6B2C' },
  { key: 'blue', color: '#3B82F6' },
  { key: 'green', color: '#22C55E' },
];

type ThemeMode = 'dark' | 'light' | 'system';

export default function AppearanceView() {
  const { t, i18n } = useTranslation();
  const { addToast } = useToast();
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [presets, setPresets] = useState<string[]>([]);
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [accent, setAccent] = useState('orange');
  const [density, setDensity] = useState('comfortable');
  const [language, setLanguage] = useState(i18n.language || 'es');

  // Sync language state with i18n when it changes externally
  useEffect(() => { setLanguage(i18n.language); }, [i18n.language]);

  const refresh = useCallback(async () => {
    const backendTheme = await api.getTheme();
    setTheme(backendTheme);
    // Extract UI settings from saved theme (defaults if missing)
    setMode((backendTheme?.mode as ThemeMode) || 'dark');
    setAccent(backendTheme?.accent_key || 'orange');
    setDensity(backendTheme?.density || 'comfortable');
    setLanguage(backendTheme?.language || i18n.language || 'es');
    const p = await api.getPresets();
    setPresets(p.presets);
  }, [i18n.language]);

  useEffect(() => { refresh(); }, [refresh]);

  const buildThemePayload = (): Record<string, unknown> => {
    // Start with current theme colors, add UI settings
    const base = theme ? { ...theme } : {};
    return {
      ...base,
      mode,
      accent_key: accent,
      density,
      language,
    };
  };

  const save = async () => {
    const payload = buildThemePayload();
    await api.saveTheme(payload as unknown as ThemeConfig);
    // Apply language immediately
    if (language !== i18n.language) {
      i18n.changeLanguage(language);
    }
    addToast({ message: t('appearance.savedAlert') || 'Tema guardado', type: 'success' });
  };

  const reset = async () => {
    const resetTheme = await api.resetTheme();
    setTheme(resetTheme);
    setMode((resetTheme?.mode as ThemeMode) || 'dark');
    setAccent(resetTheme?.accent_key || 'orange');
    setDensity(resetTheme?.density || 'comfortable');
    setLanguage(resetTheme?.language || 'es');
    if ((resetTheme?.language || 'es') !== i18n.language) {
      i18n.changeLanguage(resetTheme?.language || 'es');
    }
    addToast({ message: t('appearance.resetAlert') || 'Tema restaurado', type: 'success' });
  };

  const applyPreset = async (name: string) => {
    const presetTheme = await api.applyPreset(name);
    setTheme(presetTheme);
    setMode((presetTheme?.mode as ThemeMode) || 'dark');
    setAccent(presetTheme?.accent_key || 'orange');
    setDensity(presetTheme?.density || 'comfortable');
    setLanguage(presetTheme?.language || 'es');
    addToast({ message: `Preset "${name}" aplicado`, type: 'success' });
  };

  const handleLanguageChange = (value: string) => {
    setLanguage(value);
    i18n.changeLanguage(value);
  };

  if (!theme) return (
    <div className="flex items-center justify-center h-full text-[#666666] animate-fade-in">
      {t('appearance.loading') || 'Cargando...'}
    </div>
  );

  const modeOptions: { key: ThemeMode; label: string }[] = [
    { key: 'dark', label: 'Oscuro' },
    { key: 'light', label: 'Claro' },
    { key: 'system', label: 'Sistema' },
  ];

  return (
    <div className="max-w-4xl w-full mx-auto py-8 space-y-8 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-white">{t('appearance.title') || 'Apariencia'}</h2>
        <p className="text-sm text-[#666666] mt-1">Personaliza la apariencia de HidroConvert</p>
      </div>

      {/* Theme mode */}
      <div className="space-y-3">
        <label className="eyebrow">MODO</label>
        <div className="flex bg-[#1A1A1A] rounded-full p-1 w-fit border border-[#222222]">
          {modeOptions.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`px-4 py-1.5 rounded-full text-sm transition-all ${
                mode === m.key
                  ? 'bg-[#FF6B2C] text-white font-medium'
                  : 'text-[#A0A0A0] hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accent color */}
      <div className="space-y-3">
        <label className="eyebrow">COLOR DE ACENTO</label>
        <div className="flex gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAccent(a.key)}
              className={`w-10 h-10 rounded-full border-2 transition-all ${
                accent === a.key ? 'border-white scale-110' : 'border-transparent hover:border-[#444444]'
              }`}
              style={{ backgroundColor: a.color }}
              title={a.key}
            />
          ))}
        </div>
      </div>

      {/* Density */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-white block">Densidad compacta</span>
          <span className="text-xs text-[#666666]">Menos espacio entre elementos</span>
        </div>
        <Toggle checked={density === 'compact'} onChange={(v) => setDensity(v ? 'compact' : 'comfortable')} />
      </div>

      {/* Language */}
      <div className="space-y-3">
        <label className="eyebrow">IDIOMA</label>
        <select
          className="bg-[#1A1A1A] border border-[#222222] rounded-lg px-3 py-2 text-sm text-white appearance-none cursor-pointer focus:border-[#FF6B2C] focus:outline-none"
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value)}
        >
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </div>

      {/* Presets */}
      <div className="space-y-3">
        <label className="eyebrow">PRESETS</label>
        <div className="flex flex-wrap gap-2">
          {presets.map((name) => (
            <button
              key={name}
              onClick={() => applyPreset(name)}
              className="px-4 py-2 rounded-full text-sm bg-[#1A1A1A] text-[#A0A0A0] border border-[#222222] hover:text-white hover:border-[#444444] transition-all"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-[#1A1A1A]">
        <Button variant="primary" onClick={save}>{t('appearance.save') || 'Guardar'}</Button>
        <Button variant="ghost" onClick={reset}>{t('appearance.reset') || 'Restaurar'}</Button>
      </div>
    </div>
  );
}
