# SEC-003 — Path traversal: handlers aceptan paths absolutos fuera de raíces permitidas

- **Severidad:** P1 (Alta)
- **Categoría:** Path Traversal (CWE-22) — lectura y escritura arbitraria de archivos
- **Archivos afectados:**
  - Lectura: `backend/core/sellador_io.py:10-15`, `backend/handlers/sellador.py:72-87` (`sellador_inspect_pdf`, `sellador_render_page`), `backend/handlers/conversion.py:437-444` (`preview_image`, `is_video`), `backend/handlers/database.py` (`db_import`), `backend/handlers/ubicaciones.py:786,847` (`excelPath`), `backend/core/panel_aviso_corte/rendering.py:149-152,368-371` (`image_paths`)
  - Escritura: `backend/handlers/sellador.py:128-133` (`output_path`), `backend/handlers/optimizer.py:91-94,122-123` (`output_path`/`output_folder`), `backend/handlers/formatos.py:27-32` (`output_path`), `backend/handlers/panel_aviso_corte.py:94-95,122-123,172` (`output_path`/`path` Excel), `backend/handlers/database.py` (`db_export`/`db_template`), `backend/handlers/ubicaciones.py:870-871` (`outputDir`), `backend/handlers/conversion.py:359-386` (`destino`)
  - Raíz del problema: `backend/utils/validators.py:25-34` (`is_safe_user_path`)

## Vulnerabilidad

`is_safe_user_path` (el screen de path-traversal en el límite IPC y en el decorador `@validate_params`) es una **denylist de patrones `..`**:

```python
def is_safe_user_path(value: object) -> bool:
    if not isinstance(value, str) or not value:
        return True
    if "\x00" in value: return False
    if "../" in value or "..\\" in value or value.endswith(("/..", "\\..")) or value in ("..", "."):
        return False
    lowered = value.lower()
    return not ("%2e%2e" in lowered or "%252e" in lowered)
```

Esto **no bloquea paths absolutos**. `C:\Windows\System32\drivers\etc\hosts`, `/etc/passwd`, `C:\Users\victim\secret.pdf` pasan el screen. Después, los handlers resuelven y usan el path sin confinarlo a una raíz permitida:

```python
# backend/core/sellador_io.py
def read_user_file(path_value: str, label: str) -> bytes:
    path = Path(path_value).expanduser().resolve()
    if not path.is_file():
        raise ValueError(f"{label} no encontrado")
    return path.read_bytes()          # ← lee cualquier archivo legible por el usuario
```
```python
# backend/handlers/sellador.py — sellador_apply
if output_path:
    destination = Path(output_path).expanduser().resolve()
    if destination.suffix.lower() != ".pdf":
        destination = destination.with_suffix(".pdf")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(result_bytes)   # ← escribe PDF en cualquier ruta
```

El flujo "correcto" es que el renderer obtenga paths del **diálogo nativo** (`dialog_files`/`dialog_folder`/`dialog_save` en `electron/dialog-handlers.js`), que el usuario controla. Pero el backend **confía** en cualquier path que el renderer envíe. Un renderer comprometido (XSS) puede saltarse el diálogo y pedirle al backend que lea/escriba donde quiera.

`formatos.add_uploaded_format` **sí** usa `relative_to` para confinar (`backend/core/formatos.py:302-307`) — confirma que el patrón correcto existe en el codebase pero no se aplicó a los demás handlers.

## Impacto

**Prerrequisito:** renderer comprometido (XSS) o un IPC legítimo malformado. Dado ese prerrequisito:

- **Lectura arbitraria de archivos:** `sellador_apply` con `pdf_path` lee el PDF, lo stampea y lo devuelve en `pdf_base64` → exfiltración de **cualquier PDF** del disco. `preview_image` devuelve `base64` de **cualquier imagen**. `db_import`/`ubicaciones` leen **cualquier Excel** y reflejan datos. `panel_aviso_corte/rendering` incrusta **cualquier imagen** en el documento.
- **Escritura arbitraria (contenido generado por la app):** los handlers de salida escriben PDFs/DOCX/XLSX/ZIPs generados por la app en cualquier ruta accesible al usuario. El contenido no es controlado por el atacante (es output legítimo sanitizado), así que no es RCE, pero permite **sobrescribir archivos del usuario** (p.ej. un PDF con el nombre de un archivo víctima) o **drop archivos** en ubicaciones sensibles.

Combinado con SEC-002 (plugins) o un futuro sink XSS, es un punto de pivote de "acceso limitado" a "acceso a archivos del SO".

## Fix propuesto (aditivo, conserva la funcionalidad)

El challenge: Antares **procesa archivos del usuario en cualquier ubicación del disco** (es un conversor/renombrador). Confinar a `Path.home()` rompería usuarios con archivos en `D:\` o discos externos. La solución correcta es **de dos capas, ambas aditivas**:

### Capa 1 — Helper compartido en `backend/utils/paths.py` (nuevo, no rompe nada)

```python
import os
from pathlib import Path

# Directorios sensibles del sistema que NUNCA deben ser alcanzables desde
# paths del renderer, incluso si el renderer está comprometido. Un path
# legítimo elegido por el usuario (sus fotos, sus PDFs) no cae aquí.
# ponytail: denylist de system dirs — ceiling conocido: no es exhaustiva de
# "todo lo sensible" (p.ej. otros usuarios en C:\Users\<other>), pero bloquea
# los targets de mayor valor (SAM, /etc/shadow, binaries de sistema). Upgrade
# path: vouching de raíces desde el diálogo nativo (Capa 2).
_SYSTEM_SENSITIVE_PREFIXES: tuple[str, ...] = (
    # Windows
    "c:\\windows", "c:\\program files", "c:\\program files (x86)",
    "c:\\programdata", "c:\\$recycle.bin", "c:\\recovery",
    "c:\\system volume information",
    # Unix
    "/etc", "/usr", "/bin", "/sbin", "/var", "/proc", "/sys", "/dev",
    "/root", "/boot", "/lib", "/lib64",
)

def is_system_sensitive_path(resolved: Path) -> bool:
    s = str(resolved).lower()
    return any(s == p or s.startswith(p + ("\\" if "\\" in p else "/")) or s.startswith(p)
               for p in _SYSTEM_SENSITIVE_PREFIXES)

def assert_path_within_root(resolved: Path, allowed_roots: tuple[Path, ...], *, label: str = "Ruta") -> None:
    """Confinamiento positivo: el path resuelto debe estar bajo alguna raíz permitida.

    Lanza ValueError si no. Si allowed_roots es vacío, solo aplica el screen
    de system-sensitive (Capa 1) para no romper flujos donde el renderer aún
    no envía raíces vouched (migración gradual).
    """
    resolved = Path(resolved).resolve()
    if is_system_sensitive_path(resolved):
        raise ValueError(f"{label} apunta a una ubicación del sistema no permitida")
    for root in allowed_roots:
        try:
            resolved.relative_to(Path(root).resolve())
            return
        except ValueError:
            continue
    if allowed_roots:
        raise ValueError(f"{label} fuera de los directorios permitidos")
    # Sin allowed_roots: solo vale el screen de system-sensitive (Capa 1).
```

### Capa 1b — Aplicar en los handlers (aditivo, before de `read_bytes`/`write`/`mkdir`/`to_excel`)

Ejemplo `sellador_io.py` (lectura):
```python
from backend.utils.paths import assert_path_within_root

def read_user_file(path_value: str, label: str, allowed_roots: tuple[Path, ...] = ()) -> bytes:
    path = Path(path_value).expanduser().resolve()
    assert_path_within_root(path, allowed_roots, label=label)   # ← aditivo
    if not path.is_file():
        raise ValueError(f"{label} no encontrado")
    return path.read_bytes()
```
Los callers (`resolve_pdf_bytes`/`resolve_stamp_bytes` y los handlers) pasan `allowed_roots` desde `params.get("allowed_roots") or ()`. Si el renderer no lo envía, `allowed_roots=()` → solo aplica el screen de system dirs (no rompe flujos existentes).

Ejemplo `sellador.py` (escritura):
```python
if output_path:
    destination = Path(output_path).expanduser().resolve()
    assert_path_within_root(destination.parent,
                            tuple(Path(p).resolve() for p in params.get("allowed_roots") or ()),
                            label="Directorio de salida")      # ← aditivo
    if destination.suffix.lower() != ".pdf":
        destination = destination.with_suffix(".pdf")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(result_bytes)
```
Mismo patrón (una línea `assert_path_within_root` antes del efecto) en: `optimizer.py` (`output_path`, `output_folder`), `formatos.py` (`output_path`), `panel_aviso_corte.py` (`output_path`, `path` Excel), `database.py` (`path` import/export/template), `ubicaciones.py` (`excelPath`, `outputDir`), `conversion.py` (`files`, `destino`), `panel_aviso_corte/rendering.py` (`image_paths`).

### Capa 2 — Vouching de raíces desde el diálogo nativo (Electron, aditivo)

En `electron/dialog-handlers.js`, los métodos de diálogo devuelven además la raíz vouched (el main process es el límite de confianza — el usuario eligió la carpeta en el diálogo del SO, no el renderer):

```js
// dialog_folder (pickOnly): devolver folder como raíz vouched
return { handled: true, result: { paths: [], folder: folderPath, vouchedRoots: [folderPath] } };
// dialog_files: la carpeta común padre de los archivos seleccionados
const vouchedRoots = response.filePaths.length
  ? [path.dirname(response.filePaths[0])] : [];
return { handled: true, result: { paths: response.filePaths, vouchedRoots } };
// dialog_save: el directorio destino
return { handled: true, result: { paths: [response.filePath], vouchedRoots: [path.dirname(response.filePath)] } };
```
El renderer reenvía `vouchedRoots` como `allowed_roots` en los handlers posteriores. Así, un renderer comprometido no puede pedirle al backend que opere fuera de lo que el usuario realmente eligió en el diálogo. La Capa 1 (system dirs) protege incluso si el renderer no reenvía raíces.

> Esto **conserva toda la funcionalidad**: el usuario sigue eligiendo archivos/carpetas en cualquier lado del disco con el diálogo nativo; los handlers siguen operando; solo se bloquean paths system y, cuando hay vouching, paths fuera de lo elegido.

## Testing (sin romper nada)

1. **Extender `tests/test_path_sanitization.py`:**
   - path absoluto `C:\Windows\System32\drivers\etc\hosts` → `assert_path_within_root` lanza (system-sensitive), sin `allowed_roots`.
   - path bajo `allowed_roots=(tmp_path,)` → pasa.
   - path fuera de `allowed_roots` → lanza "fuera de los directorios permitidos".
2. **`tests/test_sellador_handler.py`:** `sellador_apply` con `pdf_path`/`output_path` bajo `allowed_roots=[tmp]` → OK (funcionalidad intacta); con `output_path` apuntando a un system dir → error. Reusa el patrón de mocks existente.
3. **`tests/test_optimizer_handler.py`, `tests/test_formatos_handlers.py`, `tests/panel_aviso_corte/test_handlers.py`, `tests/test_database.py`, `tests/test_handlers.py`:** un caso aditivo "output fuera de root → error" + el caso existente sigue pasando.
4. **`tests/test-electron-dialogs.js`:** verificar que los resultados de diálogo incluyen `vouchedRoots` (raíz correcta por método). No cambia el contract existente (`paths` sigue presente).
5. **`tests/test_ipc_validation.py`:** un path absoluto benigno (no system) sigue pasando el screen IPC (no se rompe la validación existente); el confinamiento real vive en el handler.
