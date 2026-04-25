import { useEffect, useState } from 'react';
import { api } from './api';
import ConversionTab from './components/ConversionTab';
import DatabaseTab from './components/DatabaseTab';
import AppearanceTab from './components/AppearanceTab';
import HistoryTab from './components/HistoryTab';

const tabs = [
  { id: 'convert' as const, label: 'Conversión', icon: '⚡' },
  { id: 'db' as const, label: 'Base de Datos', icon: '🗄️' },
  { id: 'appearance' as const, label: 'Apariencia', icon: '🎨' },
  { id: 'history' as const, label: 'Historial', icon: '📋' },
];

type TabId = typeof tabs[number]['id'];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('convert');
  const [version, setVersion] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; action?: () => void } | null>(null);

  useEffect(() => {
    api.version().then((v) => setVersion(v.version)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateAvailable || !window.electronAPI?.onUpdateDownloaded) return;
    const unsubAvail = window.electronAPI.onUpdateAvailable((info: any) => {
      setToast({
        message: `Nueva versión disponible: ${info.version || 'actualización'}`,
      });
    });
    const unsubDown = window.electronAPI.onUpdateDownloaded((info: any) => {
      setToast({
        message: `Actualización lista: ${info.version || 'actualización'}`,
        action: () => { if (window.electronAPI?.quitAndInstall) window.electronAPI.quitAndInstall(); },
      });
    });
    return () => {
      unsubAvail();
      unsubDown();
    };
  }, []);

  return (
    <div className="flex h-screen w-screen bg-dark-base text-txt-primary font-mark overflow-hidden animate-fade-in">
      {/* Sidebar 240px */}
      <aside className="w-[240px] flex flex-col bg-dark-surface border-r border-bdr-subtle shrink-0">
        {/* Logo + App name */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex -space-x-1.5">
              <div className="w-5 h-5 rounded-full bg-mc-red opacity-90 mix-blend-multiply shadow-sm" />
              <div className="w-5 h-5 rounded-full bg-mc-yellow opacity-90 mix-blend-multiply shadow-sm" />
            </div>
            <span className="text-base font-bold text-txt-primary tracking-tight">HidroConvert</span>
          </div>
          <span className="text-[10px] text-txt-muted font-medium tracking-wider uppercase ml-8">v{version || '0.2.0'}</span>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-bdr-subtle" />

        {/* Nav items */}
        <nav className="flex flex-col gap-1 flex-1 px-3 py-4">
          {tabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-dark-elevated text-txt-primary border-l-[3px] border-accent'
                    : 'text-txt-muted hover:bg-dark-elevated hover:text-txt-secondary border-l-[3px] border-transparent'
                }`}
              >
                <span className="text-base w-6 text-center">{t.icon}</span>
                <span className="flex-1 text-left">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-5 h-px bg-bdr-subtle" />

        {/* Footer */}
        <div className="px-5 py-4 text-[10px] text-txt-muted font-medium tracking-wider uppercase">
          HidroConvert © 2026
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-hidden relative">
          <div key={activeTab} className="h-full w-full animate-fade-in">
            {activeTab === 'convert' && <ConversionTab />}
            {activeTab === 'db' && <DatabaseTab />}
            {activeTab === 'appearance' && <AppearanceTab />}
            {activeTab === 'history' && <HistoryTab />}
          </div>
        </div>
      </main>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-dark-surface border border-bdr-subtle rounded-xl px-5 py-3 shadow-elevated flex items-center gap-3 animate-slide-up z-50">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-sm text-txt-primary">{toast.message}</span>
          {toast.action && (
            <button onClick={toast.action} className="text-sm font-bold text-accent hover:text-accent-hover underline ml-2">
              Instalar
            </button>
          )}
          <button onClick={() => setToast(null)} className="text-txt-muted hover:text-txt-primary ml-2">✕</button>
        </div>
      )}
    </div>
  );
}

export default App;
