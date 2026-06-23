# Changelog

Todas las versiones notables de ANTARES se documentan aquí.

Formato basado en [Keep a Changelog](https://keepachangelog.com/),
y este proyecto sigue [Semantic Versioning](https://semver.org/).

## [0.10.10] — 2026-06-23

### Added
- Nueva herramienta de Ubicaciones: genera reportes con capturas de Google Maps a partir de un Excel de coordenadas. Backend handler con Playwright persistente, vista frontend con sidebar, dropzone de Excel, selector de formatos y vista previa en tiempo real.
- Pre-warming del navegador Playwright al arranque del backend (`warmup_preview_browser`) para que la primera captura de mapas sea instantánea.
- Lazy-load de thumbnails con `IntersectionObserver` para evitar abrir cientos de `file://` handles simultáneamente en la vista de conversión.

### Changed
- UI de Ubicaciones rediseñada para un look profesional: sidebar en columna flex con header fijo, secciones de config scrollables, botón de generar sticky, labels estilo eyebrow, dropzone con más padding, tarjetas de formato con padding e indicador activo/inactivo consistente.
- Eliminado el debounce de 300ms en la vista previa de Ubicaciones: las peticiones ahora se disparan inmediatamente al cambiar Excel o formato, manteniendo el anti-race-condition con `fetchIdRef`.
- Vista previa unificada WYSIWYG: la exportación reutiliza el navegador Playwright persistente y el cache de mapas con resolución, calibrando el layout a las plantillas de referencia.
- Eliminado el debounce de 300ms en `UbicacionesView.tsx` para preview en tiempo real.
- Optimizaciones de rendimiento (end-to-end audit): cache de `pin.png` a nivel módulo, regex patterns hoisted a nivel módulo en `technical_reports.py`, cache de `load_patterns()` con invalidación, `import psutil` a nivel módulo, `useCallback` estable en `App.tsx`.

### Fixed
- Concorrencia de Playwright: reemplazado `RLock` por un single-thread executor para garantizar afinidad de hilo en la API sync de Playwright, evitando el crash "Sync API inside the asyncio loop" al togglear formatos o navegar filas rápido.
- Acceso serializado a la `Page` de Playwright persistente compartida entre hilos del `ThreadPoolExecutor` (light_workers=4).
- Reducción del wait de captura de mapas de 1200ms a 800ms aprovechando el navegador pre-warmed con Google Maps cacheado.
- Edge Functions: agregado manejo de `OPTIONS` y headers CORS para que `supabase.functions.invoke` funcione desde el frontend en modo dev (antes fallaba con 405 en preflight).
- Panel de admin: reemplazados `supabase.auth.admin.createUser/deleteUser` por Edge Functions (`admin-create-user`, `admin-delete-user`) que validan rol admin con `SUPABASE_SERVICE_ROLE_KEY`, ya que la service_role no está disponible en el frontend.

## [0.10.9] — 2026-06-22

### Fixed
- Supabase en builds de CI: el workflow `release.yml` no pasaba `VITE_SUPABASE_URL` ni `VITE_SUPABASE_ANON_KEY` al paso `Build Frontend`, por lo que Vite embebía `undefined` en el bundle y la app instalada mostraba "Supabase no configurado" al intentar ingresar. Agregadas las variables desde GitHub Secrets al paso de build.
- `supabase.ts`: en builds de producción, si faltan las variables de entorno ahora se lanza un error explícito en lugar de un `console.warn` silencioso, para que el CI falle antes de publicar un instalador roto.

## [0.10.8] — 2026-06-22

### Fixed
- Empaquetado de la app: `electron-builder.yml` no incluía la carpeta `shared/` dentro del `app.asar`, por lo que `electron/dialog-handlers.js` crasheaba al arrancar la app instalada con `Error: Cannot find module '../shared/html-sanitizer'`. Agregada la inclusión `- "shared/**/*"` a la lista de `files`.

## [0.10.7] — 2026-06-22

### Fixed
- Workflow de Release (Windows): agregado step de instalación de Pango/GTK vía MSYS2 antes de `pip install`, para que WeasyPrint encuentre `libgobject-2.0-0` y los tests de `render_pdf` pasen en CI. Antes, los 4 tests de PDF fallaban con `OSError: cannot load library 'libgobject-2.0-0'` y bloqueaban el build del installer.
- Workflows de CI y Release: bump de Node 18 → 20. Vitest 4 depende de `vite@8` → `rolldown`, que importa `styleText` desde `node:util` (solo disponible en Node ≥ 20.12). Node 18 está EOL desde abril 2025.

## [0.10.6] — 2026-06-22

### Fixed
- Agregada dependencia de desarrollo `hypothesis>=6.100.0` para resolver `ModuleNotFoundError` en CI durante la recolección de tests de `tests/panel_aviso_corte`.

## [0.10.5] — 2026-06-22

### Added
- Nuevos componentes de mapeo visual para formatos (MappingColorField, MappingOverlay, MappingPreviewPanel).
- Soporte para exportación de reportes técnicos con grid 3x2 dinámico y stretch de imágenes.
- Nuevos tests para mapeo de formatos, optimizador de imágenes y manejo de diálogos de Electron.
- Assets de registro: imagen y video de sign-up.

### Changed
- Mejoras en el backend de reportes, formatos, sellador y optimizador de imágenes.
- Refactor del IPC de Electron y manejo de ventanas.
- Actualización de dependencias en frontend y .gitignore para archivos temporales/caché.
- Limpieza de credenciales de Supabase en `.env.example` mediante reescritura de historial.
- Actualización de versiones a `0.10.5` en todos los manifiestos del proyecto.

### Fixed
- Correcciones en la UI de formatos, sidebar y optimizador.
- Ajustes en locales y sanitización de HTML compartido.

## [1.10.5] — 2025-06-01

### Fixed
- Correcciones menores en el backend de procesamiento de imágenes.

### Changed
- Actualización de dependencias.

## [1.10.4] — 2025-05-15

### Fixed
- Corrección en el manejador de formatos para exports Excel.

## [1.10.3] — 2025-05-01

### Added
- Nueva funcionalidad de informes técnicos con exportación a PDF/Excel.

### Fixed
- Corrección en la asignación de renombrado por lotes.

## [1.10.2] — 2025-04-15

### Changed
- Mejoras en la UI de conversión con soporte para arrastrar y soltar.

## [1.10.1] — 2025-04-01

### Fixed
- Correcciones en el spawned de backend y manejo de errores de IPC.

## [1.10.0] — 2025-03-15

### Added
- Soporte para múltiples formatos de salida (PNG, JPG, WEBP, BMP, TIFF).
- Renombrado por lotes con patrones personalizados.
- Tema oscuro completo.
- Auto-actualizador integrado (electron-updater).

### Changed
- Migración a React 18 + TypeScript + Vite + TailwindCSS.
- Arquitectura IPC renovada con backend Python separado.

<!--
Template para nuevas entradas:

## [X.Y.Z] — YYYY-MM-DD

### Added
- Nueva funcionalidad.

### Changed
- Cambios en funcionalidad existente.

### Deprecated
- Funcionalidad que será eliminada en futuras versiones.

### Removed
- Funcionalidad eliminada en esta versión.

### Fixed
- Corrección de errores.

### Security
- Parches de seguridad.
-->
