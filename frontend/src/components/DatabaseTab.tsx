import { useEffect, useState } from 'react';
import { api } from '../api';
import { DBField, DBRecord } from '../types';
import Button from './ui/Button';
import Badge from './ui/Badge';

export default function DatabaseTab() {
  const [records, setRecords] = useState<DBRecord[]>([]);
  const [fields, setFields] = useState<string[]>([]);
  const [allFields, setAllFields] = useState<DBField[]>([]);
  const [newField, setNewField] = useState({ name: '', type: 'TEXT', required: false, unique: false });
  const [activeSection, setActiveSection] = useState<'records' | 'schema'>('records');

  const refresh = async () => {
    const r = await api.getRecords();
    setRecords(r.records);
    setFields(r.fields);
    const f = await api.getFields();
    setAllFields(f.fields);
  };

  useEffect(() => { refresh(); }, []);

  const importExcel = async () => {
    const d = await api.dialogFiles();
    if (!d.paths.length) return;
    await api.importExcel(d.paths[0]);
    await refresh();
  };

  const exportExcel = async () => {
    const d = await api.dialogSave();
    if (!d.paths.length) return;
    await api.exportExcel(d.paths[0]);
  };

  const template = async () => {
    const d = await api.dialogSave();
    if (!d.paths.length) return;
    await api.generateTemplate(d.paths[0]);
  };

  const addField = async () => {
    const name = newField.name.trim().toLowerCase();
    if (!name || !name.replace('_', '').match(/^[a-z0-9]+$/)) { alert('Nombre inválido'); return; }
    const updated = [...allFields, { ...newField, name }];
    await api.updateFields(updated);
    setNewField({ name: '', type: 'TEXT', required: false, unique: false });
    await refresh();
  };

  const removeField = async (name: string) => {
    if (allFields.length <= 1) return alert('Debe quedar al menos un campo');
    if (!confirm(`¿Eliminar campo '${name}'?`)) return;
    const updated = allFields.filter((f) => f.name !== name);
    await api.updateFields(updated);
    await refresh();
  };

  const resetFields = async () => {
    if (!confirm('¿Restaurar campos por defecto?')) return;
    await api.resetFields();
    await refresh();
  };

  return (
    <div className="flex h-full w-full">
      {/* Sidebar izquierdo */}
      <div className="w-[280px] shrink-0 flex flex-col border-r border-mc-dust/20 bg-mc-white">
        <div className="p-5 border-b border-mc-dust/20">
          <div className="mc-eyebrow mb-2">Base de Datos</div>
          <h2 className="text-lg font-medium tracking-tight">Gestión</h2>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <button
            onClick={() => setActiveSection('records')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-btn text-sm font-medium transition-all duration-200 ${
              activeSection === 'records' ? 'bg-mc-ink text-mc-canvas shadow-card' : 'text-mc-ink hover:bg-mc-lifted'
            }`}
          >
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${activeSection === 'records' ? 'bg-mc-canvas text-mc-ink' : 'bg-mc-lifted text-mc-slate'}`}>
              {records.length}
            </span>
            Registros
          </button>
          <button
            onClick={() => setActiveSection('schema')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-btn text-sm font-medium transition-all duration-200 ${
              activeSection === 'schema' ? 'bg-mc-ink text-mc-canvas shadow-card' : 'text-mc-ink hover:bg-mc-lifted'
            }`}
          >
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${activeSection === 'schema' ? 'bg-mc-canvas text-mc-ink' : 'bg-mc-lifted text-mc-slate'}`}>
              {allFields.length}
            </span>
            Esquema
          </button>
        </nav>

        <div className="p-4 border-t border-mc-dust/20 space-y-2">
          <Button variant="secondary" className="w-full justify-center" onClick={importExcel}>Importar Excel</Button>
          <Button variant="secondary" className="w-full justify-center" onClick={exportExcel}>Exportar Excel</Button>
          <Button variant="ghost" className="w-full justify-center" onClick={template}>Plantilla</Button>
          <Button variant="ghost" className="w-full justify-center" onClick={refresh}>Refrescar</Button>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-mc-canvas p-6">
        {activeSection === 'records' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="mc-eyebrow mb-1">Registros</div>
                <h3 className="text-lg font-medium">{records.length} registros en base de datos</h3>
              </div>
            </div>

            <div className="flex-1 bg-mc-white rounded-card border border-mc-dust/20 flex flex-col overflow-hidden">
              {records.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-full bg-mc-canvas flex items-center justify-center mb-4 border border-mc-dust/30">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D1CDC7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <p className="text-mc-ink font-medium">Sin registros</p>
                  <p className="text-mc-slate text-sm mt-1">Importa un archivo Excel para comenzar</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  <div className="px-4 py-2.5 bg-mc-lifted border-b border-mc-dust/20 flex items-center gap-2 shrink-0">
                    {fields.map((f) => (
                      <span key={f} className="text-[11px] font-bold uppercase tracking-eyebrow text-mc-slate flex-1 min-w-0 truncate">{f}</span>
                    ))}
                  </div>
                  <div className="flex-1 p-2 overflow-y-auto">
                    <div className="grid gap-1">
                      {records.map((r, i) => (
                        <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-btn text-xs ${i % 2 === 0 ? 'bg-mc-lifted' : 'bg-mc-white'}`}>
                          {fields.map((f) => (
                            <span key={f} className="flex-1 min-w-0 truncate text-mc-ink">{String(r[f] ?? '')}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'schema' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="mc-eyebrow mb-1">Esquema</div>
                <h3 className="text-lg font-medium">Configurar campos</h3>
              </div>
              <Button variant="ghost" onClick={resetFields}>Restaurar defaults</Button>
            </div>

            {/* New field form */}
            <div className="bg-mc-white rounded-card border border-mc-dust/20 p-4 mb-4 flex items-end gap-3 shrink-0">
              <div className="flex-1">
                <label className="mc-label text-[11px]">Nombre</label>
                <input className="mc-input w-full py-1.5" value={newField.name} onChange={(e) => setNewField({ ...newField, name: e.target.value })} placeholder="nombre_campo" />
              </div>
              <div className="w-32">
                <label className="mc-label text-[11px]">Tipo</label>
                <select className="mc-input w-full py-1.5" value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value })}>
                  <option>TEXT</option><option>INTEGER</option><option>REAL</option><option>BLOB</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none pb-2">
                <input type="checkbox" className="accent-mc-ink" checked={newField.required} onChange={(e) => setNewField({ ...newField, required: e.target.checked })} />
                Requerido
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none pb-2">
                <input type="checkbox" className="accent-mc-ink" checked={newField.unique} onChange={(e) => setNewField({ ...newField, unique: e.target.checked })} />
                Único
              </label>
              <Button variant="primary" className="py-1.5" onClick={addField}>Agregar</Button>
            </div>

            {/* Fields list */}
            <div className="flex-1 bg-mc-white rounded-card border border-mc-dust/20 flex flex-col overflow-hidden">
              <div className="px-4 py-2.5 bg-mc-lifted border-b border-mc-dust/20 flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-eyebrow text-mc-slate flex-1">Campo</span>
                <span className="text-[11px] font-bold uppercase tracking-eyebrow text-mc-slate w-20">Tipo</span>
                <span className="text-[11px] font-bold uppercase tracking-eyebrow text-mc-slate w-20 text-center">Requerido</span>
                <span className="text-[11px] font-bold uppercase tracking-eyebrow text-mc-slate w-20 text-center">Único</span>
                <span className="text-[11px] font-bold uppercase tracking-eyebrow text-mc-slate w-16 text-center">—</span>
              </div>
              <div className="flex-1 p-2">
                <div className="space-y-1">
                  {allFields.map((f, i) => (
                    <div key={f.name} className={`flex items-center gap-2 px-3 py-2 rounded-btn text-xs ${i % 2 === 0 ? 'bg-mc-lifted' : 'bg-mc-white'}`}>
                      <span className="flex-1 text-mc-ink font-medium">{f.name}</span>
                      <span className="w-20 text-mc-slate font-mono">{f.type}</span>
                      <span className="w-20 text-center"><Badge variant={f.required ? 'success' : 'default'} className="text-[10px] px-2 py-0.5">{f.required ? 'Sí' : 'No'}</Badge></span>
                      <span className="w-20 text-center"><Badge variant={f.unique ? 'success' : 'default'} className="text-[10px] px-2 py-0.5">{f.unique ? 'Sí' : 'No'}</Badge></span>
                      <span className="w-16 text-center">
                        <button className="text-mc-slate hover:text-mc-signal text-xs font-medium" onClick={() => removeField(f.name)}>Eliminar</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
