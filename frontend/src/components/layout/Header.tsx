interface HeaderProps {
  title: string;
  onSearchClick: () => void;
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default function Header({ title, onSearchClick }: HeaderProps) {
  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-6 border-b border-[#1A1A1A] bg-[#0A0A0A]/80 backdrop-blur-sm select-none">
      <span className="text-[13px] text-[#A0A0A0] font-medium">{title}</span>
      <button
        onClick={onSearchClick}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1A1A1A] border border-[#222222] text-xs text-[#666666] hover:text-white hover:border-[#444444] transition-all"
      >
        <SearchIcon />
        <span>Buscar</span>
        <span className="text-[10px] bg-[#222222] px-1.5 py-0.5 rounded border border-[#333333]">Ctrl+K</span>
      </button>
    </header>
  );
}
