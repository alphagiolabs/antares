import { useEffect, useState, useCallback } from 'react';
import { api, onNotify } from '../api';
import { LogEntry, PreviewItem, ProcessStatus } from '../types';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Thumbnail from './Thumbnail';
import ImagePreview from './ImagePreview';

export default function ConversionTab() {
  const [files, setFiles] = useState<string[]>([]);
  const [destino, setDestino] = useState('');
  const [formato, setFormato] = useState('JPEG');
  const [calidad, setCalidad] = useState(95);
  const [resizeAncho, setResizeAncho] = useState('');
  const [resizeAlto, setResizeAlto] = useState('');
  const [keepExif, setKeepExif] = useState(false);
  const [usarRename, setUsarRename] = useState(true);
  const [patron, setPatron] = useState('');
  const [secuencia, setSecuencia] = useState(1);
  const [useFilenameSeq, setUseFilenameSeq] = useState(true);
  const [formats, setFormats] = useState<string[]>([]);
  const [fields, setFields] = useState<string[]>([]);
  const [status, setStatus] = useState<ProcessStatus | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeSection, setActiveSection] = useState<'files' | 'options' | 'rename' | 'output'>('files');

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'HISTORY_REEXECUTE') {
        const run = e.data.payload;
        const files = JSON.parse(run.files_json || '[]');
        const options = JSON.parse(run.options_json || '{}');
        setFiles(files);
        setFormato(options.formato || 'JPEG');
        setCalidad(options.calidad || 95);
        setPatron(run.patron || '');
        if (options.resize) {
          const parts = options.resize.replace(/[()\[\]]/g, '').split(',');
          if (parts.length === 2) {
            setResizeAncho(parts[0].trim());
            setResizeAlto(parts[1].trim());
          }
        }
        setActiveSection('files');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    api.formats().then((r) => setFormats(r.formats));
    api.getFields().then((r) => {
      const names = r.fields.map((f) => f.name);
      setFields(names);
      const defaultPat = names.length >= 1 ? `{${names[0]}}_{seq}{ext}` : `{seq}{ext}`;
      setPatron(defaultPat);
    });
    const iv = setInterval(pollStatus, 1000);
    return () => clearInterval(iv);
  }, []);

  const pollStatus = async () => {
    try {
      const s = await api.getStatus();
      setStatus(s);
      setLogs(s.logs);
      setRunning(s.running);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const unsub = onNotify((method, _params) => {
      if (method === 'process.progress' || method === 'process.complete') pollStatus();
    });
    return unsub;
  }, []);

  const addFiles = async () => {
    const r = await api.dialogFiles();
    if (r.paths.length) setFiles((prev) => Array.from(new Set([...prev, ...r.paths])));
  };

  const addFolder = async () => {
    const r = await api.dialogFolder();
    if (!r.paths.length) return;
    const scanned = await api.scanFolder(r.paths[0]);
    if (scanned.files.length) setFiles((prev) => Array.from(new Set([...prev, ...scanned.files])));
  };

  const selectDest = async () => {
    const r = await api.dialogDest();
    if (r.paths.length) setDestino(r.paths[0]);
  };

  const clearFiles = () => setFiles([]);
  const insertVar = (v: string) => setPatron((p) => p + v);

  const doPreview = async () => {
    if (!files.length) return alert('No hay imágenes cargadas');
    const r = await api.preview({ files, patron, secuencia, use_filename_seq: useFilenameSeq });
    setPreview(r.preview);
  };

  const doProcess = async () => {
    if (!files.length) return alert('Carga imágenes primero');
    if (!destino) return alert('Selecciona carpeta de destino');
    const body = {
      files, destino, formato, calidad,
      resize_ancho: resizeAncho ? parseInt(resizeAncho) : null,
      resize_alto: resizeAlto ? parseInt(resizeAlto) : null,
      keep_exif: keepExif, usar_rename: usarRename, patron, secuencia,
      use_filename_seq: useFilenameSeq,
    };
    await api.startProcess(body);
    setRunning(true);
    pollStatus();
  };

  const doCancel = async () => {
    await api.cancelProcess();
    pollStatus();
  };

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).map((f: any) => f.path || f.name);
    if (dropped.length) setFiles((prev) => Array.from(new Set([...prev, ...dropped])));
  }, []);
  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const presets = [
    ...(fields.length >= 1 ? [{ label: 'Código + Secuencia', value: `{${fields[0]}}_{seq}{ext}` }] : []),
    ...(fields.length >= 2 ? [{ label: 'Código + Nombre', value: `{${fields[0]}}_{${fields[1]}}{ext}` }] : []),
    ...(fields.length >= 1 ? [{ label: 'Solo código', value: `{${fields[0]}}{ext}` }] : []),
    { label: 'Secuencia simple', value: 'img_{seq}{ext}' },
  ];

  const sections = [
    { id: 'files' as const, label: 'Archivos', count: files.length },
    { id: 'options' as const, label: 'Opciones', count: null },
    { id: 'rename' as const, label: 'Renombrado', count: usarRename ? 1 : 0 },
    { id: 'output' as const, label: 'Salida', count: destino ? 1 : 0 },
  ];

  return (
    <div className="flex h-full w-full">
      {/* Left panel — navigation steps */}
      <div className="w-[280px] shrink-0 flex flex-col border-r border-mc-dust/20 bg-mc-white">
        <div className="p-5 border-b border-mc-dust/20">
          <div className="mc-eyebrow mb-2">Proceso</div>
          <h2 className="text-lg font-medium tracking-tight">Configuración</h2>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-btn text-sm font-medium transition-all duration-200 ${
                activeSection === s.id
                  ? 'bg-mc-ink text-mc-canvas shadow-card'
                  : 'text-mc-ink hover:bg-mc-lifted'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                activeSection === s.id ? 'bg-mc-canvas text-mc-ink' : 'bg-mc-lifted text-mc-slate'
              }`}>
                {s.count !== null ? s.count : '—'}
              </span>
              {s.label}
              {activeSection === s.id && (
                <svg className="ml-auto" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </button>
          ))}
        </nav>

        {/* Action panel */}
        <div className="p-4 border-t border-mc-dust/20 space-y-3">
          {status && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-mc-slate font-medium">{running ? 'Procesando...' : 'Listo'}</span>
                <span className="text-mc-ink font-bold">{Math.round(status.progress)}%</span>
              </div>
              <div className="h-1.5 bg-mc-dust/30 rounded-pill overflow-hidden">
                <div className="h-full bg-mc-ink rounded-pill transition-all duration-500" style={{ width: `${status.progress}%` }} />
              </div>
              {status.current_file && (
                <p className="text-[11px] text-mc-slate mt-1 truncate">{status.current_file}</p>
              )}
            </div>
          )}
          {!running ? (
            <Button variant="primary" className="w-full justify-center py-3" onClick={doProcess}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Procesar Lote
            </Button>
          ) : (
            <Button variant="secondary" className="w-full justify-center py-3" onClick={doCancel}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Right panel — content */}
      <div className="flex-1 flex flex-col min-w-0 bg-mc-canvas">
        {activeSection === 'files' && (
          <div className="flex-1 flex flex-col p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="mc-eyebrow mb-1">Entrada</div>
                <h3 className="text-lg font-medium">Archivos de origen</h3>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={addFiles}>Agregar imágenes</Button>
                <Button variant="secondary" onClick={addFolder}>Carpeta</Button>
                {files.length > 0 && <Button variant="ghost" onClick={clearFiles}>Limpiar</Button>}
              </div>
            </div>

            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`flex-1 rounded-card border-2 border-dashed transition-all duration-300 flex flex-col ${
                dragOver ? 'border-mc-linkBlue bg-mc-linkBlue/5' : 'border-mc-dust/40 bg-mc-lifted hover:border-mc-dust hover:bg-mc-white'
              }`}
            >
              {files.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-full bg-mc-white shadow-sm flex items-center justify-center mb-4 border border-mc-dust/30">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#696969" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <p className="text-mc-ink font-medium">Arrastra imágenes aquí</p>
                  <p className="text-mc-slate text-sm mt-1">o usa los botones de arriba</p>
                </div>
              ) : (
                <div className="flex-1 p-2 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-1">
                    {files.map((f, i) => (
                      <div
                        key={f}
                        className={`flex items-center gap-2 px-3 py-2 rounded-btn text-xs transition-colors ${
                          i % 2 === 0 ? 'bg-mc-white' : 'bg-mc-lifted'
                        } ${selectedFile === f ? 'ring-2 ring-mc-signal' : ''}`}
                        onClick={() => setSelectedFile(f)}
                      >
                        <Thumbnail path={f} />
                        <span className="flex-1 truncate pr-2 text-mc-ink font-medium">{f.split('\\').pop()}</span>
                        <button
                          onClick={() => removeFile(i)}
                          className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-mc-slate hover:bg-mc-ink hover:text-white transition-all text-xs"
                          title="Quitar"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedFile && (
              <div className="h-56 shrink-0 border-t border-mc-dust/20 pt-3 mt-3">
                <ImagePreview
                  path={selectedFile}
                  formato={formato}
                  calidad={calidad}
                  resizeAncho={resizeAncho}
                  resizeAlto={resizeAlto}
                />
              </div>
            )}

            <div className="flex items-center justify-between mt-3 shrink-0">
              <Badge variant={files.length ? 'success' : 'default'}>
                {files.length} archivo{files.length !== 1 ? 's' : ''}
              </Badge>
              {files.length > 0 && <span className="text-xs text-mc-slate">Listo para procesar</span>}
            </div>
          </div>
        )}

        {activeSection === 'options' && (
          <div className="flex-1 flex flex-col p-6">
            <div className="mb-5">
              <div className="mc-eyebrow mb-1">Configuración</div>
              <h3 className="text-lg font-medium">Opciones de conversión</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 flex-1">
              <div className="bg-mc-white rounded-card p-5 border border-mc-dust/20">
                <label className="mc-label">Formato de salida</label>
                <select
                  className="mc-input w-full appearance-none cursor-pointer"
                  value={formato}
                  onChange={(e) => setFormato(e.target.value)}
                >
                  {formats.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="bg-mc-white rounded-card p-5 border border-mc-dust/20">
                <label className="mc-label">Calidad (1–100)</label>
                <input
                  type="range" min={1} max={100}
                  className="w-full accent-mc-ink"
                  value={calidad}
                  onChange={(e) => setCalidad(parseInt(e.target.value))}
                />
                <div className="text-center text-sm font-medium text-mc-ink mt-1">{calidad}</div>
              </div>
              <div className="bg-mc-white rounded-card p-5 border border-mc-dust/20">
                <label className="mc-label">Redimensionar (px)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" placeholder="Ancho"
                    className="mc-input w-full"
                    value={resizeAncho}
                    onChange={(e) => setResizeAncho(e.target.value)}
                  />
                  <span className="text-mc-slate font-bold">×</span>
                  <input
                    type="number" placeholder="Alto"
                    className="mc-input w-full"
                    value={resizeAlto}
                    onChange={(e) => setResizeAlto(e.target.value)}
                  />
                </div>
              </div>
              <div className="bg-mc-white rounded-card p-5 border border-mc-dust/20 flex items-center">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className="relative">
                    <input type="checkbox" className="peer sr-only" checked={keepExif} onChange={(e) => setKeepExif(e.target.checked)} />
                    <div className="w-10 h-6 rounded-pill bg-mc-dust peer-checked:bg-mc-ink transition-colors" />
                    <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                  </div>
                  <span className="text-sm text-mc-ink font-medium">Preservar metadatos EXIF</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'rename' && (
          <div className="flex-1 flex flex-col p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="mc-eyebrow mb-1">Renombrado</div>
                <h3 className="text-lg font-medium">Automático con Base de Datos</h3>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-sm font-medium text-mc-slate">{usarRename ? 'Activado' : 'Desactivado'}</span>
                <div className="relative">
                  <input type="checkbox" className="peer sr-only" checked={usarRename} onChange={(e) => setUsarRename(e.target.checked)} />
                  <div className="w-10 h-5 rounded-pill bg-mc-dust peer-checked:bg-mc-ink transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
                </div>
              </label>
            </div>

            {usarRename && (
              <div className="flex-1 space-y-4">
                <div className="bg-mc-white rounded-card p-5 border border-mc-dust/20">
                  <label className="mc-label">Patrón de nombre</label>
                  <div className="flex gap-2">
                    <input
                      className="mc-input flex-1 font-mono text-sm"
                      value={patron}
                      onChange={(e) => setPatron(e.target.value)}
                      placeholder="{codigo}_{nombre}{ext}"
                    />
                    <Button variant="ghost" onClick={() => setPatron('')}>Limpiar</Button>
                  </div>
                </div>

                <div className="bg-mc-white rounded-card p-5 border border-mc-dust/20">
                  <label className="mc-label">Patrones rápidos</label>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => setPatron(p.value)}
                        className="px-4 py-1.5 rounded-pill bg-mc-lifted text-mc-ink text-xs font-medium border border-mc-dust/40 hover:border-mc-ink transition-all"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-mc-white rounded-card p-5 border border-mc-dust/20">
                  <label className="mc-label">Variables disponibles</label>
                  <div className="flex flex-wrap gap-2">
                    {fields.map((f) => (
                      <button key={f} onClick={() => insertVar(`{${f}}`)} className="px-3 py-1 rounded-pill bg-mc-canvas text-mc-ink text-xs font-mono border border-mc-dust/30 hover:border-mc-ink transition-all">
                        {`{${f}}`}
                      </button>
                    ))}
                    <button onClick={() => insertVar('{seq}')} className="px-3 py-1 rounded-pill bg-mc-canvas text-mc-ink text-xs font-mono border border-mc-dust/30 hover:border-mc-ink transition-all">{'{seq}'}</button>
                    <button onClick={() => insertVar('{ext}')} className="px-3 py-1 rounded-pill bg-mc-canvas text-mc-ink text-xs font-mono border border-mc-dust/30 hover:border-mc-ink transition-all">{'{ext}'}</button>
                  </div>
                </div>

                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div className="relative">
                      <input type="checkbox" className="peer sr-only" checked={useFilenameSeq} onChange={(e) => setUseFilenameSeq(e.target.checked)} />
                      <div className="w-9 h-5 rounded-pill bg-mc-dust peer-checked:bg-mc-ink transition-colors" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                    </div>
                    <span className="text-sm text-mc-ink">Secuencia desde archivo</span>
                  </label>
                  {!useFilenameSeq && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-mc-slate font-medium uppercase">Inicial</label>
                      <input type="number" min={1} max={9999} className="mc-input w-24 py-1" value={secuencia} onChange={(e) => setSecuencia(parseInt(e.target.value))} />
                    </div>
                  )}
                  <Button variant="secondary" onClick={doPreview}>Vista previa</Button>
                </div>

                {preview && (
                  <div className="bg-mc-white rounded-card border border-mc-dust/20 overflow-hidden">
                    <div className="px-4 py-2 bg-mc-lifted border-b border-mc-dust/20 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase text-mc-slate">Vista previa</span>
                      <span className="text-xs text-mc-slate">{preview.length} archivos</span>
                    </div>
                    <div className="p-2 space-y-0.5">
                      {preview.map((p, i) => (
                        <div key={i} className={`flex items-center justify-between px-3 py-1.5 rounded-btn text-xs ${i % 2 === 0 ? 'bg-mc-lifted' : 'bg-mc-white'}`}>
                          <span className="text-mc-slate truncate max-w-[40%]">{p.origen}</span>
                          <span className="text-mc-ink font-medium truncate max-w-[40%]">{p.nuevo}</span>
                          <Badge variant={p.en_bd ? 'success' : 'warning'} className="shrink-0">
                            {p.en_bd ? 'En BD' : 'Sin BD'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeSection === 'output' && (
          <div className="flex-1 flex flex-col p-6">
            <div className="mb-5">
              <div className="mc-eyebrow mb-1">Destino</div>
              <h3 className="text-lg font-medium">Carpeta de salida</h3>
            </div>
            <div className="bg-mc-white rounded-card p-5 border border-mc-dust/20 mb-4">
              <div className="flex gap-2">
                <input
                  className="mc-input flex-1 cursor-not-allowed bg-mc-lifted"
                  value={destino}
                  readOnly
                  placeholder="Selecciona carpeta de destino..."
                />
                <Button variant="secondary" onClick={selectDest}>Examinar...</Button>
              </div>
            </div>

            {/* Logs */}
            <div className="flex-1 bg-mc-white rounded-card border border-mc-dust/20 flex flex-col overflow-hidden">
              <div className="px-4 py-2 bg-mc-lifted border-b border-mc-dust/20 flex items-center justify-between shrink-0">
                <span className="text-xs font-bold uppercase text-mc-slate flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-mc-signalLight inline-block" />
                  Registro de actividad
                </span>
                <span className="text-xs text-mc-slate">{logs.length} entradas</span>
              </div>
              <div className="flex-1 p-3 font-mono text-xs space-y-0.5 overflow-y-auto">
                {logs.length === 0 && <div className="text-mc-dust italic">Esperando actividad...</div>}
                {logs.map((l, i) => (
                  <div key={i} className={`px-2 py-1 rounded-sm ${
                    l.tag === 'ok' ? 'text-mc-ink bg-mc-canvas' :
                    l.tag === 'error' ? 'text-mc-signal bg-mc-signal/10' :
                    l.tag === 'warn' ? 'text-mc-signalLight bg-mc-signalLight/10' :
                    'text-mc-slate bg-mc-white'
                  }`}>
                    {l.message}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
