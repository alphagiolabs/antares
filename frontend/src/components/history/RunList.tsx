import React from 'react';
import Badge from '../ui/Badge';

export interface HistoryRun {
  id: number;
  timestamp: string;
  formato: string;
  calidad: number;
  ok_count: number;
  err_count: number;
  patron: string;
  files_json: string;
  options_json: string;
}

interface RunListProps {
  runs: HistoryRun[];
  selected: HistoryRun | null;
  onSelect: (run: HistoryRun) => void;
}

function safeJsonParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

export default function RunList({ runs, selected, onSelect }: RunListProps) {
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="w-12 h-12 rounded-2xl bg-[#1A1A1A] flex items-center justify-center mb-3 border border-[#222222]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#666666]">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <p className="text-sm text-[#666666]">Aún no hay conversiones</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#1A1A1A]/50">
      {runs.map((run) => {
        const fileCount = safeJsonParse<string[]>(run.files_json, []).length;
        const hasErrors = run.err_count > 0;
        const allErrors = run.ok_count === 0 && run.err_count > 0;
        const isSelected = selected?.id === run.id;
        return (
          <button
            key={run.id}
            onClick={() => onSelect(run)}
            className={`w-full text-left px-5 py-4 text-sm transition-all border-l-2 ${
              isSelected
                ? 'bg-[#111111] border-[#FF6B2C]'
                : 'bg-transparent border-transparent hover:bg-[#111111]'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-medium text-[13px] text-white">{new Date(run.timestamp).toLocaleString()}</span>
              <Badge variant={allErrors ? 'error' : hasErrors ? 'warning' : 'success'} className="text-[10px]">
                {run.ok_count}/{run.ok_count + run.err_count}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#666666]">
              <span className="px-1.5 py-0.5 rounded bg-[#1A1A1A] border border-[#222222]">{run.formato}</span>
              <span>{fileCount} archivos</span>
              <span>· {run.calidad}%</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
