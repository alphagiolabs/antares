import { useEffect, useState } from 'react';
import { api } from './api';
import ConversionTab from './components/ConversionTab';
import DatabaseTab from './components/DatabaseTab';
import AppearanceTab from './components/AppearanceTab';
import HistoryTab from './components/HistoryTab';

const tabs = [
  { id: 'convert' as const, label: 'Conversión', icon: convertIcon },
  { id: 'db' as const, label: 'Base de Datos', icon: dbIcon },
  { id: 'appearance' as const, label: 'Apariencia', icon: appearanceIcon },
  { id: 'history' as const, label: 'Historial', icon: historyIcon },
];

function convertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function dbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function appearanceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function historyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

type TabId = typeof tabs[number]['id'];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('convert');
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    api.version().then((v) => setVersion(v.version)).catch(() => {});
  }, []);

  return (
    <div className="flex h-screen w-screen bg-mc-canvas text-mc-ink font-mark overflow-hidden">
      {/* Sidebar profesional */}
      <aside className="w-[72px] flex flex-col items-center py-6 bg-mc-white border-r border-mc-dust/20 shrink-0">
        {/* Logo compacto */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex -space-x-1.5">
            <div className="w-5 h-5 rounded-full bg-mc-red opacity-90 mix-blend-multiply" />
            <div className="w-5 h-5 rounded-full bg-mc-yellow opacity-90 mix-blend-multiply" />
          </div>
        </div>

        {/* Nav icons */}
        <nav className="flex flex-col gap-3 flex-1">
          {tabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                title={t.label}
                className={`w-12 h-12 rounded-btn flex items-center justify-center transition-all duration-200 ${
                  isActive
                    ? 'bg-mc-ink text-mc-canvas shadow-card'
                    : 'text-mc-slate hover:bg-mc-lifted hover:text-mc-ink'
                }`}
              >
                {t.icon()}
              </button>
            );
          })}
        </nav>

        {/* Footer sidebar */}
        <div className="text-[10px] text-mc-dust font-medium tracking-wider uppercase mt-auto">
          v{version}
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header compacto */}
        <header className="shrink-0 px-8 py-5 flex items-center justify-between border-b border-mc-dust/20">
          <div>
            <h1 className="text-xl font-medium tracking-display">HidroConvert</h1>
            <p className="text-xs text-mc-slate mt-0.5">Conversor y renombrador profesional de imágenes</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-mc-slate bg-mc-lifted px-3 py-1.5 rounded-pill border border-mc-dust/30">
              {tabs.find(t => t.id === activeTab)?.label}
            </span>
          </div>
        </header>

        {/* Content viewport — sin scrollbars */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'convert' && <ConversionTab />}
          {activeTab === 'db' && <DatabaseTab />}
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'history' && <HistoryTab />}
        </div>
      </main>
    </div>
  );
}

export default App;
