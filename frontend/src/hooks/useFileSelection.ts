import { useState, useCallback, useRef, useEffect } from 'react';

export function useFileSelection(files: string[]) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const filesRef = useRef(files);

  useEffect(() => { filesRef.current = files; }, [files]);

  // Remove deleted files from selection
  useEffect(() => {
    setSelectedFiles((prev) => {
      let needsUpdate = false;
      for (const f of prev) {
        if (!files.includes(f)) { needsUpdate = true; break; }
      }
      if (!needsUpdate) return prev;
      const next = new Set(prev);
      for (const f of prev) {
        if (!files.includes(f)) next.delete(f);
      }
      return next;
    });
  }, [files]);

  const handleFileClick = useCallback((e: React.MouseEvent, path: string) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path); else next.add(path);
        return next;
      });
      setSelectedFile(path);
    } else if (e.shiftKey) {
      e.preventDefault();
      setSelectedFile((prevSel) => {
        const anchorPath = prevSel || filesRef.current[0];
        const idx2 = filesRef.current.indexOf(path);
        // The clicked path must exist; bail out to a single selection otherwise.
        if (idx2 < 0) {
          setSelectedFiles(new Set([path]));
          return path;
        }
        // If the anchor was removed from the list between clicks, indexOf
        // returns -1; fall back to the clicked item so we never iterate from
        // -1 and push `undefined` into the selection set.
        const idx1 = filesRef.current.indexOf(anchorPath);
        const anchorIdx = idx1 < 0 ? idx2 : idx1;
        const start = Math.min(anchorIdx, idx2);
        const end = Math.max(anchorIdx, idx2);
        setSelectedFiles((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            const f = filesRef.current[i];
            if (f !== undefined) next.add(f);
          }
          return next;
        });
        return path;
      });
    } else {
      setSelectedFile(path);
      setSelectedFiles(new Set([path]));
    }
  }, []);

  const handleFileDoubleClick = useCallback((_e: React.MouseEvent, path: string) => {
    setSelectedFile(path);
    setSelectedFiles(new Set([path]));
  }, []);

  const selectAllFiles = useCallback(() => {
    setSelectedFiles((prev) => prev.size === filesRef.current.length ? new Set() : new Set(filesRef.current));
  }, []);

  return {
    selectedFile, setSelectedFile,
    selectedFiles, setSelectedFiles,
    handleFileClick, handleFileDoubleClick, selectAllFiles,
  };
}
