import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'node:path'

const sharedHtmlSanitizerPath = path.resolve(__dirname, '../shared/html-sanitizer.js')

const sharedHtmlSanitizerPlugin = {
  name: 'shared-html-sanitizer',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (path.normalize(id.split('?')[0]) !== path.normalize(sharedHtmlSanitizerPath)) return null

    return code.replace(
      'module.exports = { sanitizeHtmlForPdf, CSP_META };',
      'export { sanitizeHtmlForPdf, CSP_META };',
    )
  },
}

export default defineConfig(({ mode }) => ({
  plugins: [
    sharedHtmlSanitizerPlugin,
    react({
      babel: {
        plugins: mode === 'production'
          ? [['babel-plugin-transform-react-remove-prop-types', { removeImport: true }]]
          : [],
      },
    }),
    mode === 'analyze' && visualizer({ open: true, gzipSize: true, brotliSize: true }),
  ],
  base: mode === 'development' ? '/' : './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: mode === 'development',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
        passes: 2,
      },
      mangle: {
        safari10: true,
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['framer-motion', 'lucide-react'],
          'vendor-jspdf': ['jspdf'],
          'vendor-html-to-image': ['html-to-image'],
          'vendor-pdfjs': ['pdfjs-dist'],
          'vendor-data': ['xlsx'],
          'vendor-i18n': ['i18next', 'react-i18next'],
        },
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name || ''
          if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(info)) {
            return 'assets/images/[name]-[hash][extname]'
          }
          if (/\.css$/i.test(info)) {
            return 'assets/css/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
      },
    },
    chunkSizeWarningLimit: 500,
    reportCompressedSize: false,
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
  },
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    legalComments: 'none',
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'framer-motion',
      'lucide-react',
      'i18next',
      'react-i18next',
      'jspdf',
      'html-to-image',
    ],
    exclude: ['pdfjs-dist'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
}))
