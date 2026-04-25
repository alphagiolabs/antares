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
    <div className="flex flex-col h-full w-full bg-dark-base">
      {/* Top tab bar with action buttons */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-bdr-subtle bg-dark-surface shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSection('records')}
            className={`px-4 py-2 rounded-btn text-sm font-semibold transition-all duration-200 ${
              activeSection === 'records'
                ? 'bg-accent text-white'
                : 'bg-dark-elevated text-txt-secondary hover:text-txt-primary'
            }`}
          >
            Registros
          </button>
          <button
            onClick={() => setActiveSection('schema')}
            className={`px-4 py-2 rounded-btn text-sm font-semibold transition-all duration-200 ${
              activeSection === 'schema'
                ? 'bg-accent text-white'
                : 'bg-dark-elevated text-txt-secondary hover:text-txt-primary'
            }`}
          >
            Esquema
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" className="text-txt-secondary hover:text-txt-primary" onClick={refresh}>Refrescar</Button>
          <Button variant="ghost" className="text-txt-secondary hover:text-txt-primary" onClick={template}>Plantilla</Button>
          <Button variant="secondary" onClick={importExcel}>Importar</Button>
          <Button variant="secondary" onClick={exportExcel}>Exportar</Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden">
        {activeSection === 'records' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-txt-muted text-xs uppercase tracking-wider mb-1">Visor de datos</p>
                <h3 className="text-xl font-semibold text-txt-primary">{records.length} registros en base de datos</h3>
              </div>
            </div>

            <div className="flex-1 bg-dark-surface rounded-lg border border-bdr-subtle flex flex-col overflow-hidden">
              {records.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-dark-elevated flex items-center justify-center mb-4">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-txt-muted" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <p className="text-txt-primary font-semibold text-lg">Sin registros</p>
                  <p className="text-txt-muted text-sm mt-1">Importa un archivo Excel para comenzar</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  <div className="px-4 py-2.5 bg-dark-elevated border-b border-bdr-subtle flex items-center gap-3 shrink-0">
                    {fields.map((f) => (
                      <span key={f} className="text-[11px] font-bold uppercase tracking-wider text-txt-muted flex-1 min-w-0 truncate">{f}</span>
                    ))}
                  </div>
                  <div className="flex-1 p-2 overflow-y-auto">
                    <div className="grid gap-1">
                      {records.map((r, i) => (
                        <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] transition-colors border ${i % 2 === 0 ? 'bg-dark-elevated/50 border-bdr-subtle/50' : 'bg-transparent border-transparent hover:border-bdr-subtle/50 hover:bg-dark-elevated/30'}`}>
                          {fields.map((f) => (
                            <span key={f} className="flex-1 min-w-0 truncate text-txt-secondary">{String(r[f] ?? '')}</span>
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
                <p className="text-txt-muted text-xs uppercase tracking-wider mb-1">Esquema</p>
                <h3 className="text-xl font-semibold text-txt-primary">Configurar campos</h3>
              </div>
              <Button variant="ghost" className="text-txt-secondary hover:text-txt-primary border border-bdr-subtle" onClick={resetFields}>Restaurar defaults</Button>
            </div>

            {/* New field form */}
            <div className="bg-dark-surface rounded-lg border border-bdr-subtle p-4 mb-4 flex items-end gap-4 shrink-0">
              <div className="flex-1">
                <label className="block text-xs font-medium text-txt-secondary mb-1.5">Nombre del campo</label>
                <input className="w-full bg-dark-input border border-bdr-medium rounded-btn px-3 py-2 text-sm text-txt-primary placeholder-txt-muted focus:outline-none focus:border-accent" value={newField.name} onChange={(e) => setNewField({ ...newField, name: e.target.value })} placeholder="ej. sku_producto" />
              </div>
              <div className="w-36">
                <label className="block text-xs font-medium text-txt-secondary mb-1.5">Tipo de dato</label>
                <select className="w-full bg-dark-input border border-bdr-medium rounded-btn px-3 py-2 text-sm text-txt-primary appearance-none cursor-pointer focus:outline-none focus:border-accent" value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value })}>
                  <option className="bg-dark-input">TEXT</option>
                  <option className="bg-dark-input">INTEGER</option>
                  <option className="bg-dark-input">REAL</option>
                  <option className="bg-dark-input">BLOB</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-txt-secondary cursor-pointer select-none pb-2">
                <input type="checkbox" className="w-4 h-4 rounded border-bdr-medium bg-dark-input accent-accent" checked={newField.required} onChange={(e) => setNewField({ ...newField, required: e.target.checked })} />
                Requerido
              </label>
              <label className="flex items-center gap-2 text-sm text-txt-secondary cursor-pointer select-none pb-2">
                <input type="checkbox" className="w-4 h-4 rounded border-bdr-medium bg-dark-input accent-accent" checked={newField.unique} onChange={(e) => setNewField({ ...newField, unique: e.target.checked })} />
                Único
              </label>
              <Button variant="primary" className="mb-0.5" onClick={addField}>Agregar Campo</Button>
            </div>

            {/* Fields list */}
            <div className="flex-1 bg-dark-surface rounded-lg border border-bdr-subtle flex flex-col overflow-hidden">
              <div className="px-4 py-2.5 bg-dark-elevated border-b border-bdr-subtle flex items-center gap-3 shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-txt-muted flex-1">Campo</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-txt-muted w-28">Tipo</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-txt-muted w-24 text-center">Requerido</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-txt-muted w-24 text-center">Único</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-txt-muted w-20 text-center">Acción</span>
              </div>
              <div className="flex-1 p-2 overflow-y-auto">
                <div className="space-y-1">
                  {allFields.map((f, i) => (
                    <div key={f.name} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-[14px] transition-colors border ${i % 2 === 0 ? 'bg-dark-elevated/50 border-bdr-subtle/50' : 'bg-transparent border-transparent hover:border-bdr-subtle/50 hover:bg-dark-elevated/30'}`}>
                      <span className="flex-1 text-txt-primary font-medium">{f.name}</span>
                      <span className="w-28 text-txt-muted font-mono bg-dark-input px-2 py-1 rounded text-xs text-center">{f.type}</span>
                      <span className="w-24 flex justify-center"><Badge variant={f.required ? 'success' : 'default'}>{f.required ? 'Sí' : 'No'}</Badge></span>
                      <span className="w-24 flex justify-center"><Badge variant={f.unique ? 'success' : 'default'}>{f.unique ? 'Sí' : 'No'}</Badge></span>
                      <span className="w-20 flex justify-center">
                        <button className="text-txt-muted hover:text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" onClick={() => removeField(f.name)}>Eliminar</button>
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
