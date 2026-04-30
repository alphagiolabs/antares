import Button from '../ui/Button';
import type { HistoryRun } from './RunList';

interface RunDetailProps {
  run: HistoryRun;
  onReexecute: () => void;
  onDelete: () => void;
}

function safeJsonParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

export default function RunDetail({ run, onReexecute, onDelete }: RunDetailProps) {
  const files = safeJsonParse<string[]>(run.files_json, []);

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <div className="eyebrow mb-1">DETALLE</div>
          <h3 className="text-xl font-semibold text-white">Ejecución #{run.id}</h3>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={onReexecute}>Re-ejecutar</Button>
          <Button variant="ghost" size="sm" className="text-[#EF4444] hover:text-[#EF4444]" onClick={onDelete}>Eliminar</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Formato', value: run.formato },
          { label: 'Calidad', value: `${run.calidad}%` },
          { label: 'Correctos', value: run.ok_count, color: 'text-[#22C55E]' },
          { label: 'Errores', value: run.err_count, color: run.err_count > 0 ? 'text-[#EF4444]' : 'text-[#A0A0A0]' },
        ].map((s) => (
          <div key={s.label} className="bg-[#111111] rounded-xl p-4 border border-[#1A1A1A]">
            <div className="eyebrow mb-2">{s.label}</div>
            <div className={`text-lg font-semibold ${s.color || 'text-white'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-[#111111] rounded-xl border border-[#1A1A1A] p-4">
        <div className="eyebrow mb-2">Patrón de renombrado</div>
        <code className="text-sm text-white font-mono bg-[#1A1A1A] px-3 py-2 rounded-lg border border-[#222222] block truncate">
          {run.patron || '—'}
        </code>
      </div>

      <div className="bg-[#111111] rounded-xl border border-[#1A1A1A] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1A1A1A] flex items-center justify-between">
          <span className="eyebrow">Archivos ({files.length})</span>
        </div>
        <div className="p-2 max-h-64 overflow-y-auto">
          <div className="space-y-1">
            {files.map((f, i) => (
              <div key={i} className="text-xs text-[#A0A0A0] truncate px-3 py-2 rounded-lg bg-[#1A1A1A] font-mono">
                {f.split(/[\\/]/).pop()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
