import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Upload,
  Folder,
  MapPin,
  Image as ImageIcon,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import Button from './ui/Button';

type Result = { success: boolean; data?: any; error?: string } | null;

type PreviewData = {
  image: string;
  cod_componente: string;
  direccion: string;
  localidad: string;
  distrito: string;
  total_filas: number;
  row_index: number;
  formato?: string;
} | null;

export const UbicacionesView: React.FC = () => {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [outputDir, setOutputDir] = useState<string>('');
  const [formato, setFormato] = useState<'vertical' | 'horizontal'>('vertical');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Preview state
  const [preview, setPreview] = useState<PreviewData>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRowIndex, setPreviewRowIndex] = useState(0);
  const [excelPath, setExcelPath] = useState<string>('');

  // Track the latest fetch request to avoid race conditions
  const fetchIdRef = useRef(0);

  const fetchPreview = useCallback(
    async (rowIndex: number) => {
      if (!excelPath) return;
      const myId = ++fetchIdRef.current;
      const currentFormato = formato;
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const resp = await window.electronAPI?.invoke('preview_ubicacion', {
          excelPath,
          formato: currentFormato,
          rowIndex,
        });
        // Ignore stale responses
        if (myId !== fetchIdRef.current) return;
        const r = resp as { success: boolean; data?: any; error?: string };
        if (r?.success) {
          // Defensive: if the response carries a formato field and it does
          // not match the current selection, skip it (stale format toggle).
          const respFormato = r.data?.formato;
          if (respFormato && respFormato !== formato) return;
          setPreview(r.data ?? null);
        } else {
          setPreviewError(r?.error || 'Error al generar vista previa');
        }
      } catch (err: any) {
        if (myId !== fetchIdRef.current) return;
        setPreviewError(err.message || 'Error de conexion');
      } finally {
        if (myId === fetchIdRef.current) {
          setPreviewLoading(false);
        }
      }
    },
    [excelPath, formato],
  );

  // Auto-fetch immediately when Excel path or formato changes (no debounce)
  useEffect(() => {
    if (!excelPath) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    // Clear stale preview image on format change so the user does not see
    // an old-orientation image while the new one loads.
    setPreview(null);
    fetchPreview(previewRowIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excelPath, formato]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setExcelFile(file);
      setResult(null);
      setPreviewRowIndex(0);
      const path = window.electronAPI?.getPathForFile?.(file) || '';
      setExcelPath(path);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && /\.(xlsx|xls)$/i.test(file.name)) {
      setExcelFile(file);
      setResult(null);
      setPreviewRowIndex(0);
      const path = window.electronAPI?.getPathForFile?.(file) || '';
      setExcelPath(path);
    }
  };

  const handleRemoveExcel = () => {
    setExcelFile(null);
    setExcelPath('');
    setPreview(null);
    setPreviewError(null);
    setResult(null);
    setPreviewRowIndex(0);
  };

  const handleSelectOutputDir = async () => {
    try {
      if (!window.electronAPI) return;
      const result = await window.electronAPI.invoke('dialog_folder', {
        title: 'Seleccionar carpeta de salida',
        pickOnly: true,
      }) as { folder?: string; paths?: string[] } | undefined;
      if (result?.folder) {
        setOutputDir(result.folder);
      } else if (result?.paths && result.paths.length > 0) {
        setOutputDir(result.paths[0]);
      }
    } catch (err) {
      console.error('Error selecting directory:', err);
    }
  };

  const handleGenerate = async () => {
    if (!excelFile || !outputDir) return;

    setIsProcessing(true);
    setResult(null);

    try {
      if (!window.electronAPI) {
        setResult({ success: false, error: 'API de Antares no disponible.' });
        return;
      }
      const path = window.electronAPI.getPathForFile?.(excelFile) || '';
      if (!path) {
        setResult({ success: false, error: 'No se pudo resolver la ruta del archivo Excel.' });
        return;
      }
      const response = await window.electronAPI.invoke('generar_ubicaciones', {
        excelPath: path,
        outputDir,
        formato,
      }) as { success: boolean; data?: any; error?: string };
      setResult(response);
    } catch (err: any) {
      setResult({ success: false, error: err.message || 'Error desconocido' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrevRow = () => {
    if (previewRowIndex > 0) {
      const newIndex = previewRowIndex - 1;
      setPreviewRowIndex(newIndex);
      fetchPreview(newIndex);
    }
  };

  const handleNextRow = () => {
    if (preview && previewRowIndex < preview.total_filas - 1) {
      const newIndex = previewRowIndex + 1;
      setPreviewRowIndex(newIndex);
      fetchPreview(newIndex);
    }
  };

  const canGenerate = excelFile && outputDir && !isProcessing;
  const folderName = outputDir ? outputDir.split('\\').pop() || outputDir.split('/').pop() : '';

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar: Config ── */}
      <div className="w-[400px] min-w-[360px] flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-base)] overflow-y-auto">
        <div className="flex flex-col gap-5 p-4">
          {/* Title */}
          <div className="flex items-center gap-2.5">
            <MapPin size={18} className="text-[var(--accent-primary)] shrink-0" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Generador de Ubicaciones</h2>
          </div>

          {/* Step 1: Excel File */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Archivo Excel</label>

            {excelFile ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-[var(--accent-secondary)]/30 bg-[var(--accent-secondary)]/5 px-3 py-2.5">
                <CheckCircle2 size={15} className="text-[var(--accent-secondary)] shrink-0" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                    {excelFile.name}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {(excelFile.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <button
                  onClick={handleRemoveExcel}
                  className="p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  <X size={14} className="text-[var(--text-muted)]" />
                </button>
              </div>
            ) : (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 px-4 rounded-lg border border-dashed transition-all cursor-pointer ${
                  isDragging
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-glow)]'
                    : 'border-[var(--border-medium)] hover:border-[var(--accent-primary)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <FileSpreadsheet size={22} className="text-[var(--text-muted)]" />
                <span className="text-xs text-[var(--text-secondary)] text-center">
                  Arrastra o haz clic para subir
                  <br />
                  <span className="text-[var(--text-muted)]">.xlsx, .xls</span>
                </span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
              </label>
            )}
          </div>

          {/* Step 2: Output Directory */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Carpeta de Destino</label>
            <button
              onClick={handleSelectOutputDir}
              className="flex items-center gap-2.5 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5 text-left hover:border-[var(--border-medium)] transition-colors"
            >
              <Folder size={15} className="text-[var(--text-muted)] shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span
                  className={`text-xs font-medium truncate ${
                    outputDir ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {folderName || 'Seleccionar carpeta'}
                </span>
                {outputDir && <span className="text-[10px] text-[var(--text-muted)] truncate">{outputDir}</span>}
              </div>
            </button>
          </div>

          {/* Step 3: Format */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Orientacion del Mapa</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormato('vertical')}
                className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-3 transition-all ${
                  formato === 'vertical'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-glow)] text-[var(--text-primary)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-medium)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <ImageIcon size={18} />
                <span className="text-[11px] font-medium">Vertical</span>
              </button>
              <button
                onClick={() => setFormato('horizontal')}
                className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-3 transition-all ${
                  formato === 'horizontal'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-glow)] text-[var(--text-primary)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-medium)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <div className="rotate-90">
                  <ImageIcon size={18} />
                </div>
                <span className="text-[11px] font-medium">Horizontal</span>
              </button>
            </div>
          </div>

          {/* Generate Button */}
          <div className="sticky bottom-0 -mx-4 -mb-4 px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]">
            <Button className="w-full" disabled={!canGenerate} onClick={handleGenerate}>
              {isProcessing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Upload size={14} />
                  Generar PDFs
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Main: Preview & Results ── */}
      <div className="flex-1 flex flex-col bg-[var(--bg-elevated)] overflow-hidden">
        {result ? (
          <ResultPanel result={result} outputDir={outputDir} />
        ) : excelFile ? (
          <RealPreviewPanel
            preview={preview}
            loading={previewLoading}
            error={previewError}
            rowIndex={previewRowIndex}
            totalFilas={preview?.total_filas ?? 0}
            isProcessing={isProcessing}
            onPrev={handlePrevRow}
            onNext={handleNextRow}
            onRefresh={() => fetchPreview(previewRowIndex)}
          />
        ) : (
          <EmptyPreviewPanel formato={formato} />
        )}
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────
// Empty Preview (no Excel loaded yet)
// ──────────────────────────────────────────────
const EmptyPreviewPanel: React.FC<{ formato: string }> = ({ formato }) => (
  <div className="flex-1 flex flex-col items-center justify-center p-8">
    <p className="text-xs font-medium text-[var(--text-muted)] mb-6 uppercase tracking-wider">
      Vista Previa de Plantilla
    </p>
    <div
      className={`relative bg-[var(--bg-input)] shadow-inner overflow-hidden flex flex-col transition-all duration-500 rounded-sm ${
        formato === 'vertical' ? 'w-48 h-64' : 'w-64 h-48'
      }`}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23888\' fill-opacity=\'0.4\' fill-rule=\'evenodd\'%3E%3Ccircle cx=\'3\' cy=\'3\' r=\'3\'/%3E%3Ccircle cx=\'13\' cy=\'13\' r=\'3\'/%3E%3C/g%3E%3C/svg%3E")',
        }}
      />
      <div className="absolute inset-0 bg-white/30 dark:bg-black/20" />
      <div className="relative z-10 flex flex-col items-center w-full h-full p-2">
        <div className="w-3/4 h-2.5 bg-[var(--text-primary)] rounded-sm mt-2 mb-3" />
        <div className="w-5/6 h-1.5 bg-[var(--text-secondary)] rounded-sm mb-1" />
        <div className="w-1/2 h-1.5 bg-[var(--text-secondary)] rounded-sm mb-1" />
        <div className="w-2/3 h-1.5 bg-[var(--text-secondary)] rounded-sm mb-3" />
        <div className="flex-1 flex items-center justify-center">
          <MapPin className="w-7 h-7 text-[var(--accent-primary)] drop-shadow-md" fill="currentColor" />
        </div>
        <div className="w-full h-5 bg-[var(--bg-base)] mt-auto rounded-sm flex items-center justify-center">
          <div className="w-1/2 h-1 bg-[var(--text-muted)] rounded-full" />
        </div>
      </div>
    </div>
    <p className="text-[11px] text-[var(--text-muted)] mt-6 max-w-xs text-center">
      Sube un Excel para ver la vista previa real del resultado.
    </p>
  </div>
);

// ──────────────────────────────────────────────
// Real Preview Panel (with actual generated image)
// ──────────────────────────────────────────────
const RealPreviewPanel: React.FC<{
  preview: PreviewData;
  loading: boolean;
  error: string | null;
  rowIndex: number;
  totalFilas: number;
  isProcessing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onRefresh: () => void;
}> = ({ preview, loading, error, rowIndex, totalFilas, isProcessing, onPrev, onNext, onRefresh }) => (
  <div className="flex-1 flex flex-col overflow-hidden">
    {/* Toolbar */}
    <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]">
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <Eye size={14} className="text-[var(--accent-primary)]" />
        <span className="text-xs font-medium">Vista Previa Real</span>
      </div>

      {totalFilas > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={rowIndex === 0 || loading}
            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
            {rowIndex + 1} / {totalFilas}
          </span>
          <button
            onClick={onNext}
            disabled={rowIndex >= totalFilas - 1 || loading}
            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="ml-1 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-30"
            title="Actualizar vista previa"
          >
            <Loader2 size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      )}
    </div>

    {/* Preview Content */}
    <div className="flex-1 overflow-hidden flex items-center justify-center bg-[var(--bg-elevated)] p-4 relative">
      {error ? (
        <div className="flex flex-col items-center gap-3 max-w-sm">
          <div className="w-12 h-12 rounded-full bg-[var(--accent-red)]/15 flex items-center justify-center">
            <AlertCircle size={24} className="text-[var(--accent-red)]" />
          </div>
          <p className="text-sm font-medium text-[var(--accent-red)]">Error en vista previa</p>
          <p className="text-xs text-[var(--text-muted)] text-center break-words">{error}</p>
        </div>
      ) : preview ? (
        <div className="flex flex-col items-center gap-3 w-full h-full">
          {/* Real image - fills available space, keep visible while loading new */}
          <div className="flex-1 w-full flex items-center justify-center overflow-hidden relative">
            <img
              src={preview.image}
              alt={`Ubicacion ${preview.cod_componente}`}
              className="max-h-full max-w-full object-contain rounded-lg shadow-2xl border border-[var(--border-subtle)] transition-opacity duration-200"
              style={{ opacity: loading ? 0.4 : 1 }}
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-[var(--accent-primary)]" />
              </div>
            )}
          </div>
          {/* Data info - below image */}
          <div className="flex items-center gap-4 shrink-0 px-4 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <span className="text-sm font-bold text-[var(--text-primary)]">{preview.cod_componente}</span>
            <span className="text-xs text-[var(--text-muted)]">|</span>
            <span className="text-xs text-[var(--text-secondary)]">{preview.direccion}</span>
            <span className="text-xs text-[var(--text-muted)]">|</span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {preview.localidad} - {preview.distrito}
            </span>
          </div>
          {isProcessing && (
            <div className="flex items-center gap-2 text-[var(--text-secondary)] shrink-0">
              <Loader2 size={14} className="animate-spin text-[var(--accent-primary)]" />
              <span className="text-xs">Generando PDFs...</span>
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-[var(--accent-primary)]" />
          <p className="text-xs text-[var(--text-muted)]">Cargando mapa...</p>
        </div>
      ) : null}
    </div>
  </div>
);

// ──────────────────────────────────────────────
// Result Panel
// ──────────────────────────────────────────────
const ResultPanel: React.FC<{ result: Result; outputDir: string }> = ({ result, outputDir }) => {
  if (!result) return null;

  if (result.success) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-16 h-16 rounded-full bg-[var(--accent-secondary)]/15 flex items-center justify-center mb-4">
          <CheckCircle2 size={32} className="text-[var(--accent-secondary)]" />
        </div>
        <p className="text-lg font-semibold text-[var(--text-primary)] mb-1">Proceso completado</p>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Se generaron <span className="font-bold text-[var(--accent-secondary)]">{result.data?.generados} PDFs</span>
        </p>
        <div className="max-w-md w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
          <div className="flex items-center gap-2 mb-1">
            <Folder size={13} className="text-[var(--text-muted)] shrink-0" />
            <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
              Carpeta de salida
            </span>
          </div>
          <p className="text-xs font-mono text-[var(--text-secondary)] break-all">
            {result.data?.outputDir || outputDir}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-16 h-16 rounded-full bg-[var(--accent-red)]/15 flex items-center justify-center mb-4">
        <AlertCircle size={32} className="text-[var(--accent-red)]" />
      </div>
      <p className="text-lg font-semibold text-[var(--accent-red)] mb-2">Error</p>
      <div className="max-w-md w-full rounded-lg border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5 p-4">
        <p className="text-sm text-[var(--accent-red)]/90 break-words">{result.error}</p>
      </div>
    </div>
  );
};
