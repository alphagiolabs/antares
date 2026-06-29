#!/usr/bin/env node
/**
 * Crea un commit por cada issue implementado de las auditorías.
 * Cada path se asigna a un solo issue (primer commit que lo lista).
 * Uso: node scripts/commit-audit-issues.js
 */
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** @type {{ id: string; msg: string; files: string[] }[]} */
const COMMITS = [
  // --- Security ---
  {
    id: 'SEC-001',
    msg: 'fix(SEC-001): RLS y triggers para flags de perfil Supabase',
    files: ['supabase/migrations/0003_protect_profile_flags.sql'],
  },
  {
    id: 'SEC-002',
    msg: 'fix(SEC-002): sandbox AST en plugins del backend',
    files: [
      'backend/core/plugins.py',
      'tests/test_plugins.py',
    ],
  },
  {
    id: 'SEC-003',
    msg: 'fix(SEC-003): confinamiento de paths y denylist system-sensitive',
    files: [
      'backend/utils/paths.py',
      'backend/utils/validators.py',
      'backend/core/sellador_io.py',
      'backend/handlers/sellador.py',
      'electron/vouched-paths.js',
      'electron/path-params.js',
      'frontend/src/utils/vouchedPaths.ts',
      'frontend/src/utils/vouchedPaths.test.ts',
      'tests/test_path_sanitization.py',
      'tests/test_sec003_handler_confinement.py',
      'tests/test_sec003_path_confinement_selfcheck.py',
      'tests/test-vouched-paths.js',
      'tests/test-ipc-router-prepare-params.js',
    ],
  },
  {
    id: 'SEC-004',
    msg: 'fix(SEC-004): endurecer html_to_pdf contra disclosure de imágenes locales',
    files: ['electron/dialog-handlers.js'],
  },
  {
    id: 'SEC-005',
    msg: 'fix(SEC-005): skeleton de firma de builds Windows y entitlements macOS',
    files: [
      'scripts/enable-build-signing.js',
      'electron-builder.yml',
      '.github/workflows/release.yml',
      'tests/test-enable-build-signing.js',
    ],
  },
  {
    id: 'SEC-006',
    msg: 'fix(SEC-006): bump Electron 33→42 y guard anti-EOL',
    files: [
      'package.json',
      'package-lock.json',
      '.github/dependabot.yml',
      'tests/test-electron-version.js',
    ],
  },
  {
    id: 'SEC-007',
    msg: 'fix(SEC-007): redactar errores sensibles en backend e IPC',
    files: [
      'backend/handlers/common.py',
      'tests/test_backend_main.py',
    ],
  },
  {
    id: 'SEC-008a',
    msg: 'fix(SEC-008a): límite de línea stdin en ipc_protocol',
    files: [
      'backend/ipc_protocol.py',
      'tests/test_ipc_validation.py',
    ],
  },
  {
    id: 'SEC-008b',
    msg: 'fix(SEC-008b): caps DoS en optimizador de imágenes',
    files: [
      'backend/handlers/optimizer.py',
      'frontend/src/components/image-optimizer/utils.ts',
      'frontend/src/components/image-optimizer/index.tsx',
      'frontend/src/components/image-optimizer/utils.test.ts',
      'tests/test_optimizer_handler.py',
    ],
  },
  {
    id: 'SEC-008c',
    msg: 'fix(SEC-008c): caps de longitud en matcher panel-aviso-corte',
    files: [
      'backend/core/panel_aviso_corte/matcher.py',
      'tests/panel_aviso_corte/test_models.py',
    ],
  },
  {
    id: 'SEC-008d',
    msg: 'fix(SEC-008d): límites en list/export de historial',
    files: ['backend/handlers/history.py', 'tests/test_history_export.py'],
  },
  {
    id: 'SEC-009',
    msg: 'fix(SEC-009): tokens Supabase en safeStorage del main process',
    files: [
      'electron/auth-storage.js',
      'frontend/src/lib/supabase-storage.ts',
      'frontend/src/lib/supabase-storage.test.ts',
      'frontend/src/lib/supabase.ts',
      'tests/test-electron-auth-storage.js',
    ],
  },
  {
    id: 'SEC-010',
    msg: 'fix(SEC-010): navigation lockdown y DevTools en producción',
    files: ['electron/window-manager.js'],
  },
  {
    id: 'SEC-011',
    msg: 'fix(SEC-011): endurecer CSP en index.html',
    files: ['frontend/index.html'],
  },
  {
    id: 'SEC-012',
    msg: 'fix(SEC-012): parsing XLSX seguro en renderer (xlsxSafe)',
    files: [
      'frontend/src/utils/xlsxSafe.ts',
      'frontend/src/utils/xlsxSafe.test.ts',
      'frontend/src/components/padron/excel.ts',
      'frontend/src/components/padron/excel.test.ts',
      'frontend/src/components/volantes/utils/import.ts',
      'frontend/src/components/volantes/utils/import.test.ts',
      'frontend/src/components/preview-panel/PreviewPanelView.tsx',
      'frontend/src/components/preview-panel/xlsxParse.test.ts',
      'frontend/src/components/preview-panel/pdfExport.test.ts',
    ],
  },
  {
    id: 'SEC-013',
    msg: 'fix(SEC-013): npm audit no-bloqueante en CI',
    files: ['.github/workflows/ci.yml'],
  },
  {
    id: 'SEC-015',
    msg: 'fix(SEC-015): throttle client-side en auth',
    files: [
      'frontend/src/auth/useAuthThrottle.ts',
      'frontend/src/auth/useAuthThrottle.test.ts',
      'frontend/src/auth/AuthContext.tsx',
    ],
  },
  {
    id: 'SEC-016',
    msg: 'fix(SEC-016): validación de theme y logo-storage IPC',
    files: [
      'frontend/src/utils/themeValidate.ts',
      'frontend/src/utils/themeValidate.test.ts',
      'frontend/src/main.tsx',
      'frontend/public/theme-init.js',
      'electron/logo-storage.js',
      'frontend/src/utils/pdfAssets.ts',
      'tests/test-electron-logo-storage.js',
    ],
  },
  {
    id: 'SEC-017',
    msg: 'fix(SEC-017): endurecer html-sanitizer para PDF',
    files: ['shared/html-sanitizer.js', 'tests/test-html-sanitizer.js'],
  },
  {
    id: 'SEC-018',
    msg: 'fix(SEC-018): deshabilitar isEvalSupported en pdfjs',
    files: [
      'frontend/src/components/sellador/pdfjs.ts',
      'frontend/src/components/formatos/MappingPreviewPanel.tsx',
      'frontend/src/components/formatos/FormatosView.tsx',
    ],
  },
  {
    id: 'SEC-019',
    msg: 'fix(SEC-019): endurecer isDev en preload y exponer auth IPC',
    files: [
      'electron/preload.js',
      'frontend/src/api.ts',
    ],
  },
  // --- Simplifications ---
  {
    id: 'simplification-003',
    msg: 'refactor(simplification-003): mtime en cache key de ubicaciones',
    files: [],
  },
  {
    id: 'simplification-004',
    msg: 'refactor(simplification-004): ErrorBudget dataclass en main loop',
    files: ['backend/main.py'],
  },
  {
    id: 'simplification-005',
    msg: 'refactor(simplification-005): eliminar helpers unreachable en repository',
    files: ['backend/core/repository.py'],
  },
  {
    id: 'simplification-006',
    msg: 'refactor(simplification-006): lru_cache en caches de assets ubicaciones',
    files: [],
  },
  {
    id: 'simplification-007',
    msg: 'refactor(simplification-007): archivar formatos/catalog.json orphan',
    files: [
      'formatos/catalog.json',
      'formatos/_archive/catalog.json-legacy.md',
    ],
  },
  {
    id: 'simplification-008',
    msg: 'refactor(simplification-008): extraer CSS login decor',
    files: [
      'frontend/src/auth/_loginDecor.css',
      'frontend/src/auth/loginDecor.tsx',
    ],
  },
  {
    id: 'simplification-009',
    msg: 'docs(simplification-009): documentar fragilidad CSS date-picker',
    files: ['frontend/src/index.css'],
  },
  {
    id: 'simplification-010',
    msg: 'test(simplification-010): paridad LONG_RUNNING/HEAVY_METHODS',
    files: ['tests/test-backend-heavy-methods-sync.js'],
  },
  {
    id: 'simplification-011',
    msg: 'refactor(simplification-011): renombrar template aniegos-chorrillos',
    files: [
      'backend/templates/aniegos chorrillos.html',
      'backend/templates/aniegos-chorrillos.html',
      'frontend/src/components/preview-panel/PreviewPanel.tsx',
    ],
  },
  {
    id: 'simplification-014',
    msg: 'refactor(simplification-014): unificar detectores hardware limits',
    files: [
      'backend/core/system_limits.py',
      'backend/core/jobs.py',
      'backend/core/scheduler.py',
    ],
  },
  {
    id: 'simplification-015',
    msg: 'refactor(simplification-015): extraer loop-helpers.js',
    files: [
      'scripts/lib/loop-helpers.js',
      'scripts/push-loop.js',
      'scripts/pr-fix-loop.js',
      'scripts/release-loop.js',
      '.github/workflows/pr-fix-loop.yml',
    ],
  },
  {
    id: 'simplification-016',
    msg: 'refactor(simplification-016): split ubicaciones en package',
    files: [
      'backend/core/ubicaciones/__init__.py',
      'backend/core/ubicaciones/_patch.py',
      'backend/core/ubicaciones/cache.py',
      'backend/core/ubicaciones/composer.py',
      'backend/core/ubicaciones/handlers.py',
      'backend/core/ubicaciones/layout.py',
      'backend/core/ubicaciones/map_provider.py',
      'backend/core/ubicaciones/parsers.py',
      'backend/handlers/ubicaciones.py',
      'tests/test_ubicaciones_compose.py',
    ],
  },
  {
    id: 'simplification-018',
    msg: 'refactor(simplification-018): RUN_TYPE desde run_types registry',
    files: ['backend/core/history.py'],
  },
  {
    id: 'simplification-022',
    msg: 'refactor(simplification-022): consolidar triplet key-column',
    files: [
      'backend/core/column_detection.py',
      'backend/handlers/conversion.py',
      'tests/test_rename_audit.py',
    ],
  },
  {
    id: 'simplification-024',
    msg: 'docs(simplification-024): deprecar sistema de plugins',
    files: [
      'backend/core/format_registry.py',
      'backend/handlers/info.py',
    ],
  },
  {
    id: 'simplification-025',
    msg: 'docs(simplification-025): documentar legacy_xobject strategy',
    files: ['backend/core/format_strategies/legacy_xobject.py'],
  },
  // --- Performance ---
  {
    id: 'perf-01',
    msg: 'perf(perf-01): migrar import dinámico xlsx a @e965/xlsx',
    files: [
      'frontend/package.json',
      'frontend/package-lock.json',
      'frontend/vite.config.ts',
    ],
  },
  {
    id: 'perf-02',
    msg: 'perf(perf-02): reutilizar template PDF parseado en visual overlay',
    files: ['backend/core/format_strategies/visual_overlay.py'],
  },
  {
    id: 'perf-04',
    msg: 'perf(perf-04): paralelizar filas en export ubicaciones',
    files: [],
  },
  {
    id: 'perf-05',
    msg: 'perf(perf-05): lazy preload video login y poster WebP',
    files: [
      'frontend/src/auth/AntaresScene.tsx',
      'frontend/public/sign-up-image.webp',
      'frontend/public/sign-up-image.png',
    ],
  },
  {
    id: 'perf-06',
    msg: 'test(perf-06): medición SQLite lock — cerrado sin fix',
    files: ['tests/test_perf_harness.py'],
  },
  {
    id: 'perf-09',
    msg: 'perf(perf-09): cache de imagen de sello en sellador',
    files: [
      'backend/core/sellador.py',
      'tests/test_sellador_handler.py',
    ],
  },
  {
    id: 'perf-10',
    msg: 'perf(perf-10): virtualizar RunList y DatabasePanel',
    files: [
      'frontend/src/components/history/RunList.tsx',
      'frontend/src/components/technical-reports/DatabasePanel.tsx',
    ],
  },
  {
    id: 'perf-11',
    msg: 'perf(perf-11): optimizar favicons y logos',
    files: [
      'frontend/public/favicon-120.png',
      'frontend/public/favicon-144.png',
      'frontend/public/favicon-16.png',
      'frontend/public/favicon-192.png',
      'frontend/public/favicon-228.png',
      'frontend/public/favicon-48.png',
      'frontend/public/favicon-57.png',
      'frontend/public/favicon-72.png',
      'frontend/public/favicon1.png',
      'frontend/public/favicon2.png',
      'frontend/public/logo1.png',
      'frontend/public/logo2.png',
    ],
  },
  {
    id: 'perf-12',
    msg: 'perf(perf-12): eliminar doble resize en preview + caps y LANCZOS',
    files: [
      'backend/core/converter.py',
      'tests/test_converter.py',
    ],
  },
  {
    id: 'perf-13',
    msg: 'perf(perf-13): contar_matches_por_columna en una query',
    files: [
      'backend/core/database.py',
      'tests/test_performance_audit.py',
    ],
  },
  {
    id: 'perf-16',
    msg: 'perf(perf-16): parser IPC stdout para payloads grandes',
    files: [
      'electron/ipc-stdout-parser.js',
      'electron/ipc-router.js',
      'tests/test-electron-ipc-stdout-parser.js',
    ],
  },
  {
    id: 'perf-17',
    msg: 'perf(perf-17): gate stderr forwarding en producción',
    files: ['electron/backend-spawner.js'],
  },
  // --- Residual handlers touched by audits ---
  {
    id: 'audit-residual',
    msg: 'chore(audit): handlers y tests residuales de auditorías',
    files: [
      'backend/handlers/database.py',
      'backend/handlers/formatos.py',
      'backend/handlers/panel_aviso_corte.py',
      'tests/panel_aviso_corte/test_rendering.py',
      'frontend/src/components/reportes-campo/utils/export.test.ts',
    ],
  },
];

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function fileExists(rel) {
  try {
    sh(`git ls-files --error-unmatch "${rel.replace(/"/g, '\\"')}" 2>nul`);
    return true;
  } catch {
    try {
      require('fs').accessSync(path.join(ROOT, rel));
      return true;
    } catch {
      return false;
    }
  }
}

function hasChanges(rel) {
  try {
    const out = sh(`git status --porcelain -- "${rel.replace(/"/g, '\\"')}"`);
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

const committed = new Set();
let created = 0;
let skipped = 0;

for (const { id, msg, files } of COMMITS) {
  const toStage = [];
  for (const f of files) {
    if (committed.has(f)) continue;
    if (!fileExists(f) && !hasChanges(f)) continue;
    if (!hasChanges(f)) {
      // nuevo archivo untracked
      try {
        require('fs').accessSync(path.join(ROOT, f));
        toStage.push(f);
      } catch {
        /* skip */
      }
      continue;
    }
    toStage.push(f);
  }

  if (toStage.length === 0) {
    console.log(`SKIP ${id}: sin archivos pendientes`);
    skipped++;
    continue;
  }

  for (const f of toStage) {
    sh(`git add -- "${f.replace(/"/g, '\\"')}"`);
    committed.add(f);
  }

  try {
    sh(`git commit -m "${msg.replace(/"/g, '\\"')}"`);
    console.log(`OK ${id}: ${toStage.length} archivos`);
    created++;
  } catch (e) {
    console.error(`FAIL ${id}:`, e.stderr || e.message);
    process.exit(1);
  }
}

console.log(`\nCommits creados: ${created}, omitidos: ${skipped}`);
console.log('Estado restante:');
try {
  console.log(sh('git status --short'));
} catch {
  /* */
}
