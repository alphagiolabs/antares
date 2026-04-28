import React from 'react';
import Button from '../ui/Button';

interface DropzoneProps {
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
  fileCount?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onClear?: () => void;
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export default function Dropzone({
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onAddFiles,
  onAddFolder,
  fileCount = 0,
  expanded = true,
  onToggleExpand,
  onClear,
}: DropzoneProps) {
  if (fileCount > 0 && !expanded) {
    return (
      <div className="flex items-center justify-between bg-[#111111] rounded-xl border border-[#1A1A1A] px-4 py-3">
        <div className="flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#A0A0A0]">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <span className="text-[13px] text-white font-medium">{fileCount} imagen{fileCount !== 1 ? 'es' : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onAddFiles}>+ Agregar</Button>
          <Button variant="ghost" size="sm" onClick={onClear} className="text-[#EF4444] hover:text-[#EF4444]">Limpiar</Button>
          <button onClick={onToggleExpand} className="text-[#666666] hover:text-white transition-colors p-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex flex-col items-center justify-center text-center rounded-2xl border-2 border-dashed transition-all duration-300 ${
        dragOver
          ? 'border-[#FF6B2C] bg-[#FF6B2C]/5 scale-[1.01] shadow-[0_0_30px_rgba(255,107,44,0.1)]'
          : fileCount > 0
          ? 'border-[#2A2A2A] bg-[#111111] py-6'
          : 'border-[#2A2A2A] bg-[#111111] min-h-[calc(100vh-160px)]'
      }`}
    >
      <div className={`${fileCount > 0 ? 'mb-2' : 'mb-6'}`}>
        <div className={`${fileCount > 0 ? 'w-10 h-10' : 'w-16 h-16'} rounded-2xl bg-[#1A1A1A] flex items-center justify-center mb-4 border border-[#222222]`}>
          <UploadIcon className={`${fileCount > 0 ? 'w-5 h-5' : 'w-8 h-8'} text-[#666666]`} />
        </div>
        <h3 className={`${fileCount > 0 ? 'text-lg' : 'text-2xl'} font-medium text-white mb-2`}>
          {dragOver ? 'Suelta las imágenes aquí' : 'Arrastra imágenes aquí'}
        </h3>
        <p className="text-sm text-[#666666]">JPG, PNG, WEBP, TIFF, BMP, GIF</p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={onAddFiles}>Seleccionar archivos</Button>
        <Button variant="secondary" size="sm" onClick={onAddFolder}>Escanear carpeta</Button>
      </div>
    </div>
  );
}
