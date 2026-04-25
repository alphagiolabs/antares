/**
 * API bridge: habla con el backend Python via Electron IPC (JSON-RPC)
 * en vez de HTTP fetch como en la arquitectura antigua (FastAPI+PyQt5).
 */

export interface ProcessStatus {
  running: boolean;
  progress: number;
  current_file: string;
  ok_count: number;
  err_count: number;
  logs: LogEntry[];
}

export interface LogEntry {
  message: string;
  tag: string;
}

export interface PreviewItem {
  origen: string;
  nuevo: string;
  en_bd: boolean;
}

export interface DBField {
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
}

export interface DBRecord {
  [key: string]: string | number | null;
}

export interface ThemeConfig {
  [key: string]: string;
  name: string;
  bg: string;
  bg_secondary: string;
  fg: string;
  fg_muted: string;
  fg_secondary: string;
  fg_tertiary: string;
  accent: string;
  accent_light: string;
  accent_hover: string;
  accent_dark: string;
  border: string;
  blue_hover: string;
  error: string;
  warning: string;
  success: string;
  orange: string;
}

// ─── Electron IPC bridge ───────────────────────────────────────────────────

declare global {
  interface Window {
    electronAPI?: {
      invoke: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
      onNotify: (callback: (method: string, params: unknown) => void) => () => void;
    };
  }
}

const _invoke = async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
  if (!window.electronAPI) {
    throw new Error('Electron IPC no disponible');
  }
  return window.electronAPI.invoke(method, params) as Promise<T>;
};

export function onNotify(callback: (method: string, params: unknown) => void) {
  if (!window.electronAPI) return () => {};
  return window.electronAPI.onNotify(callback);
}

// ─── API methods ───────────────────────────────────────────────────────────

export const api = {
  version: () => _invoke<{ version: string }>('version'),
  formats: () => _invoke<{ formats: string[] }>('formats'),

  dialogFiles: () => _invoke<{ paths: string[] }>('dialog_files'),
  dialogFolder: () => _invoke<{ paths: string[] }>('dialog_folder'),
  dialogDest: () => _invoke<{ paths: string[] }>('dialog_dest'),
  dialogSave: () => _invoke<{ paths: string[] }>('dialog_save'),

  startProcess: (body: object) => _invoke<{ started: boolean }>('process_start', body as Record<string, unknown>),
  getStatus: () => _invoke<ProcessStatus>('process_status'),
  cancelProcess: () => _invoke<{ cancelled: boolean }>('process_cancel'),

  preview: (body: object) => _invoke<{ preview: PreviewItem[] }>('preview', body as Record<string, unknown>),
  previewImage: (body: { path: string; formato: string; calidad: number; resize?: number[] | null }) =>
    _invoke<{ preview: string }>('preview_image', body as Record<string, unknown>),

  getRecords: () => _invoke<{ records: DBRecord[]; fields: string[] }>('db_records'),
  importExcel: (path: string) => _invoke<{ imported: number }>('db_import', { path }),
  exportExcel: (path: string) => _invoke<{ exported: number }>('db_export', { path }),
  generateTemplate: (path: string) => _invoke<{ path: string }>('db_template', { path }),
  scanFolder: (folder: string) => _invoke<{ files: string[] }>('scan_folder', { folder }),

  getFields: () => _invoke<{ fields: DBField[] }>('db_fields'),
  updateFields: (fields: DBField[]) => _invoke<{ fields: DBField[] }>('db_fields_update', { fields }),
  resetFields: () => _invoke<{ fields: DBField[] }>('db_fields_reset'),

  getTheme: () => _invoke<ThemeConfig>('theme_get'),
  saveTheme: (theme: ThemeConfig) => _invoke<ThemeConfig>('theme_save', theme as unknown as Record<string, unknown>),
  getPresets: () => _invoke<{ presets: string[] }>('theme_presets'),
  applyPreset: (name: string) => _invoke<ThemeConfig>('theme_preset', { name }),
  resetTheme: () => _invoke<ThemeConfig>('theme_reset'),

  historyList: (body?: { limit?: number }) => _invoke<{ runs: any[] }>('history_list', body as Record<string, unknown>),
  historyGet: (id: number) => _invoke<{ run: any }>('history_get', { id }),
  historyDelete: (id: number) => _invoke<{ deleted: boolean }>('history_delete', { id }),
};
