/**
 * SEC-003 Capa 2 — mapeo método IPC → params path-like (read/write).
 *
 * Usado por electron/ipc-router.js para derivar allowed_roots desde el
 * registro de vouchers (electron/vouched-paths.js) antes de reenviar al
 * backend. El router strippea cualquier allowed_roots que venga del renderer
 * y deriva los suyos de estas rutas.
 *
 * read  = paths que el handler va a LEER (archivos elegidos con dialog_files
 *         o bajo dialog_folder scan).
 * write = paths que el handler va a ESCRIBIR (destino de dialog_dest,
 *         dialog_save, o dialog_folder pickOnly).
 *
 * Conservativo: solo métodos cuyas rutas provienen de diálogos nativos en el
 * frontend actual. Métodos no listados quedan en Capa 1 (is_safe_user_path).
 */
const PATH_PARAMS_BY_METHOD = {
  // Conversión / preview
  process_start: { read: ['files', 'mapping_path'], write: ['destino'] },
  preview: { read: ['path'], write: [] },
  preview_image: { read: ['path'], write: [] },
  is_video: { read: ['path'], write: [] },
  // Base de datos técnica
  db_import: { read: ['path'], write: [] },
  db_export: { read: [], write: ['path'] },
  db_template: { read: [], write: ['path'] },
  db_parse_mapping: { read: ['path'], write: [] },
  // Optimizer de imágenes
  image_optimizer_zip: { read: [], write: ['output_path'] },
  image_optimizer_save_files: { read: [], write: ['output_folder'] },
  // Formatos PDF
  formatos_generate: { read: [], write: ['output_path'] },
  // Panel aviso de corte
  panel_aviso_corte_render_pdf: { read: ['image_paths'], write: ['output_path'] },
  panel_aviso_corte_template: { read: [], write: ['path'] },
  // Sellador
  sellador_apply: { read: ['pdf_path', 'stamp_path'], write: ['output_path'] },
  sellador_inspect_pdf: { read: ['pdf_path'], write: [] },
  sellador_render_page: { read: ['pdf_path'], write: [] },
  sellador_preview_pages: { read: ['pdf_path'], write: [] },
  // Ubicaciones
  generar_ubicaciones: { read: ['excelPath'], write: ['outputDir'] },
  preview_ubicacion: { read: ['excelPath'], write: [] },
};

module.exports = { PATH_PARAMS_BY_METHOD };
