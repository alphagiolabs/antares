interface BrandMarkProps {
  showText?: boolean;
  tagline?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const sizes = {
  sm: {
    mark: 'h-7 w-7',
    word: 'text-[13px]',
    tagline: 'text-[10px]',
  },
  md: {
    mark: 'h-9 w-9',
    word: 'text-[15px]',
    tagline: 'text-[11px]',
  },
};

export default function BrandMark({
  showText = false,
  tagline,
  size = 'sm',
  className = '',
}: BrandMarkProps) {
  const activeSize = sizes[size];

  return (
    <div className={`inline-flex items-center gap-2.5 min-w-0 ${className}`}>
      <svg
        aria-label="COSMO logo"
        role="img"
        viewBox="0 0 40 40"
        className={`${activeSize.mark} shrink-0`}
        fill="none"
      >
        <rect x="1" y="1" width="38" height="38" rx="11" fill="url(#hcMarkBg)" />
        <rect x="1" y="1" width="38" height="38" rx="11" stroke="url(#hcMarkStroke)" strokeWidth="1.5" />
        <path
          d="M10.5 12.5V27.5M10.5 20H18.5M18.5 12.5V27.5"
          stroke="white"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M29.6 13.8C28.3 12.9 26.7 12.4 25 12.4C20.8 12.4 17.4 15.8 17.4 20C17.4 24.2 20.8 27.6 25 27.6C26.8 27.6 28.4 27 29.8 26"
          stroke="#6EE7D8"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        <path
          d="M27.7 10.9L30.4 13.9L26.8 15.1"
          stroke="#6EE7D8"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="hcMarkBg" x1="4" y1="3" x2="36" y2="38" gradientUnits="userSpaceOnUse">
            <stop stopColor="#5E6AD2" />
            <stop offset="0.55" stopColor="#27304E" />
            <stop offset="1" stopColor="#0A0D12" />
          </linearGradient>
          <linearGradient id="hcMarkStroke" x1="3" y1="2" x2="37" y2="38" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8B93FF" />
            <stop offset="1" stopColor="#22C7A9" />
          </linearGradient>
        </defs>
      </svg>

      {showText && (
        <span className="min-w-0 leading-none">
          <span className={`block font-bold tracking-[0] text-white ${activeSize.word}`}>COSMO</span>
          {tagline && <span className={`mt-1 block truncate text-[#7C8494] ${activeSize.tagline}`}>{tagline}</span>}
        </span>
      )}
    </div>
  );
}
