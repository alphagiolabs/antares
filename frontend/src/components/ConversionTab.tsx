import { useEffect, useState, useCallback } from 'react';
import { api, onNotify } from '../api';
import { LogEntry, PreviewItem, ProcessStatus } from '../types';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Thumbnail from './Thumbnail';
import ImagePreview from './ImagePreview';

const STEPS = [
  { id: 'files' as const, label: 'Archivos' },
  { id: 'options' as const, label: 'Opciones' },
  { id: 'rename' as const, label: 'Renombrado' },
  { id: 'output' as const, label: 'Salida' },
];

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
  const [activeStep, setActiveStep] = useState<'files' | 'options' | 'rename' | 'output'>('files');

  const stepIndex = STEPS.findIndex((s) => s.id === activeStep);

  const goNext = () => {
    if (stepIndex < STEPS.length - 1) setActiveStep(STEPS[stepIndex + 1].id);
  };
  const goPrev = () => {
    if (stepIndex > 0) setActiveStep(STEPS[stepIndex - 1].id);
  };

  const getStepStatus = (idx: number) => {
    if (idx < stepIndex) return 'completed' as const;
    if (idx === stepIndex) return 'active' as const;
    return 'pending' as const;
  };

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
        setActiveStep('files');
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

  return (
    <div className="flex flex-col h-full w-full bg-dark-base">
      {/* Stepper */}
      <div className="shrink-0 px-8 pt-8 pb-4">
        <div className="flex items-center justify-center gap-0">
          {STEPS.map((step, idx) => {
            const st = getStepStatus(idx);
            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => setActiveStep(step.id)}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                      st === 'active'
                        ? 'bg-accent text-white shadow-glow'
                        : st === 'completed'
                        ? 'bg-accent-green text-white'
                        : 'bg-dark-elevated text-txt-muted border border-bdr-medium'
                    }`}
                  >
                    {st === 'completed' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span
                    className={`text-xs font-semibold transition-colors ${
                      st === 'active'
                        ? 'text-accent'
                        : st === 'completed'
                        ? 'text-accent-green'
                        : 'text-txt-muted'
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-12 h-0.5 mx-2 mb-6 transition-colors ${
                      idx < stepIndex ? 'bg-accent-green' : 'bg-bdr-medium'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 px-8 animate-fade-in" key={activeStep}>
        {activeStep === 'files' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-txt-primary">Archivos de origen</h3>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={addFiles}>Imágenes</Button>
                <Button variant="secondary" onClick={addFolder}>Carpeta</Button>
                {files.length > 0 && <Button variant="ghost" onClick={clearFiles}>Limpiar</Button>}
              </div>
            </div>

            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`flex-1 rounded-card border-2 border-dashed transition-all duration-300 flex flex-col overflow-hidden ${
                dragOver
                  ? 'border-accent bg-accent/5 shadow-glow scale-[1.01]'
                  : 'border-bdr-medium bg-dark-surface hover:border-bdr-active'
              }`}
            >
              {files.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 rounded-full bg-dark-elevated flex items-center justify-center mb-6 border border-bdr-medium">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-txt-muted">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <p className="text-txt-primary font-semibold text-xl">Arrastra imágenes aquí</p>
                  <p className="text-txt-secondary text-sm mt-2">Formatos soportados: JPG, PNG, WEBP, TIFF</p>
                </div>
              ) : (
                <div className="flex-1 p-4 overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {files.map((f, i) => (
                      <div
                        key={f}
                        className={`group flex items-center gap-3 px-3 py-3 rounded-card text-xs transition-all duration-200 cursor-pointer border ${
                          selectedFile === f
                            ? 'bg-accent/10 border-accent shadow-glow'
                            : 'bg-dark-elevated border-bdr-subtle hover:border-bdr-medium'
                        }`}
                        onClick={() => setSelectedFile(f)}
                      >
                        <div className="rounded-sm overflow-hidden border border-bdr-subtle">
                          <Thumbnail path={f} size={44} />
                        </div>
                        <span className="flex-1 truncate pr-1 text-txt-primary font-medium text-[13px]">{f.split('\\').pop()}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-txt-muted hover:bg-accent-red hover:text-white transition-all duration-200 opacity-0 group-hover:opacity-100"
                          title="Quitar"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedFile && (
              <div className="h-64 shrink-0 border border-bdr-subtle bg-dark-surface rounded-card p-4 mt-4">
                <ImagePreview
                  path={selectedFile}
                  formato={formato}
                  calidad={calidad}
                  resizeAncho={resizeAncho}
                  resizeAlto={resizeAlto}
                />
              </div>
            )}

            <div className="flex items-center justify-between mt-4 shrink-0 px-2">
              <Badge variant={files.length ? 'success' : 'default'}>
                {files.length} archivo{files.length !== 1 ? 's' : ''} cargados
              </Badge>
              {files.length > 0 && <span className="text-sm font-medium text-txt-secondary">Listo para configurar</span>}
            </div>
          </div>
        )}

        {activeStep === 'options' && (
          <div className="flex flex-col h-full">
            <h3 className="text-xl font-semibold text-txt-primary mb-4">Opciones de conversión</h3>
            <div className="grid grid-cols-2 gap-5 flex-1">
              <div className="bg-dark-surface border border-bdr-subtle rounded-card p-5 flex flex-col justify-center">
                <label className="text-xs font-bold uppercase tracking-wider text-txt-muted mb-2">Formato de salida</label>
                <select
                  className="w-full appearance-none cursor-pointer text-lg py-3 font-medium bg-dark-input border border-bdr-medium rounded-sm px-3 text-txt-primary focus:border-accent focus:outline-none"
                  value={formato}
                  onChange={(e) => setFormato(e.target.value)}
                >
                  {formats.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="bg-dark-surface border border-bdr-subtle rounded-card p-5 flex flex-col justify-center">
                <label className="text-xs font-bold uppercase tracking-wider text-txt-muted mb-2 flex justify-between">
                  Calidad
                  <span className="text-accent font-bold">{calidad}%</span>
                </label>
                <div className="pt-2">
                  <input
                    type="range" min={1} max={100}
                    className="w-full accent-accent h-2 bg-dark-input rounded-lg appearance-none cursor-pointer"
                    value={calidad}
                    onChange={(e) => setCalidad(parseInt(e.target.value))}
                  />
                </div>
              </div>
              <div className="bg-dark-surface border border-bdr-subtle rounded-card p-5 flex flex-col justify-center">
                <label className="text-xs font-bold uppercase tracking-wider text-txt-muted mb-2">Redimensionar (px)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number" placeholder="Ancho"
                    className="w-full text-center text-lg font-mono py-3 bg-dark-input border border-bdr-medium rounded-sm px-3 text-txt-primary focus:border-accent focus:outline-none"
                    value={resizeAncho}
                    onChange={(e) => setResizeAncho(e.target.value)}
                  />
                  <span className="text-txt-muted font-bold text-xl">×</span>
                  <input
                    type="number" placeholder="Alto"
                    className="w-full text-center text-lg font-mono py-3 bg-dark-input border border-bdr-medium rounded-sm px-3 text-txt-primary focus:border-accent focus:outline-none"
                    value={resizeAlto}
                    onChange={(e) => setResizeAlto(e.target.value)}
                  />
                </div>
              </div>
              <div className="bg-dark-surface border border-bdr-subtle rounded-card p-5 flex items-center cursor-pointer hover:border-accent/50 transition-colors" onClick={() => setKeepExif(!keepExif)}>
                <label className="flex items-center gap-4 cursor-pointer select-none w-full">
                  <div className="relative pointer-events-none">
                    <input type="checkbox" className="peer sr-only" checked={keepExif} readOnly />
                    <div className="w-12 h-7 rounded-full bg-dark-input border border-bdr-medium peer-checked:bg-accent peer-checked:border-accent transition-all duration-300" />
                    <div className="absolute left-1 top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-300 peer-checked:translate-x-5" />
                  </div>
                  <div>
                    <span className="text-base text-txt-primary font-semibold block">Preservar metadatos EXIF</span>
                    <span className="text-xs text-txt-secondary">Mantiene la información original de la cámara y GPS</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {activeStep === 'rename' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-txt-primary">Renombrado Inteligente</h3>
              <div
                className="flex items-center gap-3 bg-dark-surface px-4 py-2 rounded-card border border-bdr-subtle cursor-pointer hover:border-accent/50 transition-colors"
                onClick={() => setUsarRename(!usarRename)}
              >
                <span className={`text-sm font-bold uppercase tracking-wider ${usarRename ? 'text-accent' : 'text-txt-muted'}`}>
                  {usarRename ? 'Activado' : 'Desactivado'}
                </span>
                <div className="relative pointer-events-none">
                  <input type="checkbox" className="peer sr-only" checked={usarRename} readOnly />
                  <div className="w-10 h-5 rounded-full bg-dark-input border border-bdr-medium peer-checked:bg-accent peer-checked:border-accent transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                </div>
              </div>
            </div>

            {usarRename && (
              <div className="flex-1 space-y-5 overflow-y-auto">
                <div className="bg-dark-surface border border-bdr-subtle rounded-card p-5">
                  <label className="text-xs font-bold uppercase tracking-wider text-txt-muted mb-2 block">Patrón de nombre</label>
                  <div className="flex gap-3">
                    <input
                      className="flex-1 font-mono text-base py-3 bg-dark-input border border-bdr-medium rounded-sm px-3 text-txt-primary focus:border-accent focus:outline-none"
                      value={patron}
                      onChange={(e) => setPatron(e.target.value)}
                      placeholder="{codigo}_{nombre}{ext}"
                    />
                    <Button variant="secondary" onClick={() => setPatron('')} className="px-6">Limpiar</Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="bg-dark-surface border border-bdr-subtle rounded-card p-5">
                    <label className="text-xs font-bold uppercase tracking-wider text-txt-muted mb-3 block">Patrones rápidos</label>
                    <div className="flex flex-wrap gap-2.5">
                      {presets.map((p) => (
                        <button
                          key={p.label}
                          onClick={() => setPatron(p.value)}
                          className="px-4 py-2 rounded-btn bg-dark-input border border-bdr-medium hover:border-accent hover:text-accent text-txt-secondary text-[13px] font-semibold transition-all"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-dark-surface border border-bdr-subtle rounded-card p-5">
                    <label className="text-xs font-bold uppercase tracking-wider text-txt-muted mb-3 block">Variables disponibles</label>
                    <div className="flex flex-wrap gap-2.5">
                      {fields.map((f) => (
                        <button key={f} onClick={() => insertVar(`{${f}}`)} className="px-3 py-1.5 rounded-sm bg-dark-elevated text-txt-primary text-xs font-mono border border-bdr-subtle hover:bg-accent hover:text-white transition-colors">
                          {`{${f}}`}
                        </button>
                      ))}
                      <button onClick={() => insertVar('{seq}')} className="px-3 py-1.5 rounded-sm bg-accent/10 text-accent text-xs font-mono border border-accent/30 hover:bg-accent hover:text-white transition-colors">{'{seq}'}</button>
                      <button onClick={() => insertVar('{ext}')} className="px-3 py-1.5 rounded-sm bg-accent-blue/10 text-accent-blue text-xs font-mono border border-accent-blue/30 hover:bg-accent-blue hover:text-white transition-colors">{'{ext}'}</button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 bg-dark-surface border border-bdr-subtle rounded-card p-4">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div className="relative">
                      <input type="checkbox" className="peer sr-only" checked={useFilenameSeq} onChange={(e) => setUseFilenameSeq(e.target.checked)} />
                      <div className="w-11 h-6 rounded-full bg-dark-input border border-bdr-medium peer-checked:bg-accent-blue transition-colors" />
                      <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-5 shadow-sm" />
                    </div>
                    <span className="text-[15px] font-medium text-txt-primary">Secuencia desde nombre original</span>
                  </label>
                  {!useFilenameSeq && (
                    <div className="flex items-center gap-3 border-l border-bdr-medium pl-6">
                      <label className="text-xs text-txt-muted font-bold uppercase tracking-wider">Inicio manual</label>
                      <input type="number" min={1} max={9999} className="w-24 py-2 text-center font-mono text-base bg-dark-input border border-bdr-medium rounded-sm px-3 text-txt-primary focus:border-accent focus:outline-none" value={secuencia} onChange={(e) => setSecuencia(parseInt(e.target.value))} />
                    </div>
                  )}
                  <div className="ml-auto">
                    <Button variant="secondary" onClick={doPreview} className="border-accent-blue/30 text-accent-blue hover:bg-accent-blue/10">Vista Previa</Button>
                  </div>
                </div>

                {preview && (
                  <div className="bg-dark-surface rounded-card border border-bdr-subtle overflow-hidden animate-fade-in">
                    <div className="px-5 py-3 bg-dark-elevated border-b border-bdr-subtle flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-txt-muted">Resultados de Renombrado</span>
                      <span className="text-xs font-medium text-txt-primary bg-dark-input px-2 py-1 rounded-sm">{preview.length} archivos</span>
                    </div>
                    <div className="p-3 space-y-1.5 max-h-48 overflow-y-auto">
                      {preview.map((p, i) => (
                        <div key={i} className={`flex items-center justify-between px-4 py-2.5 rounded-sm text-[13px] ${i % 2 === 0 ? 'bg-dark-elevated' : 'bg-transparent'}`}>
                          <span className="text-txt-muted truncate max-w-[35%] font-mono text-xs">{p.origen}</span>
                          <span className="text-txt-muted px-2">→</span>
                          <span className="text-txt-primary font-semibold truncate max-w-[35%] font-mono">{p.nuevo}</span>
                          <Badge variant={p.en_bd ? 'success' : 'warning'} className="shrink-0 ml-auto">
                            {p.en_bd ? 'En Base de Datos' : 'No Encontrado'}
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

        {activeStep === 'output' && (
          <div className="flex flex-col h-full">
            <h3 className="text-xl font-semibold text-txt-primary mb-4">Salida y Registro</h3>
            <div className="bg-dark-surface border border-bdr-subtle rounded-card p-5 mb-4">
              <label className="text-xs font-bold uppercase tracking-wider text-txt-muted mb-2 block">Carpeta de destino</label>
              <div className="flex gap-3">
                <input
                  className="flex-1 cursor-not-allowed font-mono text-sm py-3 bg-dark-input border border-bdr-medium rounded-sm px-3 text-txt-secondary"
                  value={destino}
                  readOnly
                  placeholder="Selecciona donde guardar las imágenes procesadas..."
                />
                <Button variant="secondary" onClick={selectDest} className="px-6">Examinar...</Button>
              </div>
            </div>

            {/* Logs */}
            <div className="flex-1 bg-dark-surface rounded-card border border-bdr-subtle flex flex-col overflow-hidden relative min-h-0">
              <div className="px-5 py-3 bg-dark-elevated border-b border-bdr-subtle flex items-center justify-between shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-widest text-txt-muted flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent-blue inline-block" />
                  Terminal de Actividad
                </span>
                <span className="text-xs font-mono text-txt-muted">{logs.length} líneas</span>
              </div>
              <div className="flex-1 p-4 font-mono text-[13px] space-y-1.5 overflow-y-auto">
                {logs.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-txt-muted/50">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-2">
                      <path d="M4 17l6-6-6-6 M12 19h8" />
                    </svg>
                    <span className="italic">Esperando ejecución...</span>
                  </div>
                )}
                {logs.map((l, i) => (
                  <div key={i} className={`px-3 py-1.5 rounded-sm border flex items-start gap-3 ${
                    l.tag === 'ok' ? 'text-accent-green bg-accent-green/5 border-accent-green/10' :
                    l.tag === 'error' ? 'text-accent-red bg-accent-red/5 border-accent-red/10' :
                    l.tag === 'warn' ? 'text-accent-yellow bg-accent-yellow/5 border-accent-yellow/10' :
                    'text-txt-secondary bg-dark-elevated border-bdr-subtle'
                  }`}>
                    <span className="opacity-50 text-[10px] mt-0.5 shrink-0 w-12">{new Date().toLocaleTimeString().split(' ')[0]}</span>
                    <span>{l.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation bar */}
      <div className="shrink-0 px-8 py-4 border-t border-bdr-subtle bg-dark-surface">
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            onClick={goPrev}
            disabled={stepIndex === 0}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Anterior
          </Button>

          <div className="flex items-center gap-3">
            {status && (
              <div className="flex items-center gap-3 mr-4">
                {running && <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
                <span className="text-xs text-txt-muted font-medium">
                  {running ? `Procesando... ${Math.round(status.progress)}%` : status.progress === 100 ? 'Completado' : ''}
                </span>
                {status.current_file && (
                  <span className="text-[11px] text-txt-muted font-mono truncate max-w-[200px]">{status.current_file}</span>
                )}
                {(status.ok_count > 0 || status.err_count > 0) && (
                  <div className="flex gap-2">
                    <Badge variant="success">{status.ok_count} OK</Badge>
                    {status.err_count > 0 && <Badge variant="error">{status.err_count} Err</Badge>}
                  </div>
                )}
              </div>
            )}

            {!running ? (
              <Button variant="primary" onClick={doProcess} className="px-6">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Iniciar
              </Button>
            ) : (
              <Button variant="secondary" onClick={doCancel} className="px-6 text-accent-red hover:text-accent-red border-accent-red/30 hover:bg-accent-red/10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Detener
              </Button>
            )}
          </div>

          <Button
            variant="secondary"
            onClick={goNext}
            disabled={stepIndex === STEPS.length - 1}
          >
            Siguiente
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Button>
        </div>

        {/* Progress bar when running */}
        {running && status && (
          <div className="mt-3 h-1.5 bg-dark-input rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${status.progress}%`,
                background: 'linear-gradient(90deg, #FF6B2C, #FF8F5E)',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
