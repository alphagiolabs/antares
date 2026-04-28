import { useState } from 'react';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import ConversionView from './components/conversion/ConversionView';
import DatabaseView from './components/database/DatabaseView';
import HistoryView from './components/history/HistoryView';
import AppearanceView from './components/settings/AppearanceView';
import { ToastProvider } from './hooks/useToast';
import { DialogProvider } from './hooks/useDialog';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import ToastContainer from './components/ui/Toast';
import Dialog from './components/ui/Dialog';
import CommandPalette from './components/ui/CommandPalette';

const tabTitles: Record<string, string> = {
  convert: 'Conversión',
  db: 'Base de Datos',
  history: 'Historial',
  appearance: 'Apariencia',
};

type TabId = 'convert' | 'db' | 'history' | 'appearance';

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>('convert');
  const [commandOpen, setCommandOpen] = useState(false);

  useKeyboardShortcut('k', () => setCommandOpen(true), { ctrl: true, preventDefault: true });
  useKeyboardShortcut('1', () => setActiveTab('convert'), { ctrl: true, preventDefault: true });
  useKeyboardShortcut('2', () => setActiveTab('db'), { ctrl: true, preventDefault: true });
  useKeyboardShortcut('3', () => setActiveTab('history'), { ctrl: true, preventDefault: true });
  useKeyboardShortcut('4', () => setActiveTab('appearance'), { ctrl: true, preventDefault: true });

  const commandItems = [
    { id: 'tab-convert', label: 'Ir a Conversión', shortcut: 'Ctrl+1', action: () => setActiveTab('convert') },
    { id: 'tab-db', label: 'Ir a Base de Datos', shortcut: 'Ctrl+2', action: () => setActiveTab('db') },
    { id: 'tab-history', label: 'Ir a Historial', shortcut: 'Ctrl+3', action: () => setActiveTab('history') },
    { id: 'tab-appearance', label: 'Ir a Apariencia', shortcut: 'Ctrl+4', action: () => setActiveTab('appearance') },
  ];

  return (
    <div className="flex h-screen w-screen bg-[#0A0A0A] text-white overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={(t) => setActiveTab(t as TabId)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={tabTitles[activeTab]} onSearchClick={() => setCommandOpen(true)} />
        <main className="flex-1 overflow-hidden relative">
          <div className="h-full overflow-y-auto">
            <div className="max-w-[900px] mx-auto px-6 pt-8 pb-32">
              {activeTab === 'convert' && <ConversionView />}
              {activeTab === 'db' && <DatabaseView />}
              {activeTab === 'history' && <HistoryView />}
              {activeTab === 'appearance' && <AppearanceView />}
            </div>
          </div>
        </main>
      </div>
      <CommandPalette isOpen={commandOpen} onClose={() => setCommandOpen(false)} items={commandItems} />
      <Dialog />
      <ToastContainer />
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <DialogProvider>
        <AppContent />
      </DialogProvider>
    </ToastProvider>
  );
}

export default App;
