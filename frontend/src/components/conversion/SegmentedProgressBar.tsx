const SEGMENT_COUNT = 28;

interface SegmentedProgressBarProps {
  progress: number;
  completed: number;
  total: number;
}

export default function SegmentedProgressBar({ progress, completed, total }: SegmentedProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const filled = Math.round((pct / 100) * SEGMENT_COUNT);

  return (
    <div
      data-testid="conversion-progress-row"
      className="flex min-w-0 max-w-[min(100%,22rem)] items-center gap-2"
    >
      <span className="hidden shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] sm:inline">
        {completed}/{total}
      </span>

      <div className="flex min-w-0 items-center gap-2">
        <div
          className="flex min-w-0 items-end gap-[2px] overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progreso de conversión ${pct}%`}
        >
          {Array.from({ length: SEGMENT_COUNT }, (_, index) => (
            <span
              key={index}
              className={`w-[3px] shrink-0 rounded-[1px] transition-colors duration-200 ${
                index < filled
                  ? 'h-3 bg-[var(--text-secondary)]'
                  : 'h-2.5 bg-[var(--border-medium)] opacity-50'
              }`}
            />
          ))}
        </div>
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-[var(--text-muted)]">
          {pct}%
        </span>
      </div>
    </div>
  );
}
