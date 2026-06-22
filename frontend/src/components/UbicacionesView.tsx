import React, { useState } from 'react';
import { Upload, Folder, MapPin, Image as ImageIcon, Loader2 } from 'lucide-react';
import Button from './ui/Button';

export const UbicacionesView: React.FC = () => {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [outputDir, setOutputDir] = useState<string>('');
  const [formato, setFormato] = useState<'vertical' | 'horizontal'>('vertical');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; data?: any; error?: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setExcelFile(e.target.files[0]);
    }
  };

  const handleSelectOutputDir = async () => {
    try {
      if ((window as any).antares) {
        const result = await (window as any).antares.invoke('dialog_show_open_dialog', {
          properties: ['openDirectory'],
          title: 'Seleccionar carpeta de salida'
        });
        if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
          setOutputDir(result.filePaths[0]);
        }
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
      if ((window as any).antares) {
        const payload = {
          excelPath: (excelFile as any).path,
          outputDir,
          formato
        };
        const response = await (window as any).antares.invoke('generar_ubicaciones', payload);
        setResult(response);
      } else {
        setResult({ success: false, error: 'API de Antares no disponible (¿no estás en Electron?).' });
      }
    } catch (err: any) {
      setResult({ success: false, error: err.message || 'Error desconocido' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 p-8 bg-zinc-50 dark:bg-zinc-900/50 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center gap-3 pb-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="p-3 bg-cyan-100 dark:bg-cyan-900/30 rounded-xl text-cyan-600 dark:text-cyan-400">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Generador de Ubicaciones</h1>
            <p className="text-zinc-500 dark:text-zinc-400">Carga un Excel con coordenadas y genera mapas estáticos en formato PDF con pines corporativos.</p>
          </div>
        </div>

        {/* Configuration Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Left Column: Inputs */}
          <div className="space-y-6">
            <div className="p-6 bg-white dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 shadow-sm">
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-4">1. Datos de Entrada</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Archivo Excel
                  </label>
                  <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer group">
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-6 h-6 text-zinc-400 group-hover:text-cyan-500 transition-colors" />
                      <span className="text-sm text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300">
                        {excelFile ? excelFile.name : 'Click para seleccionar archivo'}
                      </span>
                    </div>
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
                  </label>
                  <p className="text-xs text-zinc-500 mt-2">
                    El archivo debe contener columnas: COD COMPONENTE, DIRECCION, LOCALIDAD, DISTRITO, LATITUD, LONGITUD.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-white dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 shadow-sm">
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-4">2. Destino y Formato</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Carpeta de Salida
                  </label>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1 justify-start text-left truncate" onClick={handleSelectOutputDir}>
                      <Folder className="w-4 h-4 mr-2 flex-shrink-0" />
                      <span className="truncate">{outputDir || 'Seleccionar carpeta...'}</span>
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Formato de PDF
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setFormato('vertical')}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-colors ${
                        formato === 'vertical' 
                          ? 'bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-900/20 dark:border-cyan-800 dark:text-cyan-400' 
                          : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-800/50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <ImageIcon className="w-5 h-5" />
                      <span className="text-sm font-medium">Vertical</span>
                    </button>
                    <button
                      onClick={() => setFormato('horizontal')}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-colors ${
                        formato === 'horizontal' 
                          ? 'bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-900/20 dark:border-cyan-800 dark:text-cyan-400' 
                          : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-800/50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div className="rotate-90">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <span className="text-sm font-medium">Horizontal</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Status & Action */}
          <div className="space-y-6">
             <div className="p-6 bg-white dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 shadow-sm h-full flex flex-col">
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-4">Ejecución</h2>
              
              <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] text-center space-y-4">
                {result ? (
                  result.success ? (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl w-full">
                      <p className="font-medium text-lg mb-1">¡Completado!</p>
                      <p className="text-sm">Se generaron {result.data?.generados} PDFs en:</p>
                      <p className="text-xs mt-2 font-mono break-all">{result.data?.outputDir}</p>
                    </div>
                  ) : (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl w-full">
                      <p className="font-medium mb-1">Error</p>
                      <p className="text-sm break-words">{result.error}</p>
                    </div>
                  )
                ) : (
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                    {excelFile && outputDir ? 'Listo para generar PDFs.' : 'Configura los datos de entrada y salida para comenzar.'}
                  </p>
                )}
              </div>

              <div className="mt-6">
                <Button 
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white h-12 text-lg"
                  disabled={!excelFile || !outputDir || isProcessing}
                  onClick={handleGenerate}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    'Generar PDFs'
                  )}
                </Button>
              </div>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};
