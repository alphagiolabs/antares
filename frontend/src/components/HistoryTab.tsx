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
    <div className="flex h-full w-full">
      {/* Left sidebar — list of runs */}
      <div className="w-[320px] shrink-0 flex flex-col border-r border-mc-dust/20 bg-mc-white">
        <div className="p-5 border-b border-mc-dust/20">
          <div className="mc-eyebrow mb-2">Registro</div>
          <h2 className="text-lg font-medium tracking-tight">Historial</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {runs.length === 0 && (
            <div className="text-sm text-mc-slate text-center py-8">Sin ejecuciones registradas</div>
          )}
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setSelected(run)}
              className={`w-full text-left px-4 py-3 rounded-btn text-sm transition-all ${
                selected?.id === run.id ? 'bg-mc-ink text-mc-canvas shadow-card' : 'hover:bg-mc-lifted'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{new Date(run.timestamp).toLocaleString()}</span>
                <Badge variant={run.err_count === 0 ? 'success' : 'warning'} className="text-[10px]">
                  {run.ok_count}/{run.ok_count + run.err_count}
                </Badge>
              </div>
              <div className="text-xs opacity-70 mt-1">{run.formato} · {JSON.parse(run.files_json || '[]').length} archivos</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel — detail */}
      <div className="flex-1 flex flex-col p-6 bg-mc-canvas overflow-y-auto">
        {selected ? (
          <div className="space-y-4">
            <div>
              <div className="mc-eyebrow mb-1">Detalle</div>
              <h3 className="text-lg font-medium">Ejecución #{selected.id}</h3>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-mc-white rounded-card p-3 border border-mc-dust/20">
                <div className="text-mc-slate text-xs uppercase">Formato</div>
                <div className="font-medium">{selected.formato}</div>
              </div>
              <div className="bg-mc-white rounded-card p-3 border border-mc-dust/20">
                <div className="text-mc-slate text-xs uppercase">Calidad</div>
                <div className="font-medium">{selected.calidad}</div>
              </div>
              <div className="bg-mc-white rounded-card p-3 border border-mc-dust/20">
                <div className="text-mc-slate text-xs uppercase">Patrón</div>
                <div className="font-medium truncate">{selected.patron || '—'}</div>
              </div>
            </div>
            <div className="bg-mc-white rounded-card border border-mc-dust/20 p-3">
              <div className="text-xs font-bold uppercase tracking-eyebrow text-mc-slate mb-2">Archivos</div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {JSON.parse(selected.files_json || '[]').map((f: string, i: number) => (
                  <div key={i} className="text-xs text-mc-ink truncate">{f.split(/[\\/]/).pop()}</div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => reexecute(selected)}>Re-ejecutar</Button>
              <Button variant="ghost" onClick={() => del(selected.id)}>Eliminar</Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-mc-slate">
            Selecciona una ejecución para ver detalles
          </div>
        )}
      </div>
    </div>
  );
}
