import { useEffect, useState } from 'react';
import { api } from '../api';
import Button from './ui/Button';
import Badge from './ui/Badge';

interface HistoryRun {
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

export default function HistoryTab() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [selected, setSelected] = useState<HistoryRun | null>(null);

  const refresh = async () => {
    const r = await api.historyList({ limit: 50 });
    setRuns(r.runs);
  };

  useEffect(() => { refresh(); }, []);

  const reexecute = (run: HistoryRun) => {
    window.postMessage({ type: 'HISTORY_REEXECUTE', payload: run }, '*');
  };

  const del = async (id: number) => {
    await api.historyDelete(id);
    await refresh();
    if (selected?.id === id) setSelected(null);
  };

  return (
    <div className="flex flex-col h-full w-full bg-dark-base">
      <div className="px-6 py-4 border-b border-bdr-subtle">
        <h2 className="text-lg font-semibold text-txt-primary">Historial</h2>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* Left — run list (240px) */}
        <div className="w-[240px] shrink-0 border-r border-bdr-subtle overflow-y-auto">
          {runs.length === 0 && (
            <div className="text-sm text-txt-muted text-center py-8">Sin ejecuciones registradas</div>
          )}
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setSelected(run)}
              className={`w-full text-left px-4 py-3 text-sm transition-colors border-l-[3px] ${
                selected?.id === run.id
                  ? 'bg-dark-elevated border-accent text-txt-primary'
                  : 'bg-dark-surface border-transparent hover:bg-dark-elevated text-txt-secondary'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium truncate">{new Date(run.timestamp).toLocaleString()}</span>
                <Badge variant={run.err_count === 0 ? 'success' : 'warning'} className="ml-2">
                  {run.ok_count}/{run.ok_count + run.err_count}
                </Badge>
              </div>
              <div className="text-xs text-txt-muted">
                {run.formato} · {JSON.parse(run.files_json || '[]').length} archivos
              </div>
            </button>
          ))}
        </div>

        {/* Right — detail panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {selected ? (
            <div className="space-y-6 max-w-3xl">
              <div>
                <div className="text-xs uppercase tracking-wider text-txt-muted mb-1">Detalle</div>
                <h3 className="text-xl font-semibold text-txt-primary">Ejecución #{selected.id}</h3>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-dark-surface rounded-lg p-4 border border-bdr-subtle">
                  <div className="text-xs uppercase tracking-wider text-txt-muted mb-2">Formato</div>
                  <div className="font-semibold text-txt-primary">{selected.formato}</div>
                </div>
                <div className="bg-dark-surface rounded-lg p-4 border border-bdr-subtle">
                  <div className="text-xs uppercase tracking-wider text-txt-muted mb-2">Calidad</div>
                  <div className="font-semibold text-txt-primary">{selected.calidad}</div>
                </div>
                <div className="bg-dark-surface rounded-lg p-4 border border-bdr-subtle">
                  <div className="text-xs uppercase tracking-wider text-txt-muted mb-2">Patrón</div>
                  <div className="font-semibold text-txt-primary truncate" title={selected.patron}>{selected.patron || '—'}</div>
                </div>
              </div>
              
              <div className="bg-dark-surface rounded-lg border border-bdr-subtle overflow-hidden">
                <div className="px-4 py-3 border-b border-bdr-subtle">
                  <div className="text-xs uppercase tracking-wider text-txt-muted">Archivos ({JSON.parse(selected.files_json || '[]').length})</div>
                </div>
                <div className="p-2 max-h-64 overflow-y-auto">
                  <div className="space-y-1">
                    {JSON.parse(selected.files_json || '[]').map((f: string, i: number) => (
                      <div key={i} className="text-sm text-txt-secondary truncate px-3 py-2 rounded bg-dark-elevated">
                        {f.split(/[\\/]/).pop()}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 pt-2">
                <Button variant="primary" onClick={() => reexecute(selected)}>Re-ejecutar</Button>
                <Button variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => del(selected.id)}>Eliminar</Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center h-full">
              <div className="w-16 h-16 rounded-full bg-dark-surface flex items-center justify-center mb-4 border border-bdr-subtle">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-txt-muted" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <p className="text-txt-primary font-medium text-lg">Sin selección</p>
              <p className="text-txt-muted text-sm mt-1">Selecciona una ejecución para ver sus detalles</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
