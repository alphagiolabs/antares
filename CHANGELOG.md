# Changelog

Todas las versiones notables de ANTARES se documentan aquí.

Formato basado en [Keep a Changelog](https://keepachangelog.com/),
y este proyecto sigue [Semantic Versioning](https://semver.org/).

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
