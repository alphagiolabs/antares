import { useEffect, useState } from 'react';
import { api } from '../api';
import { ThemeConfig } from '../types';
import Button from './ui/Button';

const editableKeys = [
  { label: 'Fondo principal', key: 'bg' },
  { label: 'Fondo secundario', key: 'bg_secondary' },
  { label: 'Texto principal', key: 'fg' },
  { label: 'Texto secundario', key: 'fg_muted' },
  { label: 'Color de acento', key: 'accent' },
  { label: 'Acento hover', key: 'accent_hover' },
  { label: 'Acento claro', key: 'accent_light' },
  { label: 'Bordes', key: 'border' },
  { label: 'Error', key: 'error' },
  { label: 'Advertencia', key: 'warning' },
];

export default function AppearanceTab() {
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [presets, setPresets] = useState<string[]>([]);

  const refresh = async () => {
    const t = await api.getTheme();
    setTheme(t);
    const p = await api.getPresets();
    setPresets(p.presets);
  };

  useEffect(() => { refresh(); }, []);

  const applyPreset = async (name: string) => {
    await api.applyPreset(name);
    await refresh();
  };

  const save = async () => {
    if (!theme) return;
    await api.saveTheme(theme);
    alert('Tema guardado');
  };

  const reset = async () => {
    await api.resetTheme();
    await refresh();
  };

  const updateColor = (key: string, value: string) => {
    setTheme((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const themeVal = (key: string) => (theme as Record<string, string>)[key] || '';

  if (!theme) return (
    <div className="flex items-center justify-center h-full text-mc-slate animate-fade-in">
      Cargando...
    </div>
  );

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      <div className="w-[280px] shrink-0 flex flex-col border-r border-mc-dust/20 bg-mc-white">
        <div className="p-5 border-b border-mc-dust/20">
          <div className="mc-eyebrow mb-2">Personalización</div>
          <h2 className="text-lg font-medium tracking-tight">Apariencia</h2>
        </div>
        <div className="flex-1 p-4 space-y-2 overflow-hidden">
          <div className="text-xs font-bold uppercase tracking-eyebrow text-mc-slate mb-2">Presets</div>
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
              {name}
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-mc-dust/20 space-y-2">
          <Button variant="primary" className="w-full justify-center" onClick={save}>Guardar tema</Button>
          <Button variant="ghost" className="w-full justify-center" onClick={reset}>Restaurar default</Button>
        </div>
      </div>

      {/* Right panel — color editor */}
      <div className="flex-1 flex flex-col min-w-0 bg-mc-canvas p-6 overflow-hidden">
        <div className="mb-5">
          <div className="mc-eyebrow mb-1">Editor</div>
          <h3 className="text-lg font-medium">Colores del tema</h3>
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
