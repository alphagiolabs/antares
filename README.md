# HidroConvert

> Conversor y renombrador profesional de imágenes — aplicación de escritorio nativa.

## Características

- **Conversión de imágenes**: Soporta JPEG, PNG, WebP, BMP, TIFF, GIF, ICO, PDF con control de calidad y redimensionamiento
- **Renombrado automático**: Motor basado en patrones que integra con base de datos SQLite para renombrar archivos automáticamente
- **Procesamiento por lotes**: Procesa múltiples archivos simultáneamente con barra de progreso en tiempo real
- **Gestión de base de datos**: Importar/exportar datos desde Excel (.xlsx), campos personalizados configurables
- **Interfaz moderna**: Diseño inspirado en Mastercard con colores cálidos, bordes redondeados y tipografía editorial
- **Historial completo**: Registro de todas las ejecuciones con opción de re-ejecutar configuraciones previas
- **Auto-actualizaciones**: Sistema de actualización automática integrado (GitHub Releases)
- **Vista previa de imágenes**: Previsualización de conversiones antes de procesar

## Arquitectura

Aplicación de escritorio construida con:

- **Electron** — Shell nativo de escritorio (Windows, macOS, Linux)
- **React + TypeScript + Vite** — Frontend con TailwindCSS para estilos
- **Python (JSON-RPC over stdin/stdout)** — Backend de procesamiento de imágenes (no FastAPI)
- **SQLite** — Base de datos embebida para catálogo de archivos
- **JSON-RPC over stdin/stdout** — Comunicación segura entre Electron y Python (no HTTP)

### Diferencias con aplicaciones web típicas:
- No hay servidor HTTP (se eliminó FastAPI)
- Comunicación directa por procesos via stdin/stdout
- El backend se ejecuta como proceso hijo de Electron

### Estructura del proyecto

```
hidro_convert/
├── electron/              # Capa de escritorio Electron
│   ├── main.js           # Proceso principal (ventanas, IPC, auto-updater)
│   └── preload.js        # Bridge seguro para el renderer
├── frontend/              # Interfaz de usuario React
│   ├── src/
│   │   ├── App.tsx       # Componente principal con navegación lateral
│   │   ├── api.ts        # Cliente IPC (JSON-RPC)
│   │   ├── components/   # Tabs: Conversión, BD, Apariencia, Historial
│   │   └── i18n.ts       # Internacionalización (español)
│   └── package.json
├── backend/               # Lógica de procesamiento Python
│   ├── main.py           # Entry point (bucle IPC)
│   ├── handlers.py       # Router JSON-RPC → handlers
│   ├── core/             # Lógica de negocio
│   │   ├── converter.py  # Conversión de imágenes (Pillow)
│   │   ├── renamer.py    # Motor de renombrado por patrones
│   │   ├── database.py   # SQLite + import/export Excel
│   │   ├── history.py    # Historial de ejecuciones
│   │   ├── plugins.py    # Sistema de plugins de formato
│   │   ├── config_fields.py  # Campos configurables de BD
│   │   └── config_theme.py   # Temas y presets de apariencia
│   └── utils/            # Utilidades (validadores, paths, i18n)
├── assets/                # Recursos estáticos (logo, iconos)
├── data/                  # Base de datos local (SQLite)
├── scripts/               # Scripts de build y automatización
├── tests/                 # Pruebas automatizadas
├── package.json          # Raíz: scripts npm, configuración electron-builder
├── requirements.txt      # Dependencias Python
└── pyproject.toml        # Configuración Python (pytest, ruff, mypy)
```

## Requisitos

- **Python 3.10+**
- **Node.js 18+**
- **Windows 10/11** (macOS y Linux soportados en teoría, no probados oficialmente)

## Desarrollo

### Instalación rápida

```bash
# Instalar todas las dependencias (Python + Node.js)
npm install
cd frontend && npm install && cd ..
pip install -r requirements.txt
```

### Ejecutar en modo desarrollo

```bash
# Frontend con hot reload (Vite)
cd frontend && npm run dev

# En otra terminal, lanzar Electron
npm run dev
```

### Compilación

```bash
# Build completo (backend + frontend + empaquetado)
npm run build:win

# Solo frontend
npm run build:frontend

# Solo backend (PyInstaller → .exe)
npm run build:backend
```

El ejecutable resultante estará en `dist-electron/HidroConvert-Setup-<version>.exe`.

## Diseño

La aplicación utiliza un sistema de diseño inspirado en **Mastercard**:

| Elemento | Valor | Uso |
|----------|-------|-----|
| Canvas Cream | `#F3F0EE` | Fondo principal |
| Ink Black | `#141413` | Texto, botones primarios, footer |
| Signal Orange | `#CF4500` | Acentos, consentimiento |
| Light Signal Orange | `#F37338` | Indicadores decorativos |
| Lifted Cream | `#FCFBFA` | Superficies elevadas |
| Slate Gray | `#696969` | Texto secundario |

- **Bordes**: Radius agresivos — 20px (botones), 40px (contenedores), 999px (pills)
- **Tipografía**: Sofia Sans (fallback: Inter, Arial) con pesos 450/500/700
- **Sombras**: Elevaciones suaves con spread amplio (`rgba(0,0,0,0.04) 0px 4px 24px`)

Ver `DESIGN.md` para documentación completa del sistema de diseño.

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Frontend hot reload + Electron |
| `npm run build:frontend` | Compilar React → producción |
| `npm run build:backend` | Compilar Python → .exe (PyInstaller) |
| `npm run build:win` | Build completo para Windows |
| `npm run test` | Ejecutar pruebas Python |
| `npm run lint:python` | Lint con Ruff |
| `npm run lint:fix` | Auto-fix con Ruff |

## Code Signing

For production releases, code signing certificates are required:

- **Windows**: Requires a valid code signing certificate. Set `CSC_LINK` environment variable to PFX file path.
- **macOS**: Requires Apple Developer certificate. Set `CSC_LINK` to identity.

Unsigned builds will show security warnings to users.

## Licencia

Proyecto privado.
