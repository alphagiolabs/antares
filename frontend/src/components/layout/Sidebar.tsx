import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'convert', icon: LightningIcon, shortcut: '1' },
  { id: 'db', icon: DatabaseIcon, shortcut: '2' },
  { id: 'history', icon: HistoryIcon, shortcut: '3' },
  { id: 'appearance', icon: PaletteIcon, shortcut: '4' },
];

function LightningIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="13.5" cy="6.5" r=".5" />
      <circle cx="17.5" cy="10.5" r=".5" />
      <circle cx="8.5" cy="7.5" r=".5" />
      <circle cx="6.5" cy="12.5" r=".5" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.01 17.461 2 12 2z" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  return (
    <aside className="w-16 shrink-0 flex flex-col items-center bg-[#0A0A0A] border-r border-[#1A1A1A] py-4">
      <div className="flex flex-col gap-1 flex-1 w-full items-center">
        {tabs.map((t) => {
          const isActive = activeTab === t.id;
          const Icon = t.icon;
          return (
            <div key={t.id} className="relative w-full flex justify-center">
              <button
                onClick={() => onTabChange(t.id)}
                onMouseEnter={() => setHoveredTab(t.id)}
                onMouseLeave={() => setHoveredTab(null)}
                className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 ${
                  isActive ? 'text-white' : 'text-[#555555] hover:text-[#A0A0A0]'
                }`}
              >
                <Icon className={isActive ? 'text-white' : ''} />
                {isActive && (
                  <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-[#FF6B2C]" />
                )}
              </button>
              <AnimatePresence>
                {hoveredTab === t.id && (
                  <motion.div
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.1 }}
                    className="absolute left-14 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap bg-[#1A1A1A] text-white text-xs px-3 py-1.5 rounded-lg border border-[#333333] shadow-lg"
                  >
                    {t.id === 'convert' ? 'Conversión' : t.id === 'db' ? 'Base de Datos' : t.id === 'history' ? 'Historial' : 'Apariencia'}
                    <span className="ml-2 text-[#666666]">Ctrl+{t.shortcut}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <div className="w-full flex flex-col items-center gap-1 pt-4 border-t border-[#1A1A1A]">
        <button className="flex items-center justify-center w-10 h-10 rounded-xl text-[#555555] hover:text-[#A0A0A0] transition-colors">
          <SearchIcon />
        </button>
      </div>
    </aside>
  );
}
