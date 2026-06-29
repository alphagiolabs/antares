# Auditoría de Performance — Antares

**Fecha:** 2026-06-27
**Stack:** Electron + React 18 + Vite + TypeScript (frontend) · Python (backend IPC JSON-RPC sobre stdin/stdout) · SQLite local + Supabase (auth) · Pillow/pypdf/pandas (procesamiento)
**Versión auditada:** frontend `0.10.13`

## Reglas seguidas

1. **Conservar TODA la funcionalidad** — ninguna recomendación elimina funciones.
2. **NO eliminar funciones** — todos los fixes son aditivos o refactorizaciones que preservan salida.
3. **Medir antes de optimizar** — donde no hay métrica directa disponible estáticamente, la recomendación es *medir primero* (Profiler / cProfile / EXPLAIN) en lugar de optimizar a ciegas.

---

## Resumen ejecutivo

Antares es una base de código **madura y ya optimizada en varios frentes críticos** (WAL + índices, scheduler bounded, caches LRU+TTL, lazy-loading de las 11 vistas, virtualización del grid de conversión, throttle de notificaciones de progreso). La auditoría se concentró en los **bottlenecks remanentes** y en un **bloqueador del pipeline de build**.

**Conteo por severidad:**

| Severidad | Count | Descripción |
|-----------|-------|-------------|
| **P0** | 1 | Bloquea el build de producción (no se puede medir/deployar bundle) |
| **P1** | 4 | Bottlenecks claros con evidencia directa en código + tamaño |
| **P2** | 7 | Bottlenecks reales que escalan con N (datos, batch, assets) |
| **P3** | 7 | Optimizaciones menores / recomendaciones de *medir primero* |
| **Sin hallazgo** | 3 áreas | Supabase, virtualización de FileGrid, lifecycle de object URLs |

**Total: 19 issues** en `issues/perf-*.md`.

---

## Métricas medidas (estáticas + build)

### Bundle (dist actual — stale, ver perf-01)

> El `dist` medido proviene de un build **anterior exitoso**. El build actual falla en `tsc` (perf-01), por lo que estas métricas son representativas de la composición pero no de un build reproducible hoy.

| Métrica | Valor |
|---------|-------|
| Tamaño total `dist/` | **9.70 MB** (10,167,853 bytes) en 66 archivos |
| Chunk JS más grande | `vendor-data-CgVv8N4N.js` (xlsx) **485 KB** raw |
| `vendor-jspdf` | 380 KB raw |
| `vendor-pdfjs` | 363 KB raw |
| `pdf.worker.min-*.mjs` | **1.37 MB** (worker pdfjs, lazy) |
| `html2canvas.esm-*.js` | 198 KB raw |
| `vendor-ui` (framer-motion + lucide) | 150 KB raw |
| `vendor-react` | 132 KB raw |
| CSS principal | 78 KB |
| Chunks por vista (lazy) | 28–73 KB c/u (ConversionView 73, PreviewPanelView 61, VolantesView 46, FormatosView 45, PadronView 36) |

**Manual chunks** (`vite.config.ts`): vendor-react, vendor-ui, vendor-jspdf, vendor-html-to-image, vendor-pdfjs, vendor-data, vendor-i18n — *bien separados*. Terser con `drop_console`, `drop_debugger`, `pure_funcs`, `passes:2`. `assetsInlineLimit: 4096`. `cssCodeSplit: true`.

### Assets (`frontend/public/`)

| Asset | Tamaño | Nota |
|-------|--------|------|
| `sign-up-video.mp4` | **3.53 MB** | autoplay en login, `preload="auto"` |
| `sign-up-image.png` | **2.00 MB** | poster del video + fallback reduced-motion |
| `favicon1.png` | 112 KB | oversized |
| `favicon2.png` | 108 KB | oversized |
| `logo1.png` / `logo2.png` | 55 / 49 KB | PNG (podrían ser WebP/SVG) |
| 16 variantes favicon (16–228px) | ~400 KB total | boilerplate web innecesario en app desktop |
| `assets/icon.ico` (ventana) | 11 KB | correcto, este es el que usa Electron |

### Templates formatos (builtin, `formatos/*.b64`)

| Template | Tamaño base64 | Re-parseado por cada página generada (perf-02) |
|----------|---------------|------------------------------------------------|
| `televisiva.b64` | 352 KB | sí |
| `template-d.b64` | 327 KB | sí (legacy_xobject) |
| `maquina.b64` | 221 KB | sí |

### Backend (cuentas estructurales)

| Métrica | Valor |
|---------|-------|
| Handlers IPC backend | ~62 métodos (`ipc-methods.js`) |
| Métodos “heavy” (scheduler heavy lane) | 20 |
| Workers scheduler (autodetect) | light 2–4, heavy 2–6, queue = heavy×2 |
| Limite payload IPC | 64 MB (`_MAX_PAYLOAD_SIZE`) |
| Cache preview | LRU 75 entries, TTL 180s |
| Cache map screenshots (ubicaciones) | LRU 40 |
| Cache previews compuestos (ubicaciones) | LRU 80 |
| PRAGMAs SQLite | WAL, synchronous=NORMAL, cache_size=-16000 (16MB), mmap 64MB |
| Índices verificados | `idx_historial_ts`, `idx_historial_run_type`, `idx_imagenes_<col>` por cada campo |

---

## Hallazgos por severidad

Cada hallazgo tiene su issue en `issues/perf-*.md` con: **bottleneck → evidence (métrica) → fix concreto que conserva funcionalidad**.

### P0 — Bloqueador de build

- **perf-01** — `npm run build` roto: 3 imports dinámicos `import('xlsx')` no resuelven tras migrar a `@e965/xlsx`. El `tsc` falla → no se produce bundle → el `dist` actual está stale. **Sin esto, ninguna optimización de bundle es medible ni deployable.**

### P1 — Bottlenecks con evidencia directa

- **perf-02** — Generación de formatos PDF re-parsea el template completo **por cada página** (`PdfReader(io.BytesIO(template_bytes))` dentro del loop `for number in range(desde, hasta+1)`). N páginas → N parses de un PDF de cientos de KB. `max_pages=500`.
- **perf-03** — Ubicaciones: tiles OSM fetcheados **secuencialmente** (loop anidado, un `_http_get` por tile, bloqueante). Viewport 1024px @ zoom 18 ≈ 16 tiles por fila.
- **perf-04** — Ubicaciones: export procesa filas **en serie** (`for … df.iterrows()`), sin paralelismo (a diferencia de `conversion.py` que usa el scheduler). N filas con coords únicas → N fetch+compose+save seriales.
- **perf-05** — Login carga eager **5.5 MB** de media (`sign-up-video.mp4` 3.53 MB con `preload="auto"` + poster `sign-up-image.png` 2.00 MB) al montar la pantalla, antes de interacción. Aumenta cold start y footprint del installer.

### P2 — Escalan con N

- **perf-06** — Lock global de SQLite (`_db_lock` RLock) serializa **todas** las lecturas, desperdiciando la concurrencia de lecturas que permite WAL. El scheduler corre hasta 4 heavy + 4 light threads pero toda lectura DB pasa de a una.
- **perf-07** — Technical reports persistidos en un **archivo JSON único** (`technical_reports.json`): `_save()` reescribe el dict completo por cada create/update/delete; `get_all()` normalizea cada item en cada llamada; filtrado/sorting en Python. Escala O(N) por edit y O(N) por list.
- **perf-08** — Optimizador de imágenes procesa todo en el **renderer (main thread)** con Canvas + `canvas.toBlob`; `compressImage` re-encodea hasta **8 veces** por imagen (loop de quality decreciente). Batches grandes jangean el UI.
- **perf-09** — Sellador re-codifica el sello (LANCZOS @300DPI + zlib RGBA/alpha) **por cada placement**, mientras el path sin placements lo prepara una vez. N sellos → N re-encodes del mismo sello.
- **perf-10** — Listas largas **sin virtualización** excepto `FileGrid` (que usa `react-window` correctamente). Candidatas: technical reports, reportes-campo (photo grid), panel aviso corte (panels), padron. *Medir primero* cuáles pasan de ~200 items.
- **perf-11** — Assets sin optimizar: favicons PNG 112/108 KB, 16 variantes favicon (~400 KB) innecesarias en app desktop, logos PNG. Bloat del installer.

### P3 — Menores / medir primero

- **perf-12** — `convertir_a_preview` hace **doble resize** cuando se provee `resize` explícito (siempre resizea a 400px y luego otra vez al tamaño explícito).
- **perf-13** — `db_detect_key_column` / `_resolve_key_column` emiten **O(columnas)** queries de probing por preview/process_start.
- **perf-14** — `history_delete_many` hace **N commits** (un `delete_run` por id) en lugar de un `DELETE WHERE id IN (...)`.
- **perf-15** — `LANCZOS` sin `reducing_gap` en downscale pesado (preview, conversión, ubicaciones). *Medir* vs `thumbnail(reducing_gap=2.0)`.
- **perf-16** — IPC stdout: `buffer += data.toString()` + `split('\n')` por chunk — overhead en respuestas base64 multi-MB. *Medir* con preview de imagen grande.
- **perf-17** — `_recordStderr` escribe cada chunk a `process.stderr` (+ split/filter) — ruido si el backend loguea verbosamente.
- **perf-18** — `html_to_pdf` crea un **BrowserWindow + session partition nuevos por llamada** (~100–300ms). Aceptable hoy (1 call por export); importaría si se añade render per-item.
- **perf-19** — `React.memo` en solo 3 archivos. Las vistas pesadas usan `useCallback`/`useMemo` pero los children no están memoizados. **No memoizar a ciegas** — perfilar re-renders con React DevTools Profiler primero.

---

## Lo que YA está bien (no requiere acción)

Para evitar re-flaggear trabajo hecho y dar contexto al equipo:

| Área | Estado | Evidencia |
|------|--------|-----------|
| SQLite PRAGMAs | ✅ Óptimo | `repository.py`: WAL, synchronous=NORMAL, cache 16MB, mmap 64MB |
| Índices | ✅ | `idx_historial_ts/run_type`, `idx_imagenes_<col>` por campo; tests en `test_performance_audit.py` |
| Scheduler | ✅ Bounded | light/heavy lanes + semáforo + cola bounded + `SchedulerBusy` |
| Preview cache | ✅ LRU+TTL | `preview_cache.py` (75/180s) |
| Conversión batch | ✅ | chunking adaptativo, `executemany`, batch lookups per-chunk, throttle de notificaciones 0.5s/1% |
| Caches ubicaciones | ✅ | fonts/footer/excel(mtime)/map(LRU40)/composed(LRU80)/pin, prefetch daemon de orientación alterna |
| Lazy loading frontend | ✅ | las 11 vistas con `React.lazy` + `Suspense` (`App.tsx`) |
| Manual chunks | ✅ | vendor split en `vite.config.ts` |
| Virtualización FileGrid | ✅ | `react-window` Grid + celda `React.memo` + ResizeObserver + overscan |
| Auth race protection | ✅ | `AuthContext` con generación anti-race + timeout 5s |
| Supabase | ✅ Mínimo | solo auth (6 archivos); datos de la app en SQLite local; cliente con `persistSession`/`autoRefreshToken`/`detectSessionInUrl:false`; `_fetchProfile` = 1 query `.eq().single()` (no N+1) |
| Object URLs | ✅ | `image-optimizer/utils.ts:476-478` revoca `preview`/`resultPreview` |
| Cold start backend | ✅ | handshake `ready` antes de `init_db`/`load_plugins` (evita kill loops) |
| Health check | ✅ | probe 15s, skip restart si hay requests in-flight (evita matar trabajo del usuario) |

**Tests estructurales de performance existentes** (`tests/test_performance_audit.py`, 10 tests): WAL, cache_size, preview cache bound/TTL, scheduler bound, batch query, payload limit, índices historial, chunk size bounded, límite params 999, dispatch a scheduler, conexión reutilizada. **Recomendación: añadir tests para los fixes de perf-02/06/07/09/14** (assert de 1 parse, concurrencia de lecturas, persistencia SQLite/JSON, 1 encode de sello, 1 commit bulk).

---

## Supabase — sin hallazgo de performance

Supabase se usa **exclusivamente para autenticación** (grep: 6 archivos, todos bajo `auth/` y `lib/supabase.ts`). Los datos funcionales de la app viven en SQLite local; Supabase no recibe queries de datos de la app. Las llamadas son: `getSession`, `signInWithPassword`, `signUp`, `signOut`, `onAuthStateChange`, y un único `_fetchProfile` (`select().eq().single()`). No hay N+1, no hay caching faltante relevante, no hay llamadas redundantes. **Cerrado sin issue.**

---

## Metodología

- **Análisis estático** del código (frontend TS/TSX, backend Python, Electron JS) siguiendo los hot paths end-to-end.
- **Métricas de build/asset** obtenidas con `npm run build`, `Get-ChildItem -Recurse` y medición de tamaños raw/gzip.
- **No se ejecutaron benchmarks en vivo** (la app requiere Electron + backend Python corriendo); donde el bottleneck depende del runtime (re-renders, latencia IPC, tiempo por handler), la recomendación es **medir primero** con la herramienta indicada (React DevTools Profiler, `cProfile`/`tracemalloc`, `console.time`/Performance marks, `EXPLAIN QUERY PLAN`).
- Cada afirmación de leak/bottleneck fue **verificada** contra el código antes de documentarse (p.ej. se descartó una supuesta fuga de object URLs al confirmar que `utils.ts` los revoca).

## Priorización sugerida

1. **perf-01** (P0) — arreglar el build primero; sin bundle no hay nada que medir.
2. **perf-05 + perf-11** (assets) — ganancia inmediata de ~6 MB de installer/cold start, bajo riesgo.
3. **perf-02** (formatos) — ganancia directa en el flujo de generar hasta 500 páginas.
4. **perf-03 + perf-04** (ubicaciones) — latencia de export batch con coords únicas.
5. **perf-06 + perf-07** (data layer) — escalabilidad concurrente / crecimiento de informes.
6. **perf-08 + perf-10** (frontend batch/listas) — responsividad del UI en cargas grandes.
7. Resto (P3) — tras medir.
