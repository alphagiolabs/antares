# SEC-007 — Filtración de información sensible al renderer (errores + `stderrTail`)

- **Severidad:** P2 (Media)
- **Categoría:** Sensitive Data Exposure (CWE-209: info leak en errores)
- **Archivos afectados:** `backend/main.py:149-151`, `backend/handlers/common.py:90-95`, `electron/ipc-router.js:226-233` (`backend-status`)

## Vulnerabilidad

Tres puntos filtran internals al renderer:

1. `backend/main.py:149-151` — `_dispatch` envía el mensaje de excepción tal cual al renderer y loguea el traceback completo:
   ```python
   error_msg = f"{type(exc).__name__}: {exc}"
   logger.exception("Error en %s: %s\n%s", method_name, error_msg, traceback.format_exc())
   send_response(None, msg_id, error=error_msg)
   ```
   `exc` puede contener rutas absolutas (`No se encontró: C:\Users\...\secret.pdf`), detalles de BD, mensajes de librerías (Pillow/PyMuPDF/openpyxl) con internals.

2. `backend/handlers/common.py:93-95` — `_validate_path` hace eco del path completo:
   ```python
   if not is_safe_user_path(path):
       msg = f"Path traversal detected: {path}"
       raise ValueError(msg)
   ```
   Un path malicioso o benigno rechazado expone la ruta al renderer/logs.

3. `electron/ipc-router.js:226-233` — `backend-status` devuelve `stderrTail` (las últimas 30 líneas de stderr del backend) al renderer en cada llamada:
   ```js
   ipcMain.handle('backend-status', async () => ({
     state: getState(), ready: isReady(),
     lastError: getLastError(), stderrTail: getStderrTail(),
   }));
   ```
   `_buildUnavailableError()` además embebe `stderrTail` en el mensaje de error que ve el usuario (`ipc-router.js:156,167`). stderr acumula tracebacks con rutas y detalles.

## Impacto

Un renderer comprometido (XSS) — o incluso un usuario abriendo el panel de estado del backend — ve rutas locales del SO, estructura interna y mensajes de error de librerías que pueden revelar versiones, configs o datos. Es info-leak (no RCE), pero facilita el reconocimiento para SEC-003/SEC-004 y reduce la incertidumbre del atacante. P2.

## Fix propuesto (aditivo, conserva la funcionalidad de diagnóstico en dev)

Principio: **detalle solo a stderr (logs locales); al renderer, mensaje genérico localizado**, salvo `ValueError` que ya son user-facing (mensajes de validación intencionalmente legibles). `stderrTail` se redacta/omite en producción (en dev se conserva para diagnóstico).

`backend/main.py` (aditivo):
```python
from backend.utils.i18n import t

def _dispatch(handler, params, msg_id, method_name) -> None:
    try:
        result = handler(params)
        send_response(result, msg_id)
    except Exception as exc:
        # Detalle completo solo a stderr (logs locales, no al renderer).
        logger.exception("Error en %s: %s\n%s", method_name, exc, traceback.format_exc())
        # Al renderer: ValueError/KeyError son errores de validación user-facing
        # (p.ej. "PDF requerido", "Cantidad de sellos inválido") — conservarlos.
        # El resto (OSError, Exception de librerías, etc.) → mensaje genérico.
        if isinstance(exc, (ValueError, KeyError)):
            public_msg = str(exc)
        else:
            public_msg = t("error.internal") if t else "Error interno del backend"
        send_response(None, msg_id, error=public_msg)
```
> Conserva la funcionalidad: los mensajes de validación que la UI muestra hoy (ValueError) siguen llegando idénticos. Solo los errores no-validación pasan a ser genéricos. El diagnóstico completo sigue en stderr/logs.

`backend/handlers/common.py` (aditivo, no hace eco del path):
```python
def _validate_path(path: str) -> None:
    if not path or not isinstance(path, str):
        raise ValueError("Invalid path")               # ← sin eco del valor
    if not is_safe_user_path(path):
        raise ValueError("Path traversal detected")    # ← sin eco del path
```

`electron/ipc-router.js` (aditivo, redacta stderrTail en prod):
```js
const { app } = require('electron');
const _isProd = () => { try { return app.isPackaged; } catch { return false; } };

ipcMain.handle('backend-status', async () => ({
  state: getState(),
  ready: isReady(),
  lastError: getLastError(),
  // En producción no exponemos el stderr tail al renderer (puede contener
  // rutas/internals). En dev se conserva para diagnóstico.
  stderrTail: _isProd() ? '' : getStderrTail(),
}));
```
Y en `_buildUnavailableError()`, gatear el `suffix` de stderrTail con `_isProd()` igualmente (en prod, suffix vacío).

## Testing (sin romper nada)

1. **`tests/test_backend_main.py` / `tests/test_ipc.py`:** un handler que lanza `ValueError("PDF requerido")` → el error del response contiene "PDF requerido" (funcionalidad intacta). Un handler que lanza `OSError("No se encontró: C:\\Users\\x\\secret.pdf")` → el error del response es genérico ("Error interno…"), **sin** la ruta. El traceback sigue en stderr (caplog).
2. **`tests/test_ipc_validation.py` / `tests/test_handlers.py`:** un path con `..` → error "Path traversal detected" **sin** el path en el mensaje. (Actualizar aserciones que esperaban el path eco.)
3. **`tests/test-electron-*.js` que usen `backend-status`:** en prod (`app.isPackaged` mockeado true) → `stderrTail === ''`; en dev → conserva el tail. El `BackendStatusBar` sigue renderizando (su test `useBackendStatus.test.tsx` no depende del contenido del tail).
4. `npm test` completo — sin regresiones en los tests que esperaban mensajes user-facing.
