# HidroConvert — Linear-Style Redesign

## 1. Overview

Rediseño completo de la interfaz de HidroConvert al estilo **Linear**: oscuro minimalista, aire generoso, jerarquía tipográfica clara, animaciones fluidas y flujos directos sin fricción innecesaria.

**Alcance:** Toda la aplicación (sidebar, tabs de Conversión, Base de Datos, Historial y Apariencia).
**Enfoque:** Opción A — Single Canvas para Conversión; layouts de 2 paneles para Historial; tabla limpia para Base de Datos.

---

## 2. Design Principles

1. **Dense where it matters, airy where it doesn't.** La información crítica (archivos, opciones, preview) usa espacio compacto. Los espacios entre secciones son generosos.
2. **Progressive disclosure.** El dropzone domina la pantalla vacía; al cargar archivos, se contrae y revela opciones. Nada se muestra antes de tiempo.
3. **Inline everything.** Sin modales para acciones principales. Los drawers laterales reemplazan popups y páginas separadas.
4. **Motion is information.** Cada cambio de estado tiene una transición que comunica qué pasó y hacia dónde.
5. **One column to rule them all.** El contenido principal nunca excede 900px, centrado, con aire a los costados.

---

## 3. Architecture & Global Layout

```
┌────────────────────────────────────────────────────────────┐
│  [Sidebar]  │  Header (48px)                               │
│  ─────────  │  ─────────────────────────────────────────── │
│  ⚡         │                                              │
│  📁         │  < Main content (max-width 900px, centered) >│
│  📋         │                                              │
│  🎨         │                                              │
│  ─────────  │                                              │
│  🔍         │                                              │
└────────────────────────────────────────────────────────────┘
```

### 3.1 Sidebar
- **Width:** 64px fijo. No colapsable, no expandible.
- **Background:** transparente (`#0A0A0A`).
- **Items:** Iconos 20px. Inactivo: `#555555`. Hover: `#A0A0A0`. Activo: `#FFFFFF` + punto naranja 4px debajo del icono.
- **Dividers:** Sin líneas visibles entre items. Solo una línea sutil (`#1A1A1A`) antes de las utilidades (búsqueda, toggle sidebar).
- **Tooltips:** Al hover, tooltip con nombre del tab y shortcut (`Ctrl+1`, etc.).
- **Remove:** Texto de labels, botón de colapsar/expandir, versión al pie, copyright.

### 3.2 Header
- **Height:** 48px.
- **Left:** Título contextual en 13px `#A0A0A0` (nombre del tab actual).
- **Right:** Botón de búsqueda estilo pill: fondo `#1A1A1A`, borde `#222222`, texto `#666666`, label "Buscar" + badge `Ctrl+K`.
- **Remove:** Barra de estado grande, breadcrumbs complejos.

### 3.3 Content Area
- **Max-width:** 900px, centrado.
- **Padding top:** 32px.
- **Padding bottom:** 120px (para dejar espacio a la sticky action bar).
- **Background:** `#0A0A0A`.

---

## 4. Conversión Tab — Single Canvas

Todo el flujo en un scroll vertical. Las secciones aparecen y se contraen progresivamente.

### 4.1 Section A: Dropzone (Empty State)

Ocupa `100vh - 48px header` centrado vertical y horizontalmente cuando `files.length === 0`.

- **Icon:** SVG upload animado con CSS keyframes (líneas que se mueven verticalmente, loop 3s).
- **Title:** `Arrastra imágenes aquí` — 24px/500 `#FFFFFF`.
- **Subtitle:** `JPG, PNG, WEBP, TIFF, BMP, GIF` — 14px/400 `#666666`.
- **Buttons:**
  - `Seleccionar archivos` — pill, fondo `#1A1A1A`, borde `#333333`, texto `#FFFFFF` 14px/500. Hover: borde `#FF6B2C`.
  - `Escanear carpeta` — mismo estilo, texto `#A0A0A0`.
- **Drag-over state:** Card se eleva `translateY(-4px)`, borde punteado pasa a sólido `#FF6B2C`, glow sutil `box-shadow: 0 0 30px rgba(255,107,44,0.1)`.

### 4.2 Section B: File Grid (Post-Upload)

Cuando hay archivos, el dropzone se contrae a una **barra compacta** (60px altura, fondo `#111111`, border-radius 12px) con:
- Ícono clip + contador: `12 imágenes` en 13px.
- Botones: `+ Agregar` (ghost), `Limpiar` (ghost rojo sutil).
- Chevron `▼` para expandir/colapsar la grid.

**Grid:**
- `display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px;`
- **Cards:**
  - Thumbnail: aspect-ratio `1:1` (cuadrado), border-radius 8px.
  - No border por defecto. Hover: border `#333333`, `scale(1.02)`, 150ms ease.
  - Selected: border `2px solid #FF6B2C`, `box-shadow: 0 0 0 4px rgba(255,107,44,0.15)`.
  - Multi-select: checkbox esquina superior izquierda (12×12px), aparece en hover o cuando `selectedFiles.size > 0`.
- **Filename:** Debajo de la thumbnail, 11px/500 `#FFFFFF`, truncado con `…`. Sin path completo.
- **Delete button:** Esquina superior derecha, ícono × en círculo `#111111` con backdrop-blur. Aparece en hover.
- **Keyboard:** `Delete`/`Backspace` elimina seleccionados con animación de fade-out.

**Preview Drawer (derecha):**
- Trigger: click en thumbnail.
- Width: 320px fijo.
- Slide-in: `translateX(100% → 0)`, 250ms, `ease-out`.
- Background: `#111111`, border-left: `1px solid #222222`.
- Contents:
  - Imagen grande (object-fit contain, max-height 60%).
  - Metadata: dimensiones, tamaño, formato original — 12px `#666`.
  - Live preview: thumbnail de cómo quedaría con formato/calidad actuales.

### 4.3 Section C: Opciones de Conversión

Card con fondo `#111111`, border-radius 16px, padding 24px.

- **Eyebrow label:** `CONVERSIÓN` — 11px/700 uppercase tracking-widest `#666666`.
- **Formato:**
  - Custom dropdown (no `<select>` nativo). Botón trigger con valor actual y chevron.
  - Dropdown: lista flotante, fondo `#1A1A1A`, borde `#222222`, border-radius 8px.
  - Items: padding 10px 16px, hover fondo `#222222`.
  - Animación: `opacity 0→1`, `translateY(-4px→0)`, 150ms Framer Motion.
- **Calidad:**
  - Slider horizontal. Track: 4px alto, fondo `#222222`, fill `#FF6B2C`.
  - Thumb: 16px círculo `#FFFFFF`, aparece en hover/drag, shadow sutil.
  - Label al lado: `85%` en 14px `#FF6B2C`.
- **Redimensionar:**
  - Toggle switch: track 40×20px, thumb 16px. Animación `translateX` suave.
  - Cuando activo: inputs de ancho/alto aparecen inline con `×` entre ellos.
  - Inputs: 80px ancho, centrados, fondo `#1A1A1A`, borde `#222222`, focus borde `#FF6B2C`.
- **Preservar EXIF:** Toggle switch idéntico. Label a la derecha: `Preservar metadatos EXIF` + sublabel `Cámara, fecha y GPS` en 12px `#666`.

### 4.4 Section D: Renombrado

Card idéntica en estilo a Opciones.

- **Eyebrow:** `NOMBRES`.
- **Presets:** Grid de chips grandes (min-width 120px).
  - Inactivo: fondo `#1A1A1A`, borde `#222222`, texto `#A0A0A0`.
  - Hover: borde `#444444`, texto `#FFFFFF`.
  - Activo: fondo `#FF6B2C`, texto `#FFFFFF`, borde `#FF6B2C`.
  - Cada chip muestra: label 13px/600 + preview del resultado 11px/400 monospace `#666` (inactivo) / `#FFFFFF/75` (activo).
- **Patrón avanzado:**
  - Botón `Editar patrón avanzado` — texto 13px `#FF6B2C`, hover underline.
  - Al expandir (accordion inline): input de patrón + botones de variables (`{codigo}`, `{seq}`, etc.) como pills.
- **Vista previa:**
  - Lista scrollable, max-height 240px.
  - Filas alternadas: `#111111` / `#0A0A0A`.
  - Layout: `origen` (11px `#666` monospace) → `→` (`#333`) → `nuevo` (13px `#FFFFFF` semibold monospace) → badge.
  - Badge `BD`: fondo `rgba(34,197,94,0.1)`, texto `#22C55E`, 10px.
  - Badge `Sin BD`: fondo `rgba(245,158,11,0.1)`, texto `#F59E0B`, 10px.

### 4.5 Section E: Destino y Acción (Sticky Bar)

Barra fija al fondo de la ventana (`position: sticky; bottom: 0`).

- **Height:** ~80px.
- **Background:** `#0A0A0A` con `backdrop-filter: blur(12px)` y border-top `1px solid #222222`.
- **Left:**
  - Input no-editable con ícono carpeta: muestra ruta de destino o "Seleccionar carpeta…" en 13px `#666`.
  - Click abre diálogo del sistema.
- **Right:**
  - Botón principal: `Iniciar conversión` — pill, padding 12px 28px, fondo `#FF6B2C`, texto `#FFFFFF` 15px/500. Hover: `#FF8F5E`. Active: `scale(0.98)`.
  - Disabled: fondo `#222222`, texto `#555555`, cursor not-allowed.
  - Debajo del botón: resumen en 12px `#666` — ej. `12 imágenes → JPEG · 85% · BD + num`.

**Durante ejecución:**
- Botón cambia a `Detener` — fondo transparente, borde `#EF4444`, texto `#EF4444`. Hover: fondo `rgba(239,68,68,0.1)`.
- Progress bar: 2px de alto justo encima de la sticky bar, fondo `#222222`, fill `#FF6B2C`, width animado 300ms.
- Toast flotante (esquina inferior derecha): `3/12 completado` en 13px `#A0A0A0`.

---

## 5. Historial Tab — Two-Pane Layout

```
┌─────────────────────────────────────────────┐
│  HISTORIAL                                  │
├─────────────────────────────────────────────┤
│  ┌────────┐ ┌───────────────────────────┐   │
│  │ List   │ │  Detail                   │   │
│  │ 280px  │ │  (flex-1)                 │   │
│  └────────┘ └───────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 5.1 List Pane (Left)
- Width: 280px fijo.
- Background: `#0A0A0A`.
- Border-right: `1px solid #1A1A1A`.
- Items:
  - Padding: 16px vertical, 20px horizontal.
  - Fecha: 13px/500 `#FFFFFF`.
  - Metadata: formato (pill), cantidad de archivos, calidad — 11px `#666`.
  - Hover: fondo `#111111`.
  - Selected: borde-left 2px `#FF6B2C`, fondo `#111111`.
- Empty state: icono + "Aún no hay conversiones" 14px `#666`.

### 5.2 Detail Pane (Right)
- Padding: 32px.
- Header: `Ejecución #{id}` — 20px/600.
- Stats grid: 2×2 cards con fondo `#111111`, border-radius 12px.
  - Label: 11px uppercase `#666`.
  - Value: 18px/600 `#FFFFFF` (o color semántico: verde/rojo para OK/Err).
- Pattern: código block con fondo `#1A1A1A`, border-radius 8px, padding 12px.
- Files list: max-height 320px, scrollable. Items 12px monospace `#A0A0A0`.
- Actions: `Re-ejecutar` (primary pill), `Eliminar` (ghost rojo).

---

## 6. Base de Datos Tab — Clean Table

- Table header: 11px/700 uppercase tracking-widest `#666666`, padding 12px 16px.
- Rows: padding 12px 16px, 14px/400 `#FFFFFF`. Hover: fondo `#111111`.
- No vertical borders. Horizontal separators: `1px solid #1A1A1A`.
- Search: input pill en top, placeholder "Buscar registros…", fondo `#1A1A1A`, border-radius 24px.
- Pagination: texto "Mostrando 1-50 de 234" + flechas `<` `>` como botones circulares 28px.
- No filtros complejos visibles por defecto. Advanced filters en un drawer lateral si se necesita.

---

## 7. Apariencia Tab — Minimal

- Lista vertical de opciones. Cada fila: label izquierda + control derecha.
- **Tema:** Segmented control (3 opciones: Oscuro / Claro / Sistema). Estilo pills juntas.
- **Color de acento:** 3 círculos seleccionables (naranja, azul, verde).
- **Densidad:** Toggle (Compacta / Cómoda).
- **Preview:** Miniatura de la app (mockup de la barra sticky + botón) que refleja el acento elegido en tiempo real.

---

## 8. Animations & Micro-interactions

| Interaction | Animation | Tech |
|---|---|---|
| Tab switch | Crossfade 200ms | Framer Motion `AnimatePresence` |
| Grid item appear | Stagger: fadeIn + translateY(8px), 30ms delay | Framer Motion `variants` |
| Card hover | `scale(1.02)`, border appears 150ms | CSS transition |
| Checkbox select | `scale(0→1)` 150ms | Framer Motion |
| Preview drawer | `translateX(100%→0)` 250ms ease-out | Framer Motion |
| Custom dropdown | `opacity(0→1)`, `translateY(-4px→0)` 150ms | Framer Motion |
| Progress bar | `width` transition 300ms linear | CSS transition |
| Toast | `translateY(16px→0)` + fadeIn 300ms | Framer Motion |
| File delete | `opacity(1→0)`, `scale(1→0.95)` 200ms, then remove | Framer Motion `exit` |
| Sticky bar appear | `translateY(100%→0)` 300ms when scrolling past options | Framer Motion |
| Button press | `scale(0.98)` 100ms | CSS `:active` |
| Input focus | border-color + `box-shadow: 0 0 0 3px rgba(255,107,44,0.15)` | CSS transition |
| Sidebar tooltip | `opacity(0→1)` + `translateY(4px→0)` 100ms | CSS transition |

**Easing principal:** `cubic-bezier(0.25, 0.1, 0.25, 1)` (suave, similar a Linear).

---

## 9. Color Tokens & Typography

### 9.1 Color Palette

| Token | Hex | Usage |
|---|---|---|
| `--bg-base` | `#0A0A0A` | App background |
| `--bg-surface` | `#111111` | Cards, panels, drawers |
| `--bg-elevated` | `#1A1A1A` | Hover states, inputs, secondary buttons |
| `--text-primary` | `#FFFFFF` | Headings, primary text |
| `--text-secondary` | `#A0A0A0` | Descriptions, metadata |
| `--text-muted` | `#555555` | Placeholders, inactive icons |
| `--accent` | `#FF6B2C` | Primary actions, active states, progress |
| `--accent-hover` | `#FF8F5E` | Primary button hover |
| `--accent-glow` | `rgba(255,107,44,0.25)` | Focus shadows |
| `--border-subtle` | `#1A1A1A` | Section dividers |
| `--border-medium` | `#2A2A2A` | Input borders, card borders on hover |
| `--success` | `#22C55E` | Success badges, completed states |
| `--warning` | `#F59E0B` | Warning badges, missing DB match |
| `--error` | `#EF4444` | Errors, destructive actions |

### 9.2 Typography

- **Font:** `Sofia Sans` (ya importada), fallback `Inter, Arial, sans-serif`.
- **Weights:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold).
- **Scale:**
  - Display/Empty title: 24px/500
  - Section title: 20px/600
  - Card eyebrow: 11px/700 uppercase tracking-[0.15em]
  - Body: 14px/400
  - Small/Meta: 12px/400
  - Tiny/Badges: 10px/500

---

## 10. Dependencies

### New
- `framer-motion` — animaciones de layout, presencia, stagger, drawers.

### Existing (keep)
- `react`, `react-dom`, `tailwindcss`, `typescript`, `vite`.
- `i18next`, `react-i18next` — internacionalización.

### Remove / Not needed
- No Radix UI necesario por ahora (los custom dropdowns y toggles se implementan con divs + Framer Motion).
- No nuevas librerías de iconos (se mantienen los SVG inline actuales).

---

## 11. File Structure (Proposed)

```
frontend/src/
├── App.tsx                      # Layout global: sidebar + header + content router
├── main.tsx
├── api.ts
├── types.ts
├── i18n.ts
├── index.css                    # Tokens CSS, keyframes, utilidades Tailwind
├── components/
│   ├── ui/                      # Componentes atómicos reutilizables
│   │   ├── Button.tsx
│   │   ├── Badge.tsx
│   │   ├── Toggle.tsx           # NEW: switch estilo iOS/Linear
│   │   ├── Slider.tsx           # NEW: calidad slider custom
│   │   ├── Dropdown.tsx         # NEW: reemplaza <select> nativo
│   │   ├── Input.tsx            # NEW: input estilizado base
│   │   ├── Card.tsx             # NEW: wrapper con fondo #111 + radius
│   │   ├── EmptyState.tsx       # UPDATE: con animación CSS
│   │   ├── Toast.tsx
│   │   ├── Dialog.tsx
│   │   ├── Skeleton.tsx
│   │   └── CommandPalette.tsx
│   ├── layout/
│   │   ├── Sidebar.tsx          # NEW: iconos solos, tooltips
│   │   ├── Header.tsx           # NEW: 48px, título + search pill
│   │   └── StickyActionBar.tsx  # NEW: barra fija destino + botón
│   ├── conversion/
│   │   ├── ConversionView.tsx   # NEW: orquesta Single Canvas
│   │   ├── Dropzone.tsx         # NEW: empty state + compact bar
│   │   ├── FileGrid.tsx         # NEW: grid con selección + drawer
│   │   ├── FileCard.tsx         # NEW: card individual de imagen
│   │   ├── PreviewDrawer.tsx    # NEW: drawer lateral 320px
│   │   ├── OptionsCard.tsx      # NEW: formato, calidad, resize, exif
│   │   ├── RenameCard.tsx       # NEW: presets + preview + patrón
│   │   └── ProgressBar.tsx      # NEW: barra fina 2px
│   ├── history/
│   │   ├── HistoryView.tsx      # UPDATE: 2-pane layout
│   │   ├── RunList.tsx          # NEW: lista izquierda
│   │   └── RunDetail.tsx        # NEW: detalle derecho
│   ├── database/
│   │   └── DatabaseView.tsx     # UPDATE: tabla limpia + search pill
│   └── settings/
│       └── AppearanceView.tsx   # UPDATE: minimal inline settings
├── hooks/
│   └── (mantener existentes)
└── locales/
    └── (mantener existentes)
```

---

## 12. Non-Goals / Out of Scope

- No rediseño del backend ni de la API.
- No cambios en la lógica de conversión, renombrado o base de datos.
- No se agrega tema claro en esta iteración (solo se prepara la infraestructura de tokens).
- No se reemplaza Electron ni se cambia el bundler.

---

## 13. Success Criteria

1. La vista de Conversión muestra todo el flujo en un solo scroll sin modales.
2. El dropzone empty state es visualmente impactante y guía al usuario.
3. Las transiciones entre estados (vacío → con archivos → procesando) son fluidas y claras.
4. El sidebar ocupa 64px, sin texto, y se siente ligero.
5. Ningún elemento visual se ve "apretado" — hay aire suficiente entre secciones.
6. Las animaciones no bloquean la interacción (duración < 300ms para micro-interacciones).
