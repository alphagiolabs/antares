import { useEffect, useState } from 'react';
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

export default function AppearanceView() {
  const { t, i18n } = useTranslation();
  const { addToast } = useToast();
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [presets, setPresets] = useState<string[]>([]);
  const [accent, setAccent] = useState('orange');
  const [density, setDensity] = useState('comfortable');

  const refresh = async () => {
    const t = await api.getTheme();
    setTheme(t);
    const p = await api.getPresets();
    setPresets(p.presets);
  };

  useEffect(() => { refresh(); }, []);

  const save = async () => {
    if (!theme) return;
    await api.saveTheme(theme);
    addToast({ message: t('appearance.savedAlert') || 'Tema guardado', type: 'success' });
  };

  const reset = async () => {
    const t = await api.resetTheme();
    setTheme(t);
  };

  if (!theme) return (
    <div className="flex items-center justify-center h-full text-[#666666] animate-fade-in">
      {t('appearance.loading')}
    </div>
  );

  return (
    <div className="max-w-4xl w-full mx-auto py-8 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white">{t('appearance.title')}</h2>
        <p className="text-sm text-[#666666] mt-1">Personaliza la apariencia de HidroConvert</p>
      </div>

      {/* Theme mode */}
      <div className="space-y-3">
        <label className="eyebrow">MODO</label>
        <div className="flex bg-[#1A1A1A] rounded-full p-1 w-fit border border-[#222222]">
          {['Oscuro', 'Claro', 'Sistema'].map((m) => (
            <button key={m} className="px-4 py-1.5 rounded-full text-sm text-[#A0A0A0] hover:text-white transition-colors">
              {m}
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
          value={i18n.language}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
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
              className="px-4 py-2 rounded-full text-sm bg-[#1A1A1A] text-[#A0A0A0] border border-[#222222] hover:text-white hover:border-[#444444] transition-all"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-[#1A1A1A]">
        <Button variant="primary" onClick={save}>{t('appearance.save')}</Button>
        <Button variant="ghost" onClick={reset}>{t('appearance.reset')}</Button>
      </div>
    </div>
  );
}
