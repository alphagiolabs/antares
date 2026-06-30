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
const IPC_TIMEOUT = 30_000;           // Default timeout — most ops finish in <5s
const IPC_LONG_TIMEOUT = 900_000;     // 15 min for heavy operations (large PDF/ZIP batches)

// Backend Spawner
const HANDSHAKE_TIMEOUT_MS = 30_000;  // Backend startup handshake timeout
const HEALTH_CHECK_INTERVAL_MS = 15_000;  // How often to check backend health
const HEALTH_PROBE_TIMEOUT_MS = 3_000;    // Timeout for health probe response
const MAX_RESTART_BACKOFF_SEC = 30;        // Maximum backoff between restart attempts
const RESTART_RESET_MS = 60_000;          // Time of stability before restart counter resets
const STARTUP_WAIT_MS = 30_000;           // How long to wait for backend to start

// Backend Spawner — Retry & Limits
const START_RETRY_LIMIT = 5;             // Spawn retry count per start cycle
const MAX_AUTO_RESTARTS = Infinity;      // Keep recovering from transient failures while app is open
const STDERR_BUFFER_LINES = 30;          // Rolling stderr tail lines
const WAIT_FOR_READY_TIMEOUT_MS = 60_000; // Default timeout for waitForReady()

// Retry Configuration
const MID_FLIGHT_RETRIES = 2;         // Retries for transient mid-flight errors
const IPC_MAX_RETRIES = 2;            // Frontend retries for retryable errors
const IPC_RETRY_DELAY = 500;          // Base delay between retries (ms)

// Long-running IPC methods (need extended timeout)
const LONG_RUNNING_METHODS = new Set([
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
const MAX_IMAGE_PIXELS = 50_000_000;  // 50MP limit to prevent decompression bombs
const PREVIEW_MAX_SIZE = 400;         // Max preview dimension (longest side)

// Database
const SQLITE_PARAM_LIMIT = 900;       // Safe margin for SQLite parameter limit

// Export for Node.js (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    IPC_TIMEOUT,
    IPC_LONG_TIMEOUT,
    HANDSHAKE_TIMEOUT_MS,
    HEALTH_CHECK_INTERVAL_MS,
    HEALTH_PROBE_TIMEOUT_MS,
    MAX_RESTART_BACKOFF_SEC,
    RESTART_RESET_MS,
    STARTUP_WAIT_MS,
    MID_FLIGHT_RETRIES,
    IPC_MAX_RETRIES,
    IPC_RETRY_DELAY,
    MAX_IMAGE_PIXELS,
    PREVIEW_MAX_SIZE,
    SQLITE_PARAM_LIMIT,
    START_RETRY_LIMIT,
    MAX_AUTO_RESTARTS,
    STDERR_BUFFER_LINES,
    WAIT_FOR_READY_TIMEOUT_MS,
    LONG_RUNNING_METHODS,
  };
}

// Export for TypeScript/ES modules
if (typeof exports !== 'undefined') {
  exports.IPC_TIMEOUT = IPC_TIMEOUT;
  exports.IPC_LONG_TIMEOUT = IPC_LONG_TIMEOUT;
  exports.HANDSHAKE_TIMEOUT_MS = HANDSHAKE_TIMEOUT_MS;
  exports.HEALTH_CHECK_INTERVAL_MS = HEALTH_CHECK_INTERVAL_MS;
  exports.HEALTH_PROBE_TIMEOUT_MS = HEALTH_PROBE_TIMEOUT_MS;
  exports.MAX_RESTART_BACKOFF_SEC = MAX_RESTART_BACKOFF_SEC;
  exports.RESTART_RESET_MS = RESTART_RESET_MS;
  exports.STARTUP_WAIT_MS = STARTUP_WAIT_MS;
  exports.MID_FLIGHT_RETRIES = MID_FLIGHT_RETRIES;
  exports.IPC_MAX_RETRIES = IPC_MAX_RETRIES;
  exports.IPC_RETRY_DELAY = IPC_RETRY_DELAY;
  exports.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS;
  exports.PREVIEW_MAX_SIZE = PREVIEW_MAX_SIZE;
  exports.SQLITE_PARAM_LIMIT = SQLITE_PARAM_LIMIT;
  exports.START_RETRY_LIMIT = START_RETRY_LIMIT;
  exports.MAX_AUTO_RESTARTS = MAX_AUTO_RESTARTS;
  exports.STDERR_BUFFER_LINES = STDERR_BUFFER_LINES;
  exports.WAIT_FOR_READY_TIMEOUT_MS = WAIT_FOR_READY_TIMEOUT_MS;
  exports.LONG_RUNNING_METHODS = LONG_RUNNING_METHODS;
}