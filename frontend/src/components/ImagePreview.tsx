import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

interface ImagePreviewProps {
  path: string;
  formato: string;
  calidad: number;
  resizeAncho: string;
  resizeAlto: string;
}

export default function ImagePreview({ path, formato, calidad, resizeAncho, resizeAlto }: ImagePreviewProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generatePreview = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const resize = resizeAncho && resizeAlto
        ? [parseInt(resizeAncho), parseInt(resizeAlto)]
        : null;
      const r = await api.previewImage({ path, formato, calidad, resize });
      setPreview(r.preview);
    } catch {
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [path, formato, calidad, resizeAncho, resizeAlto]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) generatePreview();
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [generatePreview]);

  const originalSrc = path.startsWith('file://') ? path : `file://${path}`;

  return (
    <div className="flex gap-4 h-full min-h-0">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <span className="text-xs font-bold uppercase tracking-eyebrow text-mc-slate mb-2">Original</span>
        <div className="flex-1 min-h-0 rounded-card bg-mc-ink overflow-hidden">
          <img src={originalSrc} alt="" className="w-full h-full object-contain" />
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <span className="text-xs font-bold uppercase tracking-eyebrow text-mc-slate mb-2">Previsualización</span>
        <div className="flex-1 min-h-0 rounded-card bg-mc-ink overflow-hidden flex items-center justify-center">
          {loading && <span className="text-mc-slate text-sm">Generando...</span>}
          {!loading && preview && <img src={preview} alt="" className="w-full h-full object-contain" />}
          {!loading && !preview && <span className="text-mc-dust text-sm">No disponible</span>}
        </div>
      </div>
    </div>
  );
}
