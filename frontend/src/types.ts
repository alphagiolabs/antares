export interface ProcessStatus {
  running: boolean;
  progress: number;
  current_file: string;
  ok_count: number;
  err_count: number;
  logs: LogEntry[];
  id?: string;
  job_type?: string;
  total?: number;
  cancel_requested?: boolean;
  created_at?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
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

export interface MappingCollision {
  output: string;
  sources: string[];
}

export interface MappingResult {
  mapping: Record<string, string>;
  totalEntries: number;
  matchedFiles: number;
  unmatchedFiles: string[];
  orphanEntries: string[];
  collisions: MappingCollision[];
  id_column?: string;
  rename_column?: string;
  columns?: string[];
}

export interface DBField {
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
}

export interface RenamePattern {
  id: string;
  label: string;
  pattern: string;
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

export interface VisualMapping {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  font_size: number;
  font_name: string;
  color_r: number;
  color_g: number;
  color_b: number;
  padding: number;
  blank_x: number | null;
  blank_y: number | null;
  blank_width: number | null;
  blank_height: number | null;
  redraw_top_border: boolean;
  redraw_ot_badge: boolean;
  blank_mcids: number[] | null;
}

export type FormatOrigin = 'builtin' | 'uploaded';
export type MappingStrategy = 'legacy_xobject' | 'visual_overlay' | 'simple_overlay';

export interface FormatInfo {
  id: string;
  nombre: string;
  origen: FormatOrigin;
  enabled: boolean;
  persisted: boolean;
  strategy: MappingStrategy;
  mapping: VisualMapping | null;
  filename_pattern: string;
  max_pages: number;
  number_min: number;
  number_max: number;
  has_mapping: boolean;
}

// ─── History ───────────────────────────────────────────────────────────────
// History types are defined in components/history/runTypes.ts
// Re-export for convenience
export type { HistoryRunRow as HistoryRun } from './components/history/runTypes';

export interface HistorySchema {
  run_types: RunTypeSchema[];
  all_run_types: string[];
  current_version: string;
}

export interface RunTypeSchema {
  id: string;
  label_key: string;
  description_key: string;
  color_token: string;
  show_patron: boolean;
  filter_group: string;
  options_schema: Record<string, unknown>;
  files_schema: Record<string, unknown>;
  stats: RunTypeStat[];
}

export interface RunTypeStat {
  key: string;
  label_key: string;
  color_token: string | null;
}

// ─── Technical Reports ─────────────────────────────────────────────────────
// Technical report types are defined in components/technical-reports/types.ts
// Re-export for convenience
export type { TechnicalReport, TechnicalReportListItem } from './components/technical-reports/types';

export interface TechnicalReportVariable {
  key: string;
  label: string;
  category: string;
}

// ─── Panel Aviso de Corte ──────────────────────────────────────────────────

export interface PanelAvisoCorteRow {
  [key: string]: string;
}

// Panel type is complex and varies by component - use Record<string, unknown> for API responses
export type PanelAvisoCortePanel = Record<string, unknown>;

export interface PanelAvisoCorteSummary {
  total: number;
  matched: number;
  unmatched: number;
}

// ─── Ubicaciones ───────────────────────────────────────────────────────────

export interface UbicacionData {
  id: string;
  address: string;
  lat: number;
  lng: number;
  image_url?: string;
  [key: string]: unknown;
}

