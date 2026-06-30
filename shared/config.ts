/**
 * Centralized configuration for ANTARES application.
 * 
 * This file contains shared constants used across Electron main process,
 * renderer (frontend), and Python backend.
 * 
 * IMPORTANT: When modifying timeout values, ensure consistency between:
 * - Electron main process (ipc-router.js, backend-spawner.js)
 * - Frontend renderer (api.ts)
 * - Python backend (if applicable)
 */

// IPC Timeouts (in milliseconds)
export const IPC_TIMEOUT = 30_000;           // Default timeout — most ops finish in <5s
export const IPC_LONG_TIMEOUT = 900_000;     // 15 min for heavy operations (large PDF/ZIP batches)

// Backend Spawner
export const HANDSHAKE_TIMEOUT_MS = 30_000;  // Backend startup handshake timeout
export const HEALTH_CHECK_INTERVAL_MS = 15_000;  // How often to check backend health
export const HEALTH_PROBE_TIMEOUT_MS = 3_000;    // Timeout for health probe response
export const MAX_RESTART_BACKOFF_SEC = 30;        // Maximum backoff between restart attempts
export const RESTART_RESET_MS = 60_000;          // Time of stability before restart counter resets
export const STARTUP_WAIT_MS = 30_000;           // How long to wait for backend to start

// Backend Spawner — Retry & Limits
export const START_RETRY_LIMIT = 5;             // Spawn retry count per start cycle
export const MAX_AUTO_RESTARTS = Infinity;      // Keep recovering from transient failures while app is open
export const STDERR_BUFFER_LINES = 30;          // Rolling stderr tail lines
export const WAIT_FOR_READY_TIMEOUT_MS = 60_000; // Default timeout for waitForReady()

// Retry Configuration
export const MID_FLIGHT_RETRIES = 2;         // Retries for transient mid-flight errors
export const IPC_MAX_RETRIES = 2;            // Frontend retries for retryable errors
export const IPC_RETRY_DELAY = 500;          // Base delay between retries (ms)

// Long-running IPC methods (need extended timeout)
export const LONG_RUNNING_METHODS = new Set([
  'process_start',
  'db_import',
  'db_export',
  'db_clear',
  'preview_image',
  'formatos_generate',
  'formatos_render_template_page',
  'image_optimizer_zip',
  'image_optimizer_save_files',
  'sellador_apply',
  'sellador_inspect_pdf',
  'sellador_render_page',
  'technical_reports_import_file',
  'technical_reports_render_consolidated_html',
  'panel_aviso_corte_parse_excel',
  'technical_reports_render_html',
  'panel_aviso_corte_render_pdf',
  'panel_aviso_corte_compute_match',
  'html_to_pdf',
  'generar_ubicaciones',
  'preview_ubicacion',
]);

// Image Processing
export const MAX_IMAGE_PIXELS = 50_000_000;  // 50MP limit to prevent decompression bombs
export const PREVIEW_MAX_SIZE = 400;         // Max preview dimension (longest side)

// Database
export const SQLITE_PARAM_LIMIT = 900;       // Safe margin for SQLite parameter limit
