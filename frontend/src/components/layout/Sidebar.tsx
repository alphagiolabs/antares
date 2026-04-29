import { useState } from 'react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSearchClick: () => void;
}

const tabs = [
  { id: 'convert', icon: LightningIcon, label: 'Conversión', shortcut: '1' },
  { id: 'db', icon: DatabaseIcon, label: 'Base de datos', shortcut: '2' },
  { id: 'history', icon: HistoryIcon, label: 'Historial', shortcut: '3' },
  { id: 'appearance', icon: PaletteIcon, label: 'Apariencia', shortcut: '4' },
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

export default function Sidebar({ activeTab, onTabChange, onSearchClick }: SidebarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      className="shrink-0 flex flex-col bg-[#0A0A0A] border-r border-[#1A1A1A] transition-all duration-300 ease-out overflow-hidden"
      style={{ width: expanded ? 224 : 64 }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* App branding — visible when expanded */}
      <div
        className="flex items-center gap-2.5 px-4 shrink-0 overflow-hidden transition-all duration-300"
        style={{ height: expanded ? 52 : 0, opacity: expanded ? 1 : 0, marginTop: expanded ? 12 : 0, marginBottom: expanded ? 8 : 0 }}
      >
        <div className="w-7 h-7 rounded-lg bg-[#FF6B2C] flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <span className="text-[13px] font-bold text-white whitespace-nowrap tracking-tight">HidroConvert</span>
      </div>

      {/* Tabs */}
      <div className="flex flex-col gap-0.5 flex-1 py-2 px-2 min-h-0">
        {tabs.map((t) => {
          const isActive = activeTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              title={!expanded ? t.label : undefined}
              className={`relative flex items-center gap-3 px-2 py-2.5 rounded-xl transition-all duration-200 w-full ${
                isActive
                  ? 'bg-[#1E1E1E] text-white'
                  : 'text-[#555555] hover:text-[#A0A0A0] hover:bg-[#141414]'
              }`}
            >
              <span className={`shrink-0 flex items-center justify-center ${expanded ? '' : 'mx-auto'}`}>
                <Icon className={isActive ? 'text-white' : ''} />
              </span>
              <span
                className="text-[13px] font-medium whitespace-nowrap overflow-hidden transition-all duration-300"
                style={{ width: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
              >
                {t.label}
              </span>
              {expanded && isActive && (
                <span className="absolute right-2 w-1.5 h-1.5 rounded-full bg-[#FF6B2C]" />
              )}
              {!expanded && isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#FF6B2C]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom: Search + shortcuts info */}
      <div className="flex flex-col gap-1 px-2 py-3 border-t border-[#1A1A1A]">
        <button
          onClick={onSearchClick}
          title={!expanded ? 'Buscar' : undefined}
          className="flex items-center gap-3 px-2 py-2.5 rounded-xl text-[#555555] hover:text-[#A0A0A0] hover:bg-[#141414] transition-all duration-200 w-full"
        >
          <span className={`shrink-0 flex items-center justify-center ${expanded ? '' : 'mx-auto'}`}>
            <SearchIcon />
          </span>
          <span
            className="text-[13px] font-medium whitespace-nowrap overflow-hidden transition-all duration-300"
            style={{ width: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
          >
            Buscar
          </span>
          {expanded && (
            <kbd className="ml-auto text-[10px] bg-[#222222] px-1.5 py-0.5 rounded border border-[#333333] text-[#666666] font-mono">
              Ctrl+K
            </kbd>
          )}
        </button>
        {expanded && (
          <div className="px-2 pt-2 flex flex-col gap-0.5">
            <span className="text-[10px] text-[#444444] uppercase tracking-wider font-semibold">Atajos</span>
            {tabs.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-[11px] text-[#555555]">
                <span>{t.label}</span>
                <kbd className="text-[10px] bg-[#1A1A1A] px-1.5 py-0.5 rounded text-[#666666] font-mono">Ctrl+{t.shortcut}</kbd>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
