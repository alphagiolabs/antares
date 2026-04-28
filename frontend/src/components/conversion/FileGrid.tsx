import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import FileCard from './FileCard';

interface FileGridProps {
  files: string[];
  selectedFiles: Set<string>;
  selectedFile: string | null;
  onFileClick: (e: React.MouseEvent, path: string) => void;
  onRemoveFile: (path: string) => void;
  onSelectAll: () => void;
}

export default function FileGrid({ files, selectedFiles, selectedFile, onFileClick, onRemoveFile, onSelectAll }: FileGridProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#666666]">
          {selectedFiles.size > 0 ? `${selectedFiles.size} seleccionados` : `${files.length} total`}
        </span>
        <button
          onClick={onSelectAll}
          className="text-xs text-[#A0A0A0] hover:text-white transition-colors"
        >
          {selectedFiles.size === files.length ? 'Deseleccionar' : 'Seleccionar todos'}
        </button>
      </div>
      <motion.div layout className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        <AnimatePresence>
          {files.map((f, i) => (
            <FileCard
              key={f}
              path={f}
              selected={selectedFiles.has(f)}
              isPrimary={selectedFile === f}
              onClick={(e) => onFileClick(e, f)}
              onRemove={(e) => { e.stopPropagation(); onRemoveFile(f); }}
              index={i}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
